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
