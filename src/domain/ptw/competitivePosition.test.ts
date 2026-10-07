import test from 'node:test';
import assert from 'node:assert/strict';
import { pricedServicesFixture } from '../../testFixtures/pricedServices';
import { calculateCompetitivePosition } from './competitivePosition';
import { dollars } from './laborModel';
import { enforceAuthoritativeAnalysis } from '../marketPosition/authoritative';

test('complete ramp yields priced role strategies, selected position and source-defined travel',()=>{
  const a=pricedServicesFixture(),p=a.competitivePosition!;
  assert.equal(p.rows.length,96);assert.equal(p.rows.reduce((s,r)=>s+r.hours,0),1050240);
  assert.equal(p.evaluationComplete,true);assert.equal(p.priceOrderFirst,true);assert.equal(p.scenarios.length,3);
  assert.ok(p.target!>p.rangeLow! && p.target!<p.rangeHigh!);
  const labor=dollars(p.rows.reduce((s,r)=>s+r.hours*r.recommendedRate*r.factor,0));
  assert.ok(Math.abs(p.target! - (labor + 20000)) < 0.1);assert.equal(p.components.length,1);
  assert.equal(p.confidence.quantities,'HIGH');assert.equal(p.confidence.overall,'MEDIUM');assert.equal(p.confidence.execution,'NOT_ASSESSED');
  assert.match(p.ceilingExplanation,/does not set PTW/);
});
test('complete arithmetic does not certify PTW confidence or an unknown selection method',()=>{
  const a=pricedServicesFixture();
  assert.equal(a.competitivePosition!.status,'FULL');
  assert.equal(a.competitivePosition!.confidence.competition,'LOW');
  assert.equal(a.competitivePosition!.confidence.overall,'MEDIUM');
  for (const scheme of [undefined,{...a.deal.evaluationScheme!,method:'UNKNOWN' as const},
    {...a.deal.evaluationScheme!,sourceRefs:[]}]) {
    a.deal.evaluationScheme=scheme;
    const p=calculateCompetitivePosition(a);
    assert.ok(p.target);
    assert.equal(p.status,'CONDITIONAL');
    assert.equal(p.evaluationComplete,false);
    assert.match(p.missing.join(' '),/source-selection method/);
  }
});
test('extension follows final-option rates; unknown convention remains provisional and visible',()=>{
  const a=pricedServicesFixture();
  const extension=a.competitivePosition!.rows.find(r=>r.period==='Six-month extension')!;
  assert.ok(Math.abs(extension.factor-1.034**4)<1e-12);
  a.deal.evaluationPricing!.extensionRateRule='ESCALATE';
  const changed=calculateCompetitivePosition(a);
  assert.ok(changed.target!>a.competitivePosition!.target!);
  assert.ok(Math.abs(changed.rows.find(r=>r.period==='Six-month extension')!.factor-1.034**5)<1e-12);
});
test('unknown travel indirects lower completeness without erasing the provisional price',()=>{
  const a=pricedServicesFixture();a.deal.evaluationPricing!.components[0].indirectTreatment='UNKNOWN';
  const p=calculateCompetitivePosition(a);assert.ok(p.target);assert.equal(p.evaluationComplete,false);assert.match(p.missing.join(' '),/indirect costs/);
  a.deal.evaluationPricing!.components[0].indirectTreatment='KNOWN';a.deal.evaluationPricing!.components[0].indirectPct=10;
  assert.equal(calculateCompetitivePosition(a).target,p.target!+2000);
});
test('strategy changes selected role rates without a fabricated tradeoff premium',()=>{
  const a=pricedServicesFixture();a.deal.evaluationMethod='Best value tradeoff; technical factors significantly outweigh price';a.deal.requirements=[];
  a.deal.evaluationScheme={method:'TRADE_OFF',priceWeight:'LOW',far522178Included:true,unbalancedPricingChecked:true,priceRealismChecked:false,costRealismChecked:false,sourceRefs:['Synthetic Section M']};
  const p=calculateCompetitivePosition(a);assert.equal(p.priceOrderFirst,false);
  assert.ok(p.rows.every(r=>r.recommendedRate===r.medianRate));
  const central = dollars(p.rows.reduce((s,r)=>s+r.hours*r.recommendedRate*r.factor,0));
  assert.ok(Math.abs(p.target! - (central+20000)) < 0.1);
});
test('evaluation method never supplies an unsupported ceiling-to-offer discount',()=>{
  const a=pricedServicesFixture();
  a.deal.laborSignals[1].clearance='None';
  for (const scheme of [a.deal.evaluationScheme,
    {...a.deal.evaluationScheme!,method:'TRADE_OFF' as const,priceWeight:'SIGNIFICANT' as const},
    {...a.deal.evaluationScheme!,method:'UNKNOWN' as const,priceWeight:'UNKNOWN' as const},undefined]) {
    a.deal.evaluationScheme=scheme;
    const p=calculateCompetitivePosition(a);
    const row=p.rows.find(r=>r.title==='Help Desk')!;
    assert.equal(row.recommendedRate,p.priceOrderFirst?row.lowRate:row.medianRate);
    assert.equal(row.low,dollars(row.hours*row.lowRate*row.factor));
    assert.equal(row.high,dollars(row.hours*row.highRate*row.factor));
    assert.match(row.bidTransformAssumption,/No ceiling-to-offer discount/);
  }
});
test('sensitivity reproduces isolated rate movements and protects input authority',()=>{
  const a=pricedServicesFixture(),p=a.competitivePosition!;
  assert.equal(p.sensitivities[0].delta,dollars(p.rows.reduce((s,r)=>s+r.hours*r.factor,0)));
  a.competitivePosition!.target=1;
  assert.equal(enforceAuthoritativeAnalysis(a).competitivePosition!.target,p.scenarios[1].total);
});
test('missing role quantities yield labeled partial working material, never a complete price',()=>{
  const a=pricedServicesFixture();delete a.deal.laborSignals[0].periods;delete a.deal.laborSignals[0].quantity;
  const p=calculateCompetitivePosition(a);assert.equal(p.target,null);assert.equal(p.status,'PARTIAL');assert.ok(p.rows.length);assert.equal(p.evaluationComplete,false);
});
