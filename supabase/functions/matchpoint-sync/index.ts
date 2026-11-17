// Supabase Cron endpoint. Credentials stay in Vault and this server runtime.
import {runMatchPointSync,matchpointLebanonSlot} from "../../../scripts/matchpoint-sync.mjs";

const json=(value:object,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const root="https://qonscbdbawmvhcdfcvlo.supabase.co";
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 const timestamp=req.headers.get("X-Padelon-Cron-Time");
 const signature=req.headers.get("X-Padelon-Cron-Signature");
 if(!timestamp||!/^\d{10}$/.test(timestamp)||!signature||!(/^[0-9a-f]{64}$/.test(signature)))return json({error:"Unauthorized"},401);
 const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!service)return json({error:"Server credential unavailable"},503);
 const headers={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"};
 try{
  const res=await fetch(root+"/rest/v1/rpc/matchpoint_get_cron_config",{method:"POST",headers,body:JSON.stringify({p_timestamp:timestamp,p_signature:signature}),redirect:"error"});
  if(!res.ok)return json({error:"Server configuration unavailable"},503);
  const cfg=await res.json();
  if(!cfg)return json({error:"Unauthorized or not configured"},401);
  if(cfg.paused!==false)return json({skipped:true,reason:"paused"});
  const now=new Date();
  if(!matchpointLebanonSlot(now))return json({skipped:true,reason:"outside_venue_hours"});
  // Only schedule/court metadata; existing importer enforces quota and protects finance.
  const result=await runMatchPointSync({
   env:{MATCHPOINT_ENABLED:"true",MATCHPOINT_FEEDS:"bookings",MATCHPOINT_EXTENDED_SCAN:"false",
    MATCHPOINT_LOOKAHEAD_DAYS:"7",MATCHPOINT_HOST:"https://padelon-lb.matchpoint.com.es",
    MATCHPOINT_API_TOKEN:cfg.token,MATCHPOINT_COURT_MAP_JSON:JSON.stringify(cfg.map),
    MATCHPOINT_CENTER_CODE:cfg.center||"",SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:service},
   now,
   logger:{log:(...args:unknown[])=>console.log(...args),warn:()=>console.warn("MatchPoint import warning")}
  });
  return json(result,result?.writeFailures?503:200);
 }catch(err){
  // Never echo provider bodies, configuration credentials, or customer data.
  const detail=err instanceof Error?err.message:"";
  if(detail.includes("daily quota or local time-slot already used"))return json({skipped:true,reason:"quota_or_duplicate"});
  const statusMatch=detail.match(/MatchPoint bookings HTTP (\d{3})/);
  const safe=statusMatch?"MatchPoint provider HTTP "+statusMatch[1]:"MatchPoint synchronization failed; inspect backend logs";
  console.error(safe);
  // Preserve last successful sync timestamp and existing review issues.
  await fetch(root+"/rest/v1/matchpoint_sync_status?id=eq.1",{method:"PATCH",headers,body:JSON.stringify({last_error:safe})}).catch(()=>{});
  return json({error:safe},503);
 }
});
