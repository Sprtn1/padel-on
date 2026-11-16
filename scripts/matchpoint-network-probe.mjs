// Network-only diagnostic. Zero MatchPoint API requests, zero database calls.
// Never print credentials or a raw response body.
import dns from 'node:dns/promises';
import tls from 'node:tls';

const origin=process.env.MATCHPOINT_HOST;
if(!origin)throw Error('MATCHPOINT_HOST secret is missing');
let url;
try{url=new URL(origin);}catch{throw Error('Invalid MATCHPOINT_HOST URL');}
if(url.protocol!=='https:')throw Error('MatchPoint requires HTTPS');
const host=url.hostname;
const safeErr=err=>err?.code||err?.cause?.code||err?.name||'UNKNOWN_ERROR';

console.log('Checking configured MatchPoint host (no API token transmitted)...');
try{
 const addresses=await dns.lookup(host,{all:true});
 console.log('DNS: success; '+addresses.length+' address(es), address families: '+
   [...new Set(addresses.map(v=>'IPv'+v.family))].join(', '));
}catch(e){
 console.log('DNS: failed with '+safeErr(e));
 process.exitCode=1;
}

try{
 const details=await new Promise((resolve,reject)=>{
  const socket=tls.connect({host,servername:host,port:443,timeout:9000,
    rejectUnauthorized:true},()=>{
   const data={protocol:socket.getProtocol(),authorized:socket.authorized};
   socket.end();resolve(data);
  });
  socket.once('error',reject);
  socket.once('timeout',()=>{socket.destroy();reject(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'}));});
 });
 console.log('TLS: success; protocol '+details.protocol+'; verified certificate: '+details.authorized);
}catch(e){
 console.log('TLS: failed with '+safeErr(e));
 process.exitCode=1;
}

try{
 const response=await fetch(url.origin+'/',{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(10000)});
 console.log('Website root HEAD: HTTP '+response.status+'; network reachable (not an API request).');
}catch(e){
 console.log('Website root HEAD: failed with '+safeErr(e)+'; cause '+safeErr(e.cause));
 process.exitCode=1;
}
