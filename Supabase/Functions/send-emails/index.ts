// Edge Function "send-emails": turns rows in public.notifications (email=true, emailed_at is null) into real emails via Resend.
// WHY: browsers/Postgres cannot send mail safely; this tiny server-side function does, and marks rows sent so nothing repeats.
// TRIGGER: Dashboard > Database > Webhooks > table notifications, event INSERT -> this function (add header x-webhook-secret).
//          Also schedule it every 5 min (Integrations > Cron) as a safety net for failed sends.
// SECRETS: supabase secrets set RESEND_API_KEY=... FROM_EMAIL="AstroVault <support@yourdomain.com>" SITE_URL=https://you.github.io/astrovault WEBHOOK_SECRET=long-random
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);  // service role lives ONLY here
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) return new Response("forbidden", { status: 403 });
  const { data: rows } = await sb.from("notifications").select("id,title,body,link,profiles(email,username)")
    .eq("email", true).is("emailed_at", null).order("created_at").limit(25);
  let sent = 0;
  for (const n of rows ?? []) {
    const p: any = n.profiles; if (!p?.email) continue;
    const url = Deno.env.get("SITE_URL") + (n.link ? "#/" + (n.link.startsWith("ticket:") ? "support" : n.link.split(":")[0]) : "");
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e5e5ea;border-radius:14px">
      <h2 style="margin:0 0 8px">${esc(n.title)}</h2><p style="color:#555;line-height:1.5">${esc(n.body)}</p>
      <p><a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Open AstroVault</a></p>
      <p style="color:#999;font-size:12px">You get this because notifications are on for your account. Never share your password or codes with anyone.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", { method: "POST",
      headers: { Authorization: "Bearer " + Deno.env.get("RESEND_API_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("FROM_EMAIL"), to: p.email, subject: n.title, html }) });
    if (r.ok) { await sb.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("id", n.id); sent++; }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
