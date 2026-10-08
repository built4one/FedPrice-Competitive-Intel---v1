import {RecordStore} from './store';
const store=new RecordStore();
let blockedUntil=0;
export function quotaReset(body:string){
  const v=/"nextAccessTime"\s*:\s*"([^"]+)"/.exec(body)?.[1];
  if(!v)return Date.now()+60*60*1000;
  const m=/(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(v);
  if(m){const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].findIndex(x=>x.toLowerCase()===m[2].toLowerCase());if(month>=0)return Date.UTC(+m[1],month,+m[3],+m[4],+m[5],+m[6]);}
  return Number.isFinite(Date.parse(v))?Date.parse(v):Date.now()+60*60*1000;
}
export async function samAvailability(){
  if(process.env.VERCEL==='1'&&process.env.DATABASE_URL){try{const r=await store.get<number>('system','source-health','sam');if(r)blockedUntil=Math.max(blockedUntil,r.value);}catch{/* local guard still applies */}}
  return {configured:!!process.env.SAM_API_KEY,status:blockedUntil>Date.now()?'QUOTA_REACHED':'NOT_CHECKED',retryAt:blockedUntil>Date.now()?new Date(blockedUntil).toISOString():undefined,message:blockedUntil>Date.now()?'SAM lookup is temporarily unavailable. Upload the package to continue.':'SAM availability is not guaranteed. Package upload works independently of lookup.'};
}
export async function noteSamQuota(body:string){
  blockedUntil=Math.max(Date.now()+60000,quotaReset(body));
  if(process.env.VERCEL==='1'&&process.env.DATABASE_URL){try{const r=await store.get<number>('system','source-health','sam');await store.put('system','source-health','sam',blockedUntil,r?.version||0);}catch{/* concurrent quota reports are harmless */}}
}
