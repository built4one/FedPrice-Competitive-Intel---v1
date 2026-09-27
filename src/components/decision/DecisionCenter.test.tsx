import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OpportunityAnalysis } from '../../types';
import DecisionCenter from './DecisionCenter';
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

test('Decision Center displays the exact authoritative scenario-engine values', () => {
  const html = renderToStaticMarkup(<DecisionCenter analysis={analysis} />);
  assert.match(html, /\$100,000,000/);
  assert.match(html, /\$200,000,000/);
  assert.match(html, /\$300,000,000/);
  assert.doesNotMatch(html, /Opportunity score/i);
  assert.doesNotMatch(html, /targetPrice|rangeLow|rangeHigh/);
  assert.doesNotMatch(html, /Plan around|Aggressive|Conservative/);
  assert.match(html, /The competitive decision comes first/);
  assert.match(html, /Central reference/);
});

test('decision brief presents distinct strategies, rejection rationale, sources, and change triggers before market values', async () => {
  const {analysis,strategy} = ptwStrategyFixture();
  analysis.ptwStrategy = await synthesizePtwStrategy(analysis,{interpret:async <T,>() => strategy as T});
  const html = renderToStaticMarkup(<DecisionCenter analysis={analysis} />);
  assert.ok(html.indexOf(strategy.options[0].name) < html.indexOf('Central reference'));
  assert.ok(html.includes(strategy.options[1].name));
  assert.ok(html.includes(strategy.recommendation.alternatives[0].reason.text));
  assert.ok(html.includes(strategy.recommendation.changeTriggers[0].text));
  assert.match(html,/SOL-EVAL/);
  assert.match(html,/Analyst review required/);
  assert.doesNotMatch(html,/Plan around/);
});
