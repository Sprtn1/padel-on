// Strict, privacy-preserving Query API response recognition.
// MatchPoint may return PascalCase envelope fields on some club instances.
// Never silently import pages if a success/error/hasMore/total flag is unknown.
import {matchPointField} from './matchpoint-normalize.js';

const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const get=(o,...names)=>{
 for(const n of names){const v=matchPointField(o,n);if(v!==undefined)return v;}
 return undefined;
};
const keyNames=[
 'ok','success','successful','isSuccess','isSuccessful',
 'hasMore','hasMoreResults','more','hasNextPage','isLastPage',
 'error','errors','total','totalCount','count','recordCount',
 'offset','limit','pageSize','page','data','results','bookings',
 'items','records'
];
export function matchPointEnvelopeDiagnostics(payload){
 if(!object(payload))return {rootType:Array.isArray(payload)?'array':typeof payload,recognizedFields:[],topLevelArrayCount:0};
 const names=[];
 const controlValues={};
 for(const key of keyNames){
  const value=get(payload,key);
  if(value===undefined)continue;
  names.push(key);
  // Only expose primitive pagination/control flags and their whitelisted
  // names. Never expose customer names, IDs, messages or response bodies.
  if(typeof value==='boolean'||(typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=1000000)){
   controlValues[key]=value;
  }else if(value===null)controlValues[key]='null';
  else if(Array.isArray(value))controlValues[key]='array';
  else controlValues[key]=typeof value;
 }
 return {
  rootType:'object',
  recognizedFields:names,
  controlValues,
  topLevelArrayCount:Object.values(payload).filter(Array.isArray).length
 };
}
export class MatchPointPageError extends Error{
 constructor(message){super(message);this.name='MatchPointPageError';}
}
const deny=s=>{throw new MatchPointPageError(s);};
export function parseMatchPointPage(payload,{feed='bookings',limit=1000}={}){
 if(!object(payload))deny('MatchPoint API page is not a JSON object');
 if(!['bookings','matches','activities'].includes(feed))deny('Unknown MatchPoint feed');
 if(!Number.isInteger(limit)||limit<1||limit>1000)deny('Invalid page limit');
 const error=get(payload,'error','errors');
 if(error!==undefined&&error!==null&&error!==false&&error!==''&&
    !(Array.isArray(error)&&error.length===0))
  deny('MatchPoint API page indicated an error');
 const success=get(payload,'ok','success','successful','isSuccess','isSuccessful');
 if(success!==true)deny('MatchPoint API page lacks an explicit true success flag');
 const namedData=get(payload,'data','results','bookings','items','records');
 const arrays=Object.values(payload).filter(Array.isArray);
 const rows=Array.isArray(namedData)?namedData:(arrays.length===1?arrays[0]:null);
 if(!Array.isArray(rows))deny('MatchPoint API page has no unique booking record array');
 if(rows.length>limit)deny('MatchPoint API page exceeded requested page limit');
 for(const row of rows){
  if(!object(row)||!['id','date','startTime','endTime','resourceName'].every(k=>
    matchPointField(row,k)!==undefined&&matchPointField(row,k)!==null)){
   deny('MatchPoint API page contains records with missing required booking fields');
  }
 }
 const hasMore=get(payload,'hasMore','hasMoreResults','more','hasNextPage');
 const isLastPage=get(payload,'isLastPage');
 const total=get(payload,'total','totalCount','count','recordCount');
 const offset=get(payload,'offset');
 if(offset!==undefined&&offset!==null&&offset!==0)deny('MatchPoint API page offset is not zero');
 if(total!==undefined&&total!==null&&(!Number.isSafeInteger(total)||total<rows.length))
  deny('MatchPoint API page has invalid total count');
 if(hasMore===true||isLastPage===false)deny('MatchPoint API page requires pagination; refusing partial import');
 if(hasMore!==false&&isLastPage!==true&&!(Number.isSafeInteger(total)&&total===rows.length&&rows.length<limit))
  deny('MatchPoint API page lacks verifiable end-of-pagination metadata');
 if(Number.isSafeInteger(total)&&total!==rows.length)deny('MatchPoint API total differs from returned page length');
 if(rows.length===limit&&hasMore!==false&&isLastPage!==true)
  deny('MatchPoint page might be truncated at requested limit');
 return {rows,count:rows.length,format:Array.isArray(get(payload,'data'))?'documented':'alternate',
   paginationConfirmed:true};
}
