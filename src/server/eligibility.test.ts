import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessEligibility } from './eligibility';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis';
test('current competitive RFP passes and unresolved metadata remains visible',()=>{
  const deal={...opportunityAnalysisFixture().deal,dueDate:'2026-12-01',documentStatus:'OPEN_COMPETITIVE',eligibilitySource:'RFP Section L'};
  assert.deepEqual(assessEligibility(deal,new Date('2026-10-04')),[]);
  assert.ok(assessEligibility({...deal,documentStatus:'UNKNOWN',dueDate:'Unknown'}).length>=2);
});
test('closed, sole-source, sources-sought and unrelated packages are blocked with actionable reasons',()=>{
  const deal={...opportunityAnalysisFixture().deal,dueDate:'2026-12-01',eligibilitySource:'RFP cover page'};
  for(const documentStatus of ['EXPIRED','NONCOMPETITIVE','PRE_SOLICITATION','NON_SOLICITATION']) assert.throws(()=>assessEligibility({...deal,documentStatus}),/Upload/);
  assert.throws(()=>assessEligibility({...deal,dueDate:'2026-01-01'},new Date('2026-10-04')),/deadline.*passed/);
  assert.ok(assessEligibility({...deal,documentStatus:'NONCOMPETITIVE',eligibilitySource:''}).length>0);
});
