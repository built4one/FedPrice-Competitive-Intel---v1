import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculatePricingScenario } from './pricingScenario';
export const scenarioInputs = () => ({evaluationBasis:'Base CLIN and explicitly evaluated option CLIN.',basisSource:'RFP Section M and pricing workbook',completenessConfirmed:true as const,lines:[
  {label:'Base',quantity:3,lowUnitPrice:0.1,targetUnitPrice:0.2,highUnitPrice:0.3,source:'Analyst assumption for arithmetic test'},
  {label:'Option',quantity:10,lowUnitPrice:90,targetUnitPrice:100,highUnitPrice:110,source:'Explicit option quantity and offered unit rates'},
]});
test('evaluated CLIN prices sum explicit quantities once and round at cents',()=>{
  const result=calculatePricingScenario(scenarioInputs());
  assert.equal(result.low,900.3);assert.equal(result.target,1000.6);assert.equal(result.high,1100.9);assert.equal(result.status,'CONDITIONAL');
});
test('unconfirmed scope, missing sources and reversed prices cannot produce a target',()=>{
  const input=scenarioInputs();
  assert.throws(()=>calculatePricingScenario({...input,completenessConfirmed:false}));
  assert.throws(()=>calculatePricingScenario({...input,lines:[{...input.lines[0],source:''}]}));
  assert.throws(()=>calculatePricingScenario({...input,lines:[{...input.lines[0],lowUnitPrice:5}]}));
  assert.throws(()=>calculatePricingScenario({...input,lines:[{...input.lines[0],quantity:Infinity}]}));
});
