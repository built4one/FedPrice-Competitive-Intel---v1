import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {RecordStore} from './store';
import {installTeamRoutes,teamInventory} from './teamDecisions';
import {awardComparison,parseAwardReview,emptyAwardReview} from '../presentation/awardReview';
import {validateHistorical,freezeAnalysis} from './predictions';
test('award comparison reports the signed gap against the award and inclusive range',()=>{
 const r={...emptyAwardReview,awardedValue:113000000};
 const c=awardComparison(202009140,178471400,227953000,r)!;
 assert.equal(c.difference,89009140);assert.equal(c.percent.toFixed(1),'78.8');assert.equal(c.inRange,false);assert.equal(c.comparable,false);
 assert.equal(awardComparison(100,80,120,{...r,awardedValue:80,valueType:'evaluated-price',sameBasis:'yes'})?.inRange,true);
 assert.equal(awardComparison(100,80,120,{...r,awardedValue:120})?.difference,-20);
 assert.equal(awardComparison(null,80,120,r),null);
 assert.equal(awardComparison(100,80,120,emptyAwardReview),null);
 assert.equal(awardComparison(100,80,120,{...r,valueType:'initial-funding',sameBasis:'yes'})?.comparable,false);
});
test('award inputs reject invalid values and preserve unconfirmed basis',()=>{
 for(const awardedValue of [-1,0,Infinity,NaN,'113M'])assert.throws(()=>parseAwardReview({...emptyAwardReview,awardedValue}));
 assert.throws(()=>parseAwardReview({...emptyAwardReview,sameBasis:true}));
 assert.throws(()=>parseAwardReview({...emptyAwardReview,valueType:'invented'}));
 assert.equal(parseAwardReview({...emptyAwardReview,source:' User '}).source,'User');
});
test('shared review API persists separately, rejects stale writes and never contaminates analysis',async()=>{
 const oldEnv={...process.env};process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='codex/team-saved-decisions';
 const store=new RecordStore({file:':memory:',url:undefined,hosted:false});
 const w='preview-guest-'+'a'.repeat(32),viewer='preview-guest-'+'b'.repeat(32);
 const original={id:'one',deal:{title:'IBS'},meta:{},competitivePosition:{target:202009140}};
 await store.put(w,'analysis','one',original);
 const app=express();app.use(express.json());app.use((req,_res,next)=>{req.principal={workspace:viewer,username:'guest'} as any;next();});installTeamRoutes(app,store);
 const server=app.listen(0);await new Promise<void>(r=>server.on('listening',r));
 const url=`http://127.0.0.1:${(server.address() as any).port}/api/team/runs/${w}/one`;
 const send=(body:any)=>fetch(url+'/review',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const body={...emptyAwardReview,awardedValue:113000000,source:'User provided',version:0};
  assert.equal((await send(body)).status,200);
  assert.equal((await send(body)).status,409);
  assert.equal((await send({...body,version:1,awardedValue:-5})).status,400);
  let rows=await teamInventory(store,viewer);assert.equal(rows[0].review.awardedValue,113000000);assert.equal(rows[0].reviewVersion,1);
  assert.deepEqual((await store.get(w,'analysis','one'))?.value,original);
  assert.deepEqual((await (await fetch(url)).json()).data,original);
  assert.equal((await fetch(url.replace(w,'boss')+'/review',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,404);
  assert.equal((await send({...body,version:1,awardedValue:null})).status,200);
  assert.ok((await store.get<any>(w,'team-award-review','one'))?.value.outcomeDisclosedAt);
  assert.equal(await store.get(w,'historical-outcome','one'),null);
  await store.put(w,'prediction','one',freezeAnalysis(original as any));
  await assert.rejects(validateHistorical(store,w,'one','Reviewer',true),/before outcome disclosure/);
 }finally{server.close();await store.close();process.env=oldEnv;}
});
test('range comparison leads with inclusion, fixed near-boundary tolerance and exact distance',()=>{
 const r={...emptyAwardReview,awardedValue:3000000,valueType:'pricing-benchmark' as const};
 const near=awardComparison(5350600,3090000,8750000,r)!;
 assert.equal(near.rangeStatus,'Near range');assert.equal(near.boundaryGap,90000);assert.equal(near.boundaryPercent,3);
 assert.equal(awardComparison(5e6,3e6,8e6,r)?.rangeStatus,'Inside range');
 assert.equal(awardComparison(5e6,3.15e6,8e6,r)?.rangeStatus,'Near range');
 assert.equal(awardComparison(5e6,3.150001e6,8e6,r)?.rangeStatus,'Outside range');
 assert.equal(awardComparison(2e6,1e6,2.9e6,r)?.boundaryGap,-100000);
 assert.equal(awardComparison(2e6,4e6,1e6,r)?.rangeStatus,'Range unavailable');
 assert.equal(parseAwardReview(r).valueType,'pricing-benchmark');
});
