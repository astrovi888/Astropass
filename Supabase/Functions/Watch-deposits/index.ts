// Edge Function "watch-deposits": credits wallets automatically when a customer's exact-amount deposit shows up.
// HOW: customer creates an invoice (exact amount like 10.037 USDT, 30 min). Every minute this function looks for incoming
//      transfers of exactly that amount and calls credit_deposit() (service role only, idempotent per transaction).
// SAFE: receive-only addresses, NO private keys anywhere. A read-only Binance key is optional (Binance Pay, experimental).
// SETUP (5 min): supabase functions deploy watch-deposits --no-verify-jwt
//   supabase secrets set WEBHOOK_SECRET=long-random   (optional: TRONGRID_API_KEY, BSC_RPC_URL, BINANCE_API_KEY, BINANCE_API_SECRET)
//   Dashboard > Integrations > Cron: new job every 1 minute, type "HTTP request" POST to the function URL, header x-webhook-secret.
//   Then in the app: Staff > Payments > edit the crypto method > tick "Credit paid invoices automatically".
// SOURCES: TronGrid public API (TRC20 USDT), any BSC JSON-RPC node (BEP20 USDT; default is Binance's public node).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);   // service role stays in this function only
const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";   // ERC20 Transfer(address,address,uint256)
const BSC_RPC = Deno.env.get("BSC_RPC_URL") || "https://bsc-dataseed.binance.org";
type Inv = { id: string; network: string; address: string; amount: string; created_at: string };
const milli = (a: string | number) => Math.round(Number(a) * 1000);                      // compare amounts as whole thousandths: no float drift
const credit = async (i: Inv, tx: string) => (await sb.rpc("credit_deposit", { p_invoice: i.id, p_tx: tx, p_amount: Number(i.amount) })).data === true;
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) return json({ error: "forbidden" }, 403);
  await sb.rpc("expire_deposits");
  const { data: inv } = await sb.from("deposit_invoices").select("id,network,address,amount,created_at").eq("status", "pending");
  if (!inv?.length) return json({ pending: 0 });
  const by = (n: string) => (inv as Inv[]).filter((i) => i.network === n);
  const res: Record<string, unknown> = { pending: inv.length, credited: 0, errors: [] as string[] };
  for (const [name, fn, list] of [["tron", tron, by("TRC20")], ["bsc", bsc, by("BEP20")], ["binance", binancePay, by("binance_pay")]] as const) {
    try { res.credited = (res.credited as number) + await fn(list as Inv[]); } catch (e) { (res.errors as string[]).push(name + ": " + e); }
  }
  return json(res);
});

// TRON: list recent confirmed USDT transfers TO each address; match exact amount (6 decimals -> thousandths) after invoice creation.
async function tron(list: Inv[]) {
  let n = 0; const key = Deno.env.get("TRONGRID_API_KEY");
  for (const a of new Set(list.map((i) => i.address))) {
    const r = await fetch(`https://api.trongrid.io/v1/accounts/${a}/transactions/trc20?only_to=true&only_confirmed=true&limit=100&contract_address=${USDT_TRC20}`,
      { headers: key ? { "TRON-PRO-API-KEY": key } : {} });
    if (!r.ok) throw new Error("trongrid " + r.status);
    for (const t of (await r.json()).data ?? []) {
      const v = BigInt(t.value); if (t.to !== a || v % 1000n !== 0n) continue;
      const m = Number(v / 1000n);
      const i = list.find((x) => x.address === a && milli(x.amount) === m && t.block_timestamp >= new Date(x.created_at).getTime() - 60000);
      if (i && await credit(i, t.transaction_id)) n++;
    }
  }
  return n;
}

// BSC: scan new blocks since the saved cursor for USDT Transfer logs to our addresses (18 decimals -> thousandths).
async function bsc(list: Inv[]) {
  if (!list.length) return 0;
  const rpc = async (method: string, params: unknown[]) => {
    const r = await fetch(BSC_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
  };
  const head = parseInt(await rpc("eth_blockNumber", []), 16) - 3;                       // 3-block safety margin
  const { data: cur } = await sb.from("chain_cursors").select("last_block").eq("network", "BEP20").maybeSingle();
  let from = cur ? Number(cur.last_block) + 1 : head - 300;
  if (head - from > 3000) from = head - 3000;                                              // bounded work per run
  if (from > head) return 0;
  const addrs = [...new Set(list.map((i) => i.address.toLowerCase()))];
  let n = 0;
  for (let s = from; s <= head; s += 1000) {
    const e = Math.min(s + 999, head);
    const logs = await rpc("eth_getLogs", [{ fromBlock: "0x" + s.toString(16), toBlock: "0x" + e.toString(16), address: USDT_BSC,
      topics: [TRANSFER, null, addrs.map((a) => "0x" + a.slice(2).padStart(64, "0"))] }]);
    for (const l of logs) {
      const to = "0x" + l.topics[2].slice(26), w = BigInt(l.data); if (w % (10n ** 15n) !== 0n) continue;
      const i = list.find((x) => x.address.toLowerCase() === to && milli(x.amount) === Number(w / (10n ** 15n)));
      if (i && await credit(i, l.transactionHash)) n++;
    }
  }
  await sb.from("chain_cursors").upsert({ network: "BEP20", last_block: head });
  return n;
}

// Binance Pay (EXPERIMENTAL, untested): read-only key polls Pay history for an incoming USDT payment of the exact invoice amount.
// Needs secrets BINANCE_API_KEY / BINANCE_API_SECRET (create a READ-ONLY key, withdrawals disabled). Binance may block some server regions.
async function binancePay(list: Inv[]) {
  const key = Deno.env.get("BINANCE_API_KEY"), sec = Deno.env.get("BINANCE_API_SECRET");
  if (!list.length || !key || !sec) return 0;
  const now = Date.now(), qs = `startTime=${now - 3 * 3600e3}&endTime=${now}&limit=100&recvWindow=10000&timestamp=${now}`;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(sec), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(qs)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const r = await fetch(`https://api.binance.com/sapi/v1/pay/transactions?${qs}&signature=${sig}`, { headers: { "X-MBX-APIKEY": key } });
  if (!r.ok) throw new Error("binance " + r.status);
  let n = 0;
  for (const t of (await r.json()).data ?? []) {
    if (Number(t.amount) <= 0 || t.currency !== "USDT") continue;                          // incoming USDT only
    const i = list.find((x) => milli(x.amount) === milli(t.amount) && t.transactionTime >= new Date(x.created_at).getTime() - 60000);
    if (i && await credit(i, String(t.transactionId))) n++;
  }
  return n;
}
