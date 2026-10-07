import test from 'node:test';
import assert from 'node:assert/strict';
import {pricedServicesFixture} from '../../testFixtures/pricedServices';
import {calculateCompetitivePosition,validPlanningInput} from './competitivePosition';
import {buildLaborModel} from './laborModel';
import {enforceAuthoritativeAnalysis} from '../marketPosition/authoritative';
import {pricingDraft,calculateSourcePricingScenario} from './pricingScenario';
import type {PlanningInput} from '../../types';

export const equipmentInput=():PlanningInput=>({id:'equipment',label:'Equipment supplied and installed',kind:'UNIT_PRICE',quantity:12,unit:'each',quantitySource:'Synthetic CLIN 0001',low:2000,central:2500,high:4000,basis:'PLANNING_ASSUMPTION',rationale:'Synthetic engineering estimate: supply and installation. No retrieved quote.',evidenceIds:[],lowerCondition:'Standard configuration and installation',upperCondition:'Additional mounting and commissioning work'});
export function equipmentFixture(){const a=pricedServicesFixture();a.deal.laborSignals=[];a.deal.planningInputs=[equipmentInput()];a.deal.evaluationPricing!.unitLines=[{id:'equipment',label:'Equipment supplied and installed',quantity:12,unit:'each',source:'Synthetic CLIN 0001'}];return enforceAuthoritativeAnalysis(a);}

test('contract Year 1 never triggers calendar-year escalation, including historic saved runs',()=>{
  const a=pricedServicesFixture();a.deal.facts=[{label:'Performance start',value:'2027-01-01',confidence:100}];
  a.deal.evaluationPricing!.rateBaseYear=1;
  const p=calculateCompetitivePosition(a);
  assert.ok(p.target!>1e6 && p.target!<1e9);
  assert.equal(p.rows[0].factor,1);assert.match(p.assumptions.join(' '),/contract-year label/);
  a.deal.evaluationPricing!.rateBaseYear=2027;assert.equal(calculateCompetitivePosition(a).target,p.target);
  a.deal.evaluationPricing!.rateBaseYear=2026;assert.ok(calculateCompetitivePosition(a).target!>p.target!);
});
test('missing matched labor is included through explicit bounded assumptions with lower confidence',()=>{
  const a=pricedServicesFixture();a.evidence=a.evidence.filter(e=>e.id!=='SYN-RATE-2');
  a.deal.planningInputs=[{...equipmentInput(),id:'PLAN-Help Desk',label:'Help Desk',kind:'LABOR_RATE',quantity:1,unit:'loaded USD/hour',low:65,central:90,high:180}];
  const p=calculateCompetitivePosition(a);
  assert.equal(p.pricedHours,1050240);assert.equal(p.unpricedRows.length,0);assert.ok(p.target);
  assert.equal(p.confidenceLabel,'LIMITED');assert.equal(p.rows.filter(r=>r.assumedRate).length,6);
  assert.equal(p.rows.find(r=>r.title==='Help Desk')!.recommendedRate,90);
  assert.ok(p.rangeLow!<p.target! && p.rangeHigh!>p.target!);
});
test('equipment quantities and fixed travel reconcile without using travel as a whole-contract anchor',()=>{
  const a=equipmentFixture(),p=a.competitivePosition!;
  assert.equal(p.target,50000);assert.equal(p.rangeLow,44000);assert.equal(p.rangeHigh,68000);
  assert.equal(p.scenarios[1].labor,0);assert.equal(p.components.length,2);assert.equal(p.confidenceLabel,'LIMITED');
  const draft=pricingDraft(a);assert.equal(draft.lines.length,2);
  const offer=calculateSourcePricingScenario({...draft,completenessConfirmed:true,lines:draft.lines.map(l=>({...l,quantity:Number(l.quantity),lowUnitPrice:Number(l.lowUnitPrice),targetUnitPrice:Number(l.targetUnitPrice),highUnitPrice:Number(l.highUnitPrice)}))},a);
  assert.equal(offer.target,p.target);assert.equal(offer.low,p.rangeLow);assert.equal(offer.high,p.rangeHigh);
});
test('invalid price assumptions cannot silently erase a required line or pass as complete',()=>{
  for(const changed of [{central:Infinity},{low:-1},{high:100},{quantity:0},{rationale:''}])assert.equal(validPlanningInput({...equipmentInput(),...changed}),false);
  const a=equipmentFixture();a.deal.planningInputs![0].quantity=1;
  const p=calculateCompetitivePosition(a);assert.equal(p.target,null);assert.ok(p.missing.some(s=>/quantity differs/.test(s)));
});
test('no occupational crosswalk is silently repaired by a rejected cybersecurity rate',()=>{
  const a=pricedServicesFixture();a.deal.laborSignals[0].title='IT Infrastructure Security Specialist';a.deal.laborSignals[0].titleConflict='Personnel security background checks conflict with cybersecurity title';
  a.evidence[0].numeric!.matchedLaborCategory=a.deal.laborSignals[0].title;a.evidence[0].numeric!.benchmarkFamily='Cybersecurity Engineer';
  assert.equal(calculateCompetitivePosition(a).target,null);
});
test('unreasonable period durations are rejected before escalation loops or exports',()=>{
  const a=pricedServicesFixture();a.deal.laborSignals[0].periods![0].months=2026*12;
  assert.equal(buildLaborModel(a.deal,a.evidence).quantityComplete,false);
});
