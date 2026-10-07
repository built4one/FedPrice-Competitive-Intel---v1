import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OpportunityAnalysis } from '../../types';
import DecisionCenter from './DecisionCenter';
import AnalystDetails from './AnalystDetails';
import {pricedServicesFixture} from '../../testFixtures/pricedServices';
import { ptwStrategyFixture } from '../../testFixtures/ptwStrategy';
import { synthesizePtwStrategy } from '../../server/ptwSynthesis';

const analysis: OpportunityAnalysis = {
  id: 'run-ui-test',
  deal: {
    title: 'Decision Center Test',
    agency: 'Example Agency',
    solicitationNumber: 'EX-1',
    contractType: 'FFP',
    dueDate: '',
    periodOfPerformance: '5 years',
    naics: '541512',
    awardStructure: 'Single award',
    evaluationMethod: 'Best value',
    scopeSummary: 'Test',
    facts: [],
    requirements: [],
    laborSignals: [],
    pricingSignals: [],
  },
  marketPosition: {
    currency: 'USD',
    aggressive: 100_000_000,
    expected: 200_000_000,
    conservative: 300_000_000,
    rangeStatus: 'SUPPORTED',
    posture: 'MARKET_ALIGNED',
    summary: 'Test summary',
    estimationMethod: 'COMPARABLE_AWARDS',
    methodLabel: 'Comparable awards',
    confidence: 'HIGH',
    formulaVersion: 'market-position-v3.0.0',
    publicBenchmark: {
      status: 'SUPPORTED', aggressive: 100_000_000, expected: 200_000_000,
      conservative: 300_000_000, evidenceIds: [], summary: 'Supported benchmark.',
    },
    evidenceReadiness: {
      score: 80,
      comparability: 80,
      evidenceQuality: 80,
      normalizationConfidence: 80,
      effectiveQuantity: 80,
      sourceDiversity: 80,
      consistency: 80,
      gapResolution: 80,
    },
    anchors: [],
    effectiveSampleSize: 2,
    dispersionPct: 5,
    rangeWidthPct: 10,
    constraints: [],
    rangeFactors: [],
    assumptions: [],
    verifiedInputs: [],
    sensitivities: [],
    basis: [],
    drivers: [],
  },
  competitors: [],
  incumbent: {
    name: '',
    status: 'UNKNOWN',
    strengths: [],
    vulnerabilities: [],
    transitionRisk: 'UNKNOWN',
    confidence: 0,
    sourceRefs: [],
  },
  evidence: [],
  gaps: [],
  narrative: {
    headline: 'Authoritative calculation test',
    rationale: 'The visible values must come from MarketPosition.',
    decisionFactors: [],
    guardrails: [],
    nextActions: [],
  },
  meta: {
    mode: 'MARKET_ONLY',
    model: 'test',
    analyzedAt: '2026-08-29T12:00:00.000Z',
    researchStatus: 'SOLICITATION_ONLY',
    warnings: [],
  },
};

test('executive view displays the recomputed PTW and corridor without readiness scores',()=>{
  const a=pricedServicesFixture(),p=a.competitivePosition!;
  const html=renderToStaticMarkup(<DecisionCenter analysis={a}/>);
  for(const n of [p.target,p.rangeLow,p.rangeHigh])assert.ok(html.includes(new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n!)));
  for(const question of ['Where should we price?','Why this position?','Recommendation Confidence','What could move it?','What should we do next?'])assert.ok(html.includes(question));
  assert.doesNotMatch(html,/readiness|\/100|Central reference/i);
});
test('supporting strategy remains in the analyst workspace instead of competing with the recommendation',async()=>{
  const {analysis,strategy}=ptwStrategyFixture();
  analysis.ptwStrategy=await synthesizePtwStrategy(analysis,{interpret:async<T,>()=>strategy as T});
  const executive=renderToStaticMarkup(<DecisionCenter analysis={analysis}/>);
  assert.ok(!executive.includes(strategy.options[0].name));
  const detail=renderToStaticMarkup(<AnalystDetails analysis={analysis}/>);
  assert.ok(detail.includes(strategy.options[0].name));assert.ok(detail.includes(strategy.recommendation.alternatives[0].reason.text));
});
