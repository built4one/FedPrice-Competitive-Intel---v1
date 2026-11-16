import test from 'node:test';
import assert from 'node:assert/strict';
import {repairExtraction} from './aiExtractionRepair';
import {contingencyEstimate} from './contingencyEstimate';
import {opportunityAnalysisFixture} from '../testFixtures/opportunityAnalysis';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
import {PackageJobs} from './packageJobs';
import {RecordStore} from './store';
import ExcelJS from 'exceljs';
import {addCompetitiveWorkbook} from '../exports/competitiveWorkbook';
import {createExecutivePdf} from '../exports/executivePdf';

test('extraction repairs enums and arrays without manufacturing required numeric measurements',()=>{
 const notes:string[]=[];
 const r=repairExtraction({status:'FAKE',rows:[{quantity:'twelve'},{quantity:12}]},{type:'OBJECT',required:['status','rows','gaps'],properties:{status:{type:'STRING',enum:['COMPLETE','PARTIAL']},gaps:{type:'ARRAY',items:{type:'STRING'}},rows:{type:'ARRAY',items:{type:'OBJECT',properties:{quantity:{type:'NUMBER'}},required:['quantity']}}}},notes);
 assert.equal(r.status,'PARTIAL');assert.deepEqual(r.gaps,[]);assert.deepEqual(r.rows,[{quantity:12}]);assert.ok(notes.length>=3);
});
test('whole-package estimate retries bad AI output and returns a labeled price without adding evidence',async()=>{
 const a=opportunityAnalysisFixture();delete a.competitivePosition;const evidence=structuredClone(a.evidence);let calls=0;
 await contingencyEstimate(a,{interpret:async<T>()=>(++calls===1?{low:'bad'}:{low:100000,central:200000,high:400000,basis:'Synthetic test estimate: explicitly assumed work quantities and rates.',assumptions:['SYNTHETIC estimate, not a real procurement'],missing:['Validate hours']}) as T});
 assert.equal(calls,2);assert.equal(a.competitivePosition?.target,200000);assert.equal(a.competitivePosition?.confidenceLabel,'LIMITED');assert.deepEqual(a.evidence,evidence);assert.match(a.competitivePosition!.rangeMeaning,/AI ESTIMATE/);
});
test('AI estimate exports use estimate formulas and retain assumptions and repair notes',async()=>{
 const a=opportunityAnalysisFixture();delete a.competitivePosition;
 await contingencyEstimate(a,{interpret:async<T>()=>({low:100000,central:200000,high:400000,basis:'Synthetic estimate with explicit assumed work and no sourced prices.',assumptions:['Assumed test quantity'],missing:['Verify scope']}) as T});
 const w=new ExcelJS.Workbook();w.addWorksheet('Executive Decision').columns=[{key:'field'},{key:'value'}];addCompetitiveWorkbook(w,a);
 assert.equal((w.getWorksheet('Competitive Strategies')!.getCell('C3').value as any).formula,"'AI Engineering Estimate'!B2");
 assert.equal(w.getWorksheet('AI Engineering Estimate')!.getCell('B2').value,200000);
 assert.ok((await w.xlsx.writeBuffer()).byteLength>1000);const pdf=await createExecutivePdf(a);assert.equal(pdf.subarray(0,4).toString(),'%PDF');
});
for(const stage of ['RESEARCH','PRICING','STRATEGY'] as const)test(`${stage} failure retries once and retains a price`,async t=>{
 const store=new RecordStore({file:':memory:',url:undefined,hosted:false});t.after(()=>store.close());const a=pricedServicesFixture();let calls=0;
 const fail=async()=>{calls++;throw Error('Injected malformed output / timeout');};
 const jobs=new PackageJobs(store,{normalize:async f=>f,extract:async()=>a as any,research:async()=>a,price:stage==='PRICING'?fail:async v=>v,strategy:stage==='STRATEGY'?fail:undefined,intelligenceStep:stage==='RESEARCH'?fail:undefined});
 const job=await jobs.create('recovery',{files:[{name:'scope.txt',size:1}]});const row=await store.get('recovery','package-job',job.id);
 await store.put('recovery','package-job',job.id,{...job,stage},row!.version);await store.put('recovery','package-draft',job.id,a);await store.put('recovery','package-result',job.id,a);
 let result=job;for(let n=0;n<6&&result.status!=='COMPLETE';n++)result=await jobs.advance('recovery',job.id);
 assert.equal(result.status,'COMPLETE');assert.equal(calls,2);const saved=(await store.get<any>('recovery','analysis',result.runId!))!.value;assert.ok(saved.competitivePosition.target>0);assert.equal(saved.competitivePosition.confidenceLabel,'LIMITED');
});

test('an incomplete labor subtotal is replaced by a whole-package estimate without changing source quantities',async()=>{
 const a=pricedServicesFixture();a.deal.laborModelComplete=false;a.deal.evaluationPricing!.completeness='PARTIAL';const quantities=structuredClone(a.deal.laborSignals);let calls=0;
 await contingencyEstimate(a,{interpret:async<T>()=>{calls++;return {low:1000000,central:2000000,high:4000000,basis:'Synthetic complete scope estimate including unquantified managed service and enhancement obligations.',assumptions:['Synthetic estimating quantities'],missing:['Validate CLIN allocations']} as T;}});
 assert.equal(calls,1);assert.equal(a.competitivePosition?.target,2000000);assert.equal(a.competitivePosition?.confidenceLabel,'LIMITED');assert.deepEqual(a.deal.laborSignals,quantities);
});
