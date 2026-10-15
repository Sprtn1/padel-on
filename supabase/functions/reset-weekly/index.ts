// Deploy: supabase functions deploy reset-weekly
// Configure RESET_CODE as a private Supabase Edge Function secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info',
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const answer=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return answer({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,code=Deno.env.get('RESET_CODE');
  if(!url||!serviceKey||!code)return answer({error:'Backend is not configured'},503);
  const bearer=req.headers.get('Authorization')||'';
  const jwt=bearer.replace(/^Bearer\s+/i,'');
  if(!jwt)return answer({error:'Sign in required'},401);
  const supabase=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:identity,error:userError}=await supabase.auth.getUser(jwt);
  if(userError||!identity.user)return answer({error:'Invalid session'},401);
  const userId=identity.user.id;
  const {data:profile}=await supabase.from('staff_profiles').select('role').eq('id',userId).maybeSingle();
  if(profile?.role!=='admin')return answer({error:'Administrator access required'},403);
  const {data:attempts,error:attemptError}=await supabase.from('reset_attempts').select('id')
    .eq('actor',userId).eq('success',false).gte('attempted_at',new Date(Date.now()-15*60_000).toISOString()).limit(5);
  if(attemptError)return answer({error:'Could not validate request'},503);
  if((attempts||[]).length>=5)return answer({error:'Too many attempts. Try again in 15 minutes.'},429);
  const body=await req.json();
  // Constant-time comparison of provided code and backend-only secret.
  const actual=String(body.code||'');let diff=actual.length^code.length;
  for(let i=0;i<Math.max(actual.length,code.length);i++)diff |= (actual.charCodeAt(i)||0)^(code.charCodeAt(i)||0);
  const valid=diff===0;
  const {error:logError}=await supabase.from('reset_attempts').insert({actor:userId,success:valid});
  if(logError)return answer({error:'Could not validate request'},503);
  if(!valid)return answer({error:'Incorrect reset code'},403);
  const member=body.member_id||null;
  if(member!==null&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(member))return answer({error:'Invalid member ID'},400);
  const {data,error}=await supabase.rpc('admin_reset_week',{p_actor:userId,p_member_id:member});
  if(error)throw error;
  return answer({ok:true,reset_count:data});
 }catch(e){return answer({error:e instanceof Error?e.message:'Server error'},400)}
});
