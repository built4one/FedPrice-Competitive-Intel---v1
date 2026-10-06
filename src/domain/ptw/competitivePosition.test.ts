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
  assert.equal(p.target,labor+20000);assert.equal(p.components.length,1);
  assert.equal(p.confidence.quantities,'HIGH');assert.equal(p.confidence.overall,'LOW');assert.equal(p.confidence.execution,'NOT_ASSESSED');
  assert.equal(p.rows.find(r=>r.title==='Project Manager II')!.recommendedRate,144);
  assert.equal(p.rows.find(r=>r.title==='Help Desk')!.recommendedRate,101);
  assert.match(p.ceilingExplanation,/does not set PTW/);
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
  const p=calculateCompetitivePosition(a);assert.equal(p.priceOrderFirst,false);assert.equal(p.target,dollars(p.rows.reduce((s,r)=>s+r.hours*r.medianRate*r.factor,0))+20000);
});
test('sensitivity reproduces isolated rate movements and protects input authority',()=>{
  const a=pricedServicesFixture(),p=a.competitivePosition!;
  assert.equal(p.sensitivities[0].delta,dollars(p.rows.reduce((s,r)=>s+r.hours*r.factor,0)));
  a.competitivePosition!.target=1;
  assert.equal(enforceAuthoritativeAnalysis(a).competitivePosition!.target,p.scenarios[1].total);
});
test('missing role quantities yield labeled partial working material, never a complete price',()=>{
  const a=pricedServicesFixture();delete a.deal.laborSignals[0].periods;delete a.deal.laborSignals[0].quantity;
  const p=calculateCompetitivePosition(a);assert.equal(p.target,null);assert.equal(p.status,'PARTIAL_MODEL');assert.ok(p.rows.length);assert.equal(p.evaluationComplete,false);
});
