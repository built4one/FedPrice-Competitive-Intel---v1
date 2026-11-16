import test from 'node:test';
import assert from 'node:assert/strict';
import {RecordStore} from './store';
import {ensureUsacExample,USAC_EXAMPLE_ID} from './usacExample';
import {freezeAnalysis,verifyFrozen} from './predictions';
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/parallel-profile-preview'};
test('approved USAC is copied once to each guest with its frozen hash, no outcome, and no unrelated runs',async()=>{
 const store=new RecordStore({file:':memory:',url:undefined,hosted:false});
 try{
  const a=freezeAnalysis({id:USAC_EXAMPLE_ID,competitivePosition:{target:5,rangeLow:3,rangeHigh:7},historical:{cutoff:'2026-10-26'}} as any);
  await store.put('preview-guest-original','prediction',a.id,a);
  await store.put('preview-guest-original','historical-outcome',a.id,{actualValue:123});
  await store.put('preview-guest-original','analysis','unrelated',{secret:'not shared'});
  await Promise.all([ensureUsacExample(store,'preview-guest-owner',env),ensureUsacExample(store,'preview-guest-owner',env)]);
  const row=await store.get('preview-guest-owner','prediction',a.id);
  assert.deepEqual(row?.value,a);assert.equal(verifyFrozen(row?.value),true);
  assert.equal((await store.list('preview-guest-owner','analysis')).length,1);
  assert.equal((await store.list('preview-guest-owner','historical-outcome')).length,0);
  await ensureUsacExample(store,'preview-guest-owner',env);assert.equal((await store.get('preview-guest-owner','analysis',a.id))?.version,1);
  await ensureUsacExample(store,'preview-guest-other',env);assert.equal((await store.get('preview-guest-other','prediction',a.id))?.value.frozenPrediction.hash,a.frozenPrediction?.hash);
 }finally{await store.close();}
});
test('example provisioning never reads across workspaces in production, protected branches or owner accounts',async()=>{
 const store={get:()=>{throw Error('Must not read');}} as any;
 await ensureUsacExample(store,'preview-guest-owner',{...env,VERCEL_ENV:'production'});
 await ensureUsacExample(store,'preview-guest-owner',{...env,VERCEL_GIT_COMMIT_REF:'codex/fix-ai-array-overflow'});
 await ensureUsacExample(store,'boss',env);
});
