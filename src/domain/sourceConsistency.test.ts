import test from 'node:test';
import assert from 'node:assert/strict';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis';
import { reconcileSourceFacts } from './sourceConsistency';
import { benchmarkRole, laborRoleMatch, qualificationMatch } from './laborMatching';

test('sourced NAICS resolves an illegible-code gap and contradictory next action',()=>{
  const a=opportunityAnalysisFixture();a.deal.naics='Unknown';a.deal.facts=[{label:'NAICS',value:'518210',section:'SF1449 Block 10',confidence:99}];
  a.gaps=[{question:'NAICS code is not legible; confirm it.',impact:'Field definition',priority:'HIGH'}];a.narrative.nextActions=['Confirm missing NAICS code.'];
  const result=reconcileSourceFacts(a);assert.equal(result.deal.naics,'518210');assert.deepEqual(result.gaps,[]);assert.deepEqual(result.narrative.nextActions,[]);
});
test('generic company support is removed; pursuit-specific sourced competitor intelligence is retained',()=>{
  const a=opportunityAnalysisFixture();a.competitors=[{name:'Example Co',role:'POSSIBLE_BIDDER',pricingPosture:'UNKNOWN',rationale:'Works in this industry',differentiators:[],risks:[],sourceRefs:['COMP'],confidence:20,evidenceType:'ANALYST_INFERENCE'}];
  a.evidence.push({id:'COMP',type:'EXTERNAL_SOURCE',sourceLabel:'Company source',url:'https://example.com',claim:'Example Co supports enterprise IT.',confidence:70});
  assert.equal(reconcileSourceFacts(a).competitors.length,0);
  a.evidence.at(-1)!.claim=`Example Co expressed interest in ${a.deal.solicitationNumber}; bidding intent unconfirmed.`;
  assert.equal(reconcileSourceFacts(a).competitors.length,1);
});
test('duties separate personnel security from cybersecurity and target intelligence from network operations',()=>{
  assert.equal(benchmarkRole({title:'IT Infrastructure Security Specialist',duties:'Processes personnel background investigations.'}),'Personnel Security Specialist');
  assert.equal(laborRoleMatch('Network Analyst','Target Digital Network Analyst'),0);
  assert.equal(qualificationMatch({title:'Network Engineer',minExperienceYears:8},{min_years_experience:2}),false);
  assert.equal(qualificationMatch({title:'Network Engineer',location:'Government site'},{worksite:'Contractor site'}),false);
});
