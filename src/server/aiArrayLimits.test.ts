import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {trimAiArrays} from './aiArrayLimits';
import {advanceResearch,newResearchState,admitExtractedEvidence,type ResearchSource} from './researchWorkflow';
import {ptwStrategyFixture} from '../testFixtures/ptwStrategy';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
import {synthesizePtwStrategy,validateStrategy} from './ptwSynthesis';
import {strategySchema} from '../domain/ptw/strategy';

const source=():ResearchSource=>({id:'RES-overflow',name:'Original competition record',url:'https://example.gov/competition',task:'COMPETITION',status:'READ',text:'Issued May 1, 2025.',sha256:'test'});
function researchFixture(){
 const draft=pricedServicesFixture() as any,s=source();
 const competitors=Array.from({length:12},(_,i)=>({name:`Company ${String(i).padStart(2,'0')}`,rationale:'Documented pursuit connection.',bidIntent:'UNKNOWN'}));
 const evidence=competitors.flatMap((c,i)=>Array.from({length:i>=4?2:1},(_,j)=>{
  const excerpt=`${c.name} is a potential bidder for ${draft.deal.solicitationNumber}; source statement ${j}.`;
  s.text+=' '+excerpt;return {claim:excerpt,excerpt,section:'Page 1'};
 }));
 return {draft,s,raw:{kind:'MARKET',publishedAt:'2025-05-01',dateQuote:'Issued May 1, 2025.',competitors,evidence,gaps:[]}};
}
test('historical research continues with the strongest 8 of 12 competitors and records 4 dropped',async()=>{
 const {draft,s,raw}=researchFixture(),state=newResearchState();state.index=1;state.phase='INTERPRET';state.sources=[s];
 const deps={client:{interpret:async<T>()=>raw as T,research:async()=>{throw Error('Unexpected discovery');}},normalize:async(f:any)=>f,extract:async()=>draft};
 const options={historical:true,cutoff:'2025-06-30',providedNames:[],originalFiles:[]};
 const result=await advanceResearch(draft,state,options,deps as any);
 assert.equal(result.draft.competitors.length,8);
 assert.deepEqual(result.draft.competitors.map(c=>c.name),raw.competitors.slice(4).map(c=>c.name));
 assert.match(state.warnings.join('\n'),/competitors: kept 8 of 12; dropped 4/);
 assert.match(s.reason!,/dropped 4/);assert.equal(s.status,'ADMITTED');
 await advanceResearch(result.draft,state,options,deps as any);
 assert.equal(state.index,2,'research proceeds to the benchmark task');
});
test('competitor ranking uses exact source support, not claimed intent or fabricated excerpts',()=>{
 const {s,raw}=researchFixture();raw.competitors[0].bidIntent='CONFIRMED';
 raw.evidence.push(...Array.from({length:20},()=>({claim:'Company 00 will bid.',excerpt:'Company 00 will bid.',section:'Page 1'})));
 const result=admitExtractedEvidence(raw,s,'2025-06-30');
 assert.equal(result.parsed.competitors.some(c=>c.name==='Company 00'),false);
});
test('research evidence and gap overflow is trimmed with exact counts; cutoff rejection still applies',()=>{
 const {s,raw}=researchFixture();
 const input={...raw,evidence:Array.from({length:50},(_,i)=>raw.evidence[i%raw.evidence.length]),gaps:Array.from({length:15},(_,i)=>`Gap ${i}`)};
 const notes:string[]=[];const r=admitExtractedEvidence(input,s,'2025-06-30',notes);
 assert.equal(r.parsed.evidence.length,45);assert.equal(r.parsed.gaps.length,10);
 assert.match(notes.join('\n'),/evidence: kept 45 of 50; dropped 5/);assert.match(notes.join('\n'),/gaps: kept 10 of 15; dropped 5/);
 assert.equal(admitExtractedEvidence({...input,kind:'TARGET_OUTCOME'},source(),'2025-06-30').items.length,0);
 const future={...s,text:s.text+' Revised July 1, 2025.'};
 assert.equal(admitExtractedEvidence({...input,publishedAt:'2025-07-01',dateQuote:'Revised July 1, 2025.'},future,'2025-06-30').items.length,0);
});
test('schema traversal covers every nested capped synthesis array without modifying input or string validation',()=>{
 const {strategy}=ptwStrategyFixture();const input=structuredClone(strategy) as any;
 function overflow(schema:z.ZodTypeAny,value:any):any{
  if(schema instanceof z.ZodObject)return Object.fromEntries(Object.entries(schema.shape).map(([k,s])=>[k,overflow(s as z.ZodTypeAny,value[k])]));
  if(schema instanceof z.ZodArray){const n=schema._def.maxLength?.value;if(!value.length)return value;return Array.from({length:n===undefined?value.length:n+2},(_,i)=>overflow(schema.element,value[i%value.length]));}
  return value;
 }
 const inflated=overflow(strategySchema,input),before=structuredClone(inflated),notes:string[]=[];
 const bounded=trimAiArrays(inflated,strategySchema,notes);
 assert.doesNotThrow(()=>strategySchema.parse(bounded));assert.deepEqual(inflated,before);
 for(const path of ['buyingDecision.complianceGates','options','options[0].deliveryChanges','options[0].pricingLevers','recommendation.alternatives','recommendation.changeTriggers','recommendation.nextActions','missingInputs','buyingDecision.evaluationMethod.evidenceIds'])assert.ok(notes.some(n=>n.includes(path+':')),path);
 const bad={...input,missingInputs:['x'.repeat(1601)]};assert.throws(()=>strategySchema.parse(trimAiArrays(bad,strategySchema,[])));
});
test('synthesis keeps a selected fifth option and matching alternatives without retrying',async()=>{
 const {analysis,strategy}=ptwStrategyFixture();
 strategy.options=Array.from({length:6},(_,i)=>({...structuredClone(strategy.options[0]),id:`choice-${i}`}));
 strategy.recommendation.selectedOptionId='choice-5';
 strategy.recommendation.alternatives=strategy.options.slice(0,5).map(o=>({optionId:o.id,reason:structuredClone(strategy.recommendation.rationale)}));
 strategy.missingInputs=Array.from({length:15},(_,i)=>`Validate input ${i}`);
 strategy.recommendation.nextActions=Array.from({length:10},()=>structuredClone(strategy.recommendation.nextActions[0]));
 let calls=0;const r=await synthesizePtwStrategy(analysis,{interpret:async<T>()=>{calls++;return strategy as T;}});
 assert.equal(r.status,'DRAFT');assert.equal(calls,1);if(r.status!=='DRAFT')return;
 assert.equal(r.strategy.options.length,4);assert.ok(r.strategy.options.some(o=>o.id==='choice-5'));
 assert.equal(r.strategy.recommendation.alternatives.length,3);
 assert.equal(r.strategy.missingInputs.length,12);assert.equal(r.strategy.recommendation.nextActions.length,8);
 assert.match(analysis.meta.warnings.join('\n'),/options: kept 4 of 6; dropped 2/);
 assert.match(analysis.meta.warnings.join('\n'),/missingInputs: kept 12 of 15; dropped 3/);
});
test('bounded synthesis still rejects unknown citations and nonexistent selected options',()=>{
 const {analysis,strategy}=ptwStrategyFixture();strategy.missingInputs=Array(15).fill('Missing input');
 strategy.recommendation.rationale.evidenceIds=['unknown'];assert.throws(()=>validateStrategy(strategy,analysis),/unknown evidence/);
 strategy.recommendation.selectedOptionId='absent';assert.throws(()=>validateStrategy(strategy,analysis),/selection is inconsistent/);
});
test('uncapped arrays and under-limit values are preserved',()=>{
 const schema=z.object({uncapped:z.array(z.string()),capped:z.array(z.string()).max(2).default([])});
 const input={uncapped:Array(50).fill('value'),capped:['a','b']},notes:string[]=[];
 assert.deepEqual(trimAiArrays(input,schema,notes),input);assert.deepEqual(notes,[]);
});
test('synthesis competitor overflow retains the 12 strongest source-linked rivals',async()=>{
 const {analysis,strategy}=ptwStrategyFixture();
 strategy.competitors=Array.from({length:14},(_,i)=>{
  const name=`Rival ${String(i).padStart(2,'0')}`,id=`RIVAL-${i}`;
  analysis.evidence.push({id,type:'EXTERNAL_SOURCE',sourceLabel:'Original source',section:'Page 1',claim:`${name} will bid on ${analysis.deal.solicitationNumber}.`,confidence:80});
  const statement={text:`${name} is a potential rival.`,kind:'INFERENCE' as const,evidenceIds:[id],validationAction:'Confirm intent.'};
  if(i>=2)statement.evidenceIds.push('SOL-EVAL');
  return {name,bidIntent:'POSSIBLE' as const,intentBasis:statement,likelyApproach:structuredClone(statement),threat:structuredClone(statement)};
 });
 const r=await synthesizePtwStrategy(analysis,{interpret:async<T>()=>strategy as T});
 assert.equal(r.status,'DRAFT');if(r.status!=='DRAFT')return;
 assert.equal(r.strategy.competitors.length,12);assert.equal(r.strategy.competitors[0].name,'Rival 02');
 assert.match(analysis.meta.warnings.join('\n'),/competitors: kept 12 of 14; dropped 2/);
});
test('package Research advances to Pricing and persists overflow coverage notes',async(t)=>{
 const {PackageJobs}=await import('./packageJobs');const {RecordStore}=await import('./store');
 const {historicalContext}=await import('./historical');
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());
 const {draft,s,raw}=researchFixture();draft.deal.dueDate='2025-06-30';
 const state=newResearchState();state.index=1;state.phase='INTERPRET';state.sources=[s];
 const deps={client:{interpret:async<T>()=>raw as T},normalize:async(f:any)=>f,extract:async()=>draft};
 const jobs=new PackageJobs(store,{normalize:async f=>f,extract:async()=>draft,
  intelligenceStep:async(d,st,opts)=>{const r=await advanceResearch(d,st,opts,deps as any);r.state.done=true;return r;},
  research:async d=>({...draft,...d}),price:async a=>a,
  strategy:async()=>({status:'UNAVAILABLE',version:'test',reason:'Not executed in this research regression.'})});
 let job=await jobs.create('overflow-test',{mode:'HISTORICAL',cutoff:'2025-06-30',files:[{name:'scope.txt',size:1}],originalPackageConfirmed:true});
 const saved=await store.get('overflow-test','package-job',job.id);
 await store.put('overflow-test','package-job',job.id,{...job,stage:'RESEARCH',status:'READY'},saved!.version);
 await store.put('overflow-test','package-draft',job.id,draft);
 await store.put('overflow-test','package-research',job.id,state);
 await store.put('overflow-test','historical-context',job.id,historicalContext('2025-06-30',true,[]));
 job=await jobs.advance('overflow-test',job.id);assert.equal(job.stage,'PRICING');assert.equal(job.status,'READY');
 let result=(await store.get<any>('overflow-test','package-result',job.id))!.value;
 assert.equal(result.competitors.length,8);assert.match(result.meta.warnings.join('\n'),/competitors: kept 8 of 12; dropped 4/);
 job=await jobs.advance('overflow-test',job.id);assert.equal(job.stage,'STRATEGY');
 result=(await store.get<any>('overflow-test','package-result',job.id))!.value;
 assert.match(result.meta.packageCoverage.warnings.join('\n'),/competitors: kept 8 of 12; dropped 4/);
});
