// ===== EDIT THESE (then see README / NEXT_STEPS.md) =====
window.AV_CONFIG={
  SUPABASE_URL:"https://YOUR-PROJECT.supabase.co",
  SUPABASE_KEY:"YOUR-PUBLISHABLE-OR-ANON-KEY",   // publishable/anon key ONLY. Never the service_role key.
  BRAND:"AstroVault", CUR:"$",
  CONTACT:{label:"@axtroviii",url:"https://instagram.com/axtroviii"},
  CATEGORIES:[{id:"ai",label:"AI Tools"},{id:"entertainment",label:"Entertainment"},{id:"productivity",label:"Productivity"}],
  TOPUP:{min:5,max:500,presets:[5,10,25,50],eta:"usually within a few hours",
    methods:[ // kind "address": shows a wallet address; "link": button to a pay page; "chat": contact us
      {id:"usdt",label:"USDT (TRC20)",kind:"address",address:"",refLabel:"Transaction ID"},
      {id:"link",label:"Payment link",kind:"link",url:"",refLabel:"Receipt / reference"},
      {id:"chat",label:"Pay via message",kind:"chat",refLabel:"Name you paid with"}]}
};
