import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AiAnalysisDraft,
  EvidenceItem,
  NumericEvidence,
  OpportunityAnalysis,
} from '../../types';
import { authoritativeScenarioValues, enforceAuthoritativeAnalysis, hasAuthoritativeDollarClaim, sanitizeNarrative } from './authoritative';
import { scoreComparability } from './comparability';
import { calculateDeterministicScenarios } from './scenarioEngine';
import { normalizeNumericEvidence } from './valueNormalization';

const asOfDate = '2026-08-29T12:00:00.000Z';

const deal: AiAnalysisDraft['deal'] = {
  title: 'Enterprise Data Platform Services',
  agency: 'Department of Example',
  solicitationNumber: 'EX-26-001',
  contractType: 'Firm-Fixed-Price',
  dueDate: '2026-09-30',
  periodOfPerformance: '5 years',
  naics: '541512',
  psc: 'DA01',
  awardStructure: 'Single award',
  evaluationMethod: 'Best value tradeoff',
  scopeSummary: 'Enterprise data platform modernization, cloud engineering, cybersecurity, and operations.',
  facts: [],
  requirements: [],
  laborSignals: [{ title: 'Cloud Engineer', quantity: 20, location: 'Washington DC', clearance: 'Secret' }],
  pricingSignals: [],
};

const marketAssessment: AiAnalysisDraft['marketAssessment'] = {
  posture: 'MARKET_ALIGNED',
  summary: 'Comparable evidence supports an evidence-led market view.',
  basis: ['Comparable total-value evidence'],
  drivers: [{ name: 'Competition', assessment: 'Competitive pressure is an analytical inference.', evidenceIds: ['A-1'], inference: true }],
};

function numeric(overrides: Partial<NumericEvidence> = {}): NumericEvidence {
  return {
    originalValue: 100_000_000,
    valueType: 'TOTAL_AWARD_VALUE',
    currency: 'USD',
    units: 'TOTAL_USD',
    periodMonths: 60,
    baseYear: 2026,
    sourceDate: '2025-08-29',
    endDate: '2025-12-31',
    agency: deal.agency,
    naics: deal.naics,
    psc: deal.psc,
    contractType: deal.contractType,
    acquisitionStructure: deal.awardStructure,
    scopeText: deal.scopeSummary,
    laborIntensity: 'MEDIUM',
    technologySecurityLocation: 'cloud engineering cybersecurity Washington DC Secret',
    ...overrides,
  };
}

function evidence(
  id: string,
  value: number,
  overrides: Partial<NumericEvidence> = {},
  itemOverrides: Partial<EvidenceItem> = {},
): EvidenceItem {
  return {
    id,
    type: 'EXTERNAL_SOURCE',
    sourceLabel: `Official source ${id}`,
    sourceRecordId: `record-${id}`,
    claim: `Comparable total value for ${id}.`,
    url: `https://example.test/${id}`,
    retrievedAt: asOfDate,
    confidence: 98,
    numeric: numeric({ originalValue: value, ...overrides }),
    ...itemOverrides,
  };
}

function draft(items: EvidenceItem[], gaps: AiAnalysisDraft['gaps'] = []): AiAnalysisDraft {
  return {
    deal,
    marketAssessment,
    competitors: [],
    incumbent: { name: '', status: 'UNKNOWN', strengths: [], vulnerabilities: [], transitionRisk: 'UNKNOWN', confidence: 0, sourceRefs: [] },
    evidence: items,
    gaps,
    narrative: {
      headline: 'Evidence-led Market Position',
      rationale: 'The deterministic engine owns the calculation.',
      decisionFactors: [],
      guardrails: [],
      nextActions: [],
    },
  };
}

test('calculates Expected as the deterministic weighted average of eligible anchors', () => {
  const result = calculateDeterministicScenarios(draft([
    evidence('A-1', 100_000_000, { opportunitySpecific: true }, { type: 'SOLICITATION_FACT', section: 'L.3' }),
    evidence('A-2', 220_000_000),
  ]), { asOfDate });
  const included = result.anchors.filter((anchor) => anchor.included);
  const expected = Math.round(included.reduce((sum, anchor) => sum + (anchor.normalizedValue || 0) * anchor.weight, 0) /
    included.reduce((sum, anchor) => sum + anchor.weight, 0));
  assert.equal(result.expected, expected);
  assert.ok((result.expected || 0) < 160_000_000, 'the higher-quality opportunity-specific anchor should exert more influence');
});

test('scores a close comparable above a weak, poorly described record', () => {
  const close = scoreComparability(evidence('CLOSE', 100_000_000), deal, asOfDate);
  const weak = scoreComparability(evidence('WEAK', 100_000_000, {
    agency: 'Unrelated Agency',
    naics: '236220',
    psc: 'Y1AA',
    contractType: 'Construction',
    acquisitionStructure: 'Multiple award vehicle',
    scopeText: 'Building construction and facilities repair',
    periodMonths: 12,
    sourceDate: '2015-01-01',
    technologySecurityLocation: 'rural construction site',
  }), deal, asOfDate);
  assert.ok(close.score > weak.score);
  assert.ok(close.score >= 0.8);
  assert.ok(weak.score < 0.55);
});

test('normalizes recurring service duration with an explicit traceable step', () => {
  const item = evidence('POP', 20_000_000, { periodMonths: 12, recurringService: true });
  const result = normalizeNumericEvidence(item, deal, [item], asOfDate);
  assert.equal(result.normalizedValue, 100_000_000);
  assert.equal(result.steps[0].type, 'PERIOD');
  assert.equal(result.steps[0].factor, 5);
  assert.deepEqual(result.steps[0].evidenceIds, ['POP']);
});

test('never mixes hourly rates or escalation percentages into total contract value', () => {
  const result = calculateDeterministicScenarios(draft([
    evidence('TOTAL', 100_000_000, { opportunitySpecific: true }, { type: 'SOLICITATION_FACT', section: 'B.2' }),
    evidence('RATE', 190, {
      valueType: 'HOURLY_CEILING_RATE',
      units: 'USD_PER_HOUR',
      periodMonths: undefined,
    }),
    evidence('BLS', 3.4, {
      valueType: 'ESCALATION_RATE',
      units: 'PERCENT',
      currency: 'UNKNOWN',
      periodMonths: undefined,
    }),
  ]), { asOfDate });
  assert.equal(result.expected, 100_000_000);
  assert.equal(result.anchors.find((anchor) => anchor.evidenceId === 'RATE')?.role, 'COMPONENT');
  assert.equal(result.anchors.find((anchor) => anchor.evidenceId === 'BLS')?.role, 'MODIFIER');
  assert.equal(result.anchors.filter((anchor) => anchor.included).length, 1);
});

test('returns a wide directional range for one exceptionally strong anchor', () => {
  const result = calculateDeterministicScenarios(draft([
    evidence('DIRECT', 80_000_000, { opportunitySpecific: true }, { type: 'SOLICITATION_FACT', section: 'B.1' }),
  ]), { asOfDate });
  assert.equal(result.rangeStatus, 'DIRECTIONAL');
  assert.equal(result.expected, 80_000_000);
  assert.ok(result.rangeWidthPct >= 20);
  assert.ok((result.aggressive || 0) <= (result.expected || 0));
  assert.ok((result.expected || 0) <= (result.conservative || 0));
});

test('multiple strong consistent anchors produce a supported narrower range', () => {
  const consistent = calculateDeterministicScenarios(draft([
    evidence('S-1', 100_000_000),
    evidence('S-2', 104_000_000),
    evidence('S-3', 108_000_000),
  ]), { asOfDate });
  const conflicting = calculateDeterministicScenarios(draft([
    evidence('X-1', 60_000_000),
    evidence('X-2', 180_000_000),
    evidence('X-3', 300_000_000),
  ]), { asOfDate });
  assert.equal(consistent.rangeStatus, 'SUPPORTED');
  assert.equal(conflicting.rangeStatus, 'SUPPORTED');
  assert.ok(consistent.rangeWidthPct < conflicting.rangeWidthPct);
  assert.ok(consistent.evidenceReadiness.consistency > conflicting.evidenceReadiness.consistency);
});

test('weak or sparse indirect evidence returns insufficient evidence', () => {
  const result = calculateDeterministicScenarios(draft([
    evidence('WEAK', 100_000_000, {
      agency: undefined,
      naics: undefined,
      psc: undefined,
      contractType: undefined,
      acquisitionStructure: undefined,
      periodMonths: undefined,
      scopeText: 'Unrelated facilities work',
      laborIntensity: 'UNKNOWN',
      technologySecurityLocation: undefined,
      sourceDate: undefined,
    }, { sourceRecordId: undefined, url: undefined, retrievedAt: undefined }),
  ]), { asOfDate });
  assert.equal(result.rangeStatus, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.aggressive, null);
  assert.equal(result.expected, null);
  assert.equal(result.conservative, null);
});

test('returns insufficient evidence rather than manufacturing a value with no eligible anchors', () => {
  const result = calculateDeterministicScenarios(draft([]), { asOfDate });
  assert.equal(result.rangeStatus, 'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(authoritativeScenarioValues(result), { aggressive: null, expected: null, conservative: null });
});

test('excludes shared multiple-award ceilings from Expected', () => {
  const result = calculateDeterministicScenarios(draft([
    evidence('SHARED', 500_000_000, {
      valueType: 'CONTRACT_CEILING',
      opportunitySpecific: true,
      sharedAcrossAwards: true,
    }, { type: 'SOLICITATION_FACT', section: 'B.3' }),
  ]), { asOfDate });
  assert.equal(result.expected, null);
  assert.equal(result.anchors[0].included, false);
  assert.match(result.anchors[0].exclusionReasons.join(' '), /shared/i);
});

test('same approved evidence and as-of date reproduce the same authoritative values', () => {
  const items = [evidence('R-1', 90_000_000), evidence('R-2', 110_000_000)];
  const first = calculateDeterministicScenarios(draft(items), { asOfDate });
  const second = calculateDeterministicScenarios(draft([...items]), { asOfDate });
  assert.deepEqual(authoritativeScenarioValues(first), authoritativeScenarioValues(second));
  assert.equal(first.formulaVersion, second.formulaVersion);
  assert.equal(first.evidenceReadiness.score, second.evidenceReadiness.score);
});

test('server authority recalculates tampered values and scrubs AI dollar claims', () => {
  const baseDraft = draft([
    evidence('AUTH-1', 100_000_000, { opportunitySpecific: true }, { type: 'SOLICITATION_FACT', section: 'B.1' }),
  ]);
  const calculated = calculateDeterministicScenarios(baseDraft, { asOfDate });
  const analysis: OpportunityAnalysis = {
    id: 'run-test',
    deal,
    marketPosition: {
      ...calculated,
      aggressive: 1,
      expected: 2,
      conservative: 3,
      basis: ['$800 million unsupported basis'],
      drivers: [{ name: 'Price', assessment: 'Target 900 million', evidenceIds: [], inference: true }],
    },
    competitors: [],
    incumbent: baseDraft.incumbent,
    evidence: baseDraft.evidence,
    gaps: [],
    narrative: {
      headline: 'Target $999 million',
      rationale: 'Use 999 million as the range.',
      decisionFactors: ['Stay near $999M'],
      guardrails: [],
      nextActions: [],
    },
    meta: {
      mode: 'MARKET_ONLY',
      model: 'test',
      analyzedAt: asOfDate,
      researchStatus: 'SOLICITATION_ONLY',
      warnings: [],
    },
  };
  const enforced = enforceAuthoritativeAnalysis(analysis);
  assert.deepEqual(authoritativeScenarioValues(enforced.marketPosition), authoritativeScenarioValues(calculated));
  assert.equal(hasAuthoritativeDollarClaim(enforced.narrative), false);
  assert.equal(hasAuthoritativeDollarClaim(sanitizeNarrative(analysis.narrative)), false);
  assert.doesNotMatch(enforced.marketPosition.basis.join(' '), /800 million/i);
  assert.doesNotMatch(enforced.marketPosition.drivers.map((driver) => driver.assessment).join(' '), /900 million/i);
});
