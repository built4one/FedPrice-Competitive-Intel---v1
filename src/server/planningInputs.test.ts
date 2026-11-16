import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completePlanningInputs} from './planningInputs';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
test('large pricing schedules complete in saved batches without repricing completed inputs',async()=>{
 const a=pricedServicesFixture();a.deal.laborSignals=[];a.deal.planningInputs=[];
 a.deal.evaluationPricing={basis:'25 products',source:'Pricing table',completeness:'COMPLETE',extensionRateRule:'NOT_APPLICABLE',components:[],unitLines:Array.from({length:25},(_,i)=>({id:`item-${i}`,label:`Product ${i}`,quantity:i+1,unit:'each',source:`Pricing table row ${i+1}`}))};
 const sizes:number[]=[];const client:any={interpret:async(prompt:string)=>{const needs=JSON.parse(prompt.split('REQUESTED INPUTS: ')[1].split('\nDEAL:')[0]);sizes.push(needs.length);return{inputs:needs.map((n:any)=>({...n,low:20,central:30,high:50,basis:'PLANNING_ASSUMPTION',rationale:'Explicit production and delivery economics',evidenceIds:[],lowerCondition:'Standard configuration',upperCondition:'More costly delivery'}))};}};
 for(let i=0;i<4;i++)await completePlanningInputs(a.deal,[],client,12);
 assert.deepEqual(sizes,[12,12,1]);assert.equal(a.deal.planningInputs.length,25);assert.equal(new Set(a.deal.planningInputs.map(p=>p.id)).size,25);
});
test('independent pricing batches run concurrently with identical item coverage and estimate labels',async()=>{
 const a=pricedServicesFixture();a.deal.laborSignals=[];a.deal.planningInputs=[];
 a.deal.evaluationPricing={basis:'18 products',source:'Pricing table',completeness:'COMPLETE',extensionRateRule:'NOT_APPLICABLE',components:[],unitLines:Array.from({length:18},(_,i)=>({id:`item-${i}`,label:`Product ${i}`,quantity:i+1,unit:'each',source:`row ${i}`}))};
 let active=0,peak=0;const seen:string[]=[];
 const client:any={interpret:async(prompt:string)=>{const needs=JSON.parse(prompt.split('REQUESTED INPUTS: ')[1].split('\nDEAL:')[0]);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,3));active--;seen.push(...needs.map((n:any)=>n.id));return{inputs:needs.map((n:any)=>({...n,low:20,central:30,high:50,basis:'ANALOGY',rationale:'Delivery economics',evidenceIds:['invented'],lowerCondition:'Standard',upperCondition:'Complex'}))};}};
 await completePlanningInputs(a.deal,[],client,6,undefined,3);
 assert.equal(peak,3);assert.equal(seen.length,18);assert.equal(new Set(seen).size,18);assert.equal(a.deal.planningInputs.length,18);
 assert.ok(a.deal.planningInputs.every(p=>p.basis==='PLANNING_ASSUMPTION'&&p.evidenceIds.length===0));
});
