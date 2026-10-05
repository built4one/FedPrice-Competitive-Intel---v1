import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentIssues, normalizeGaps } from './analysisQuality';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis';

test('mixed-case critical gaps and strategy/source failures survive into shared report issues', () => {
  const analysis = opportunityAnalysisFixture();
  analysis.gaps = [{question:'Incumbent not identified',impact:'Comparable scope unknown',priority:'High' as 'HIGH'}];
  analysis.ptwStrategy = {status:'UNAVAILABLE',version:'test',reason:'Strategy validation failed'};
  analysis.meta.connectors = [{name:'SAM.gov',status:'UNAVAILABLE',recordsFound:0,message:'Key missing'}];
  assert.equal(normalizeGaps(analysis.gaps)[0].priority,'HIGH');
  const text = assessmentIssues(analysis).join(' ');
  assert.match(text,/Incumbent not identified/);
  assert.match(text,/Strategy validation failed/);
  assert.match(text,/SAM.gov: UNAVAILABLE/);
});
