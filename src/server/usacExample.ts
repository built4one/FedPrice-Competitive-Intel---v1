import {RecordStore,ConflictError} from './store';
import {verifyFrozen} from './predictions';
export const USAC_EXAMPLE_ID='run-5f87d59b-c095-4374-83b0-eedf045e83bb';
export async function ensureUsacExample(store:RecordStore,workspace:string,env=process.env){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='codex/parallel-profile-preview'||!workspace.startsWith('preview-guest-'))return;
 if(await store.get(workspace,'analysis',USAC_EXAMPLE_ID))return;
 const source=await store.approvedUsacExample();
 if(!source||source.id!==USAC_EXAMPLE_ID||!verifyFrozen(source))return;
 const copy=structuredClone(source);delete copy.validation;delete copy.historicalReview;delete copy.storageVersion;
 for(const kind of ['prediction','analysis']){
  if(await store.get(workspace,kind,USAC_EXAMPLE_ID))continue;
  try{await store.put(workspace,kind,USAC_EXAMPLE_ID,copy);}catch(e){if(!(e instanceof ConflictError))throw e;}
 }
}
