import test from 'node:test';
import assert from 'node:assert/strict';
import { pricedServicesFixture } from '../../testFixtures/pricedServices';
import { enforceAuthoritativeAnalysis } from '../marketPosition/authoritative';
import { calculateCompetitivePosition } from './competitivePosition';
import { buildLaborModel } from './laborModel';
import { laborCoverage } from '../laborCoverage';
import { calculateSourcePricingScenario, pricingDraft } from './pricingScenario';
import { comparisonReady, preserveValidation } from './validation';
import { claimSupportIssue, governmentRules } from '../governmentRules';
import { reconcileSourceFacts } from '../sourceConsistency';

test('fixed evaluated travel never becomes the whole-contract government anchor, including mislabeled saved evidence',()=>{
  const a=pricedServicesFixture();
  a.evidence.find(e=>e.id==='SYN-TRAVEL')!.numeric!.valueType='EVALUATED_PRICE';
  a.evidence.find(e=>e.id==='SYN-TRAVEL')!.numeric!.valueBasis='OPPORTUNITY_TOTAL';
  const updated=enforceAuthoritativeAnalysis(a),anchor=updated.marketPosition.anchors.find(r=>r.evidenceId==='SYN-TRAVEL')!;
  assert.equal(anchor.role,'COMPONENT');assert.equal(anchor.included,false);
  assert.equal(updated.marketPosition.estimationMethod,'BOTTOM_UP_LABOR');
  assert.notEqual(updated.marketPosition.expected,20000);
  assert.equal(a.evidence.find(e=>e.id==='SYN-TRAVEL')!.numeric!.valueBasis,'OPPORTUNITY_TOTAL','engine does not mutate input evidence');
});

test('senior source records survive canonical family shortening; junior and unsupported generic rates still fail',()=>{
  const a=pricedServicesFixture(),s=a.deal.laborSignals[0];
  s.title='Technical Writer III';s.pwsTitle='Technical Writer (SME III)';s.titleConflict='Pricing abbreviation versus full PWS title';
  const rate=a.evidence[0].numeric!;
  rate.matchedLaborCategory=s.title;rate.scopeText=s.title;rate.benchmarkFamily='Technical Writer';
  rate.rateRecords=[{id:'synthetic-senior',category:'Senior Technical Writer',vendor:'Synthetic',contract:'Synthetic',rate:rate.originalValue,experience:8}];
  assert.ok(laborCoverage(a.deal,a.evidence)[0].medianRate);
  rate.validatedBenchmarkRole=s.pwsTitle;rate.rateRecords[0].category='Junior Technical Writer';
  assert.equal(laborCoverage(a.deal,a.evidence)[0].medianRate,null);
  delete rate.validatedBenchmarkRole;delete rate.rateRecords;
  assert.equal(laborCoverage(a.deal,a.evidence)[0].medianRate,null);
});

test('unpriced and conflicting occupations retain source hours without selecting a partial subtotal',()=>{
  const a=pricedServicesFixture();
  a.deal.laborSignals[0].title='IT Infrastructure Security Specialist';
  a.deal.laborSignals[0].titleConflict='Pricing says IT Infrastructure Security Specialist; PWS says Personnel Security Specialist with background investigations.';
  a.evidence[0].numeric!.matchedLaborCategory=a.deal.laborSignals[0].title;a.evidence[0].numeric!.benchmarkFamily='Cybersecurity Engineer';
  const model=buildLaborModel(a.deal,a.evidence),p=calculateCompetitivePosition(a);
  assert.equal(model.quantityRows.length,96);assert.equal(model.totalHours,1050240);assert.equal(model.rows.length,90);
  assert.equal(p.unpricedRows.length,6);assert.equal(p.totalHours,p.pricedHours+p.unpricedRows.reduce((s,r)=>s+r.hours,0));
  assert.equal(p.target,null);assert.equal(p.confidence.quantities,'HIGH');
  assert.ok(p.scenarios.every(s=>!s.selected && s.basis==='PARTIAL_SUBTOTAL'));
  assert.match(p.missing.join(' '),/different occupations/);
});

test('the rationale describes an all-median protected case when no role receives a lower-quartile rate',()=>{
  const a=pricedServicesFixture();a.deal.laborSignals.forEach(s=>s.minExperienceYears=8);
  const p=calculateCompetitivePosition(a);
  assert.ok(p.rows.every(r=>r.protectionReason !== 'Role is unprotected; assume aggressive market posture.'));
  assert.match(p.scenarios[1].rationale,/Protect median economics/);
});

test('prefilled offers retain the full schedule, allow rate edits, and reject missing quantities or prices',()=>{
  const a=pricedServicesFixture();
  a.evidence=a.evidence.filter(e=>e.id!=='SYN-RATE-2');
  const draft=pricingDraft(a);
  assert.equal(draft.lines.length,97);assert.equal(draft.lines.filter(r=>r.targetUnitPrice==='').length,6);
  const inputs={...draft,completenessConfirmed:true,lines:draft.lines.map(r=>({...r,quantity:Number(r.quantity),lowUnitPrice:Number(r.lowUnitPrice || 100),targetUnitPrice:Number(r.targetUnitPrice || 150),highUnitPrice:Number(r.highUnitPrice || 200)}))};
  assert.ok(calculateSourcePricingScenario(inputs,a).target>0);
  inputs.lines[0].targetUnitPrice+=1;assert.doesNotThrow(()=>calculateSourcePricingScenario(inputs,a));
  inputs.lines.pop();assert.throws(()=>calculateSourcePricingScenario(inputs,a),/Retain the source quantity row/);
});

test('checked small-business box and agreeing clause resolve corroboration while an occupational conflict remains open',()=>{
  const a=pricedServicesFixture();
  a.deal.sourceConflicts=[{topic:'Set-aside designation',descriptions:['SF1449 shows Small Business checked; WOSB/EDWOSB/SDVOSB/HUBZone boxes not checked.','52.219-6 Notice of Total Small Business Set-Aside'],sources:['Synthetic SF1449','Synthetic clause'],resolution:'Treat as Total Small Business Set-Aside because the checked box and clause agree.'},{topic:'Role mismatch',descriptions:['Cybersecurity','Personnel security'],sources:['Synthetic Pricing','Synthetic PWS'],resolution:'Do not remap without amendment.'}];
  const result=reconcileSourceFacts(a);
  assert.equal(result.deal.sourceConflicts![0].status,'RESOLVED');assert.equal(result.deal.sourceConflicts![1].status,'OPEN');
  assert.equal(result.gaps.length,1);assert.doesNotMatch(calculateCompetitivePosition(result).missing.join(' '),/Resolve Set-aside/);
});

test('claim-specific rules expose security categories and reject due-date citations for transition timing',()=>{
  const a=pricedServicesFixture();
  a.deal.requirements[0].category='SECURITY' as never;
  assert.ok(governmentRules(a.deal,a.evidence).some(r=>/Top Secret facility/.test(r.detail)));
  const due={id:'DUE',type:'SOLICITATION_FACT' as const,sourceLabel:'Synthetic amendment',section:'page 2',claim:'Proposal due date is amended.',confidence:99};
  assert.match(claimSupportIssue('Transition must finish within the transition window.',[due],'INFERENCE')!,/transition timing/);
  assert.match(claimSupportIssue('Propose all labor categories.',[due],'FACT')!,/pricing-schedule/);
  assert.equal(claimSupportIssue('Propose all labor categories.',[{...due,claim:'Offerors must propose all labor categories for all periods.'}],'FACT'),undefined);
  assert.match(claimSupportIssue('Top Secret facility clearance is required.',[due],'FACT')!,/facility-clearance/);
});

test('partial labor totals and ceiling actuals cannot enter a scored full-price comparison',()=>{
  const a=pricedServicesFixture();assert.equal(comparisonReady(a,'EVALUATED_PRICE'),true);assert.equal(comparisonReady(a,'CONTRACT_CEILING'),false);
  const p=a.competitivePosition!;
  a.validation={frozenAt:a.meta.analyzedAt,predictionHash:'synthetic',predictedExpected:p.target,predictedAggressive:p.rangeLow,predictedConservative:p.rangeHigh,actualValue:p.target!,actualValueType:'EVALUATED_PRICE',comparableToPrediction:true,actualAwardee:'',inRange:true,expectedErrorPct:0,retrospectiveNotes:''};
  a.evidence=a.evidence.filter(e=>e.id!=='SYN-RATE-2');
  assert.equal(comparisonReady(a,'EVALUATED_PRICE'),false);assert.equal(preserveValidation(a)!.comparableToPrediction,false);assert.equal(preserveValidation(a)!.inRange,null);
});
