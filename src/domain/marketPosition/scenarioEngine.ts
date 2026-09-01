import type {
  AiAnalysisDraft,
  ConfidenceLevel,
  EstimationMethod,
  EvaluatedNumericAnchor,
  EvidenceItem,
  MarketPosition,
  NumericEvidence,
  PublicMarketBenchmark,
} from '../../types';
import { scoreComparability, scoreEvidenceQuality } from './comparability';
import { ENGINE_THRESHOLDS, MARKET_POSITION_ENGINE_VERSION } from './engineConfig';
import { calculateEvidenceReadiness, effectiveSampleSize } from './readiness';
import { determineCalculationRole, extractPeriodMonths, normalizeNumericEvidence } from './valueNormalization';

interface EngineOptions {
  asOfDate: string;
}

interface ScenarioCandidate {
  method: EstimationMethod;
  methodLabel: string;
  anchors: EvaluatedNumericAnchor[];
  aggressive: number;
  expected: number;
  conservative: number;
  status: 'SUPPORTED' | 'DIRECTIONAL' | 'INSUFFICIENT_EVIDENCE';
  readiness: MarketPosition['evidenceReadiness'];
  sampleSize: number;
  dispersion: number;
  rangeWidth: number;
  rangeFactors: string[];
  assumptions: string[];
  verifiedInputs: string[];
  sensitivities: string[];
}

const roundCurrency = (value: number) => Math.round(value);
const roundScore = (value: number) => Math.round(value * 100) / 100;
const clamp = (minimum: number, maximum: number, value: number) => Math.min(maximum, Math.max(minimum, value));

function legacyNumericEvidence(evidence: EvidenceItem): NumericEvidence | undefined {
  if (evidence.numeric) return evidence.numeric;
  if (!Number.isFinite(evidence.value) || !evidence.value || evidence.value <= 0) return undefined;
  return {
    originalValue: evidence.value,
    valueType: 'UNKNOWN',
    currency: evidence.units?.toLowerCase().includes('usd') ? 'USD' : 'UNKNOWN',
    units: 'OTHER',
  };
}

function evaluateAnchor(
  original: EvidenceItem,
  draft: Pick<AiAnalysisDraft, 'deal' | 'evidence'>,
  options: EngineOptions,
): EvaluatedNumericAnchor | null {
  const numeric = legacyNumericEvidence(original);
  if (!numeric) return null;
  const evidence: EvidenceItem = original.numeric ? original : { ...original, numeric };
  const role = determineCalculationRole(numeric, options.asOfDate);
  const comparability = scoreComparability(evidence, draft.deal, options.asOfDate);
  const evidenceQuality = scoreEvidenceQuality(evidence);
  const normalization = normalizeNumericEvidence(evidence, draft.deal, draft.evidence, options.asOfDate);
  const exclusionReasons = [...normalization.notes];

  if (numeric.sharedAcrossAwards) exclusionReasons.push('Shared or multiple-award ceiling cannot represent one award price.');
  if (role === 'COMPONENT') exclusionReasons.push('Component rate requires a complete staffing-and-hours model before it can become a total-value basis.');
  if (role === 'MODIFIER') exclusionReasons.push('Escalation evidence may normalize another value but is not a dollar anchor.');
  if (role === 'CONTEXT') exclusionReasons.push('Funding, obligations, or budget context is not a like-for-like total evaluated price.');
  if (role === 'CONSTRAINT') exclusionReasons.push('A ceiling can constrain a range but cannot determine Expected by itself.');
  if (role === 'EXCLUDED') exclusionReasons.push('Value type or units are not eligible for total-value calculation.');
  if (role === 'CENTRAL_ANCHOR' && comparability.score < ENGINE_THRESHOLDS.minimumComparability) {
    exclusionReasons.push(`Comparability ${Math.round(comparability.score * 100)} is below the ${Math.round(ENGINE_THRESHOLDS.minimumComparability * 100)} inclusion threshold.`);
  }
  if (role === 'CENTRAL_ANCHOR' && evidenceQuality < ENGINE_THRESHOLDS.minimumEvidenceQuality) {
    exclusionReasons.push(`Evidence quality ${Math.round(evidenceQuality * 100)} is below the ${Math.round(ENGINE_THRESHOLDS.minimumEvidenceQuality * 100)} inclusion threshold.`);
  }
  if (role === 'CENTRAL_ANCHOR' && normalization.confidence < ENGINE_THRESHOLDS.minimumNormalizationConfidence) {
    exclusionReasons.push(`Normalization confidence ${Math.round(normalization.confidence * 100)} is below the ${Math.round(ENGINE_THRESHOLDS.minimumNormalizationConfidence * 100)} inclusion threshold.`);
  }
  if (normalization.normalizedValue === null) exclusionReasons.push('No valid normalized value is available.');

  const included = role === 'CENTRAL_ANCHOR' &&
    normalization.normalizedValue !== null &&
    !numeric.sharedAcrossAwards &&
    comparability.score >= ENGINE_THRESHOLDS.minimumComparability &&
    evidenceQuality >= ENGINE_THRESHOLDS.minimumEvidenceQuality &&
    normalization.confidence >= ENGINE_THRESHOLDS.minimumNormalizationConfidence;
  const weight = included ? (comparability.score ** 2) * evidenceQuality * normalization.confidence : 0;

  return {
    id: `ANCHOR-${evidence.id}`,
    evidenceId: evidence.id,
    sourceLabel: evidence.sourceLabel,
    originalValue: numeric.originalValue,
    normalizedValue: normalization.normalizedValue,
    valueType: numeric.valueType,
    units: numeric.units,
    role,
    comparabilityScore: roundScore(comparability.score),
    comparability: { ...comparability.breakdown, coverage: roundScore(comparability.breakdown.coverage) },
    evidenceQuality: roundScore(evidenceQuality),
    normalizationConfidence: roundScore(normalization.confidence),
    weight: roundScore(weight),
    included,
    inclusionRationale: included
      ? 'Eligible total-value evidence met comparability, quality, and normalization thresholds.'
      : undefined,
    exclusionReasons: [...new Set(exclusionReasons)],
    normalizationSteps: normalization.steps,
    evidenceIds: [...new Set([evidence.id, ...normalization.steps.flatMap((step) => step.evidenceIds)])],
    opportunitySpecific: numeric.opportunitySpecific,
    valueBasis: numeric.valueBasis,
    rangeBound: numeric.rangeBound,
    rangeId: numeric.rangeId,
  };
}

function confidenceFor(status: ScenarioCandidate['status'], readiness: number): ConfidenceLevel {
  if (status === 'SUPPORTED' && readiness >= 75) return 'HIGH';
  if (status === 'SUPPORTED' || (status === 'DIRECTIONAL' && readiness >= 55)) return 'MEDIUM';
  return 'LOW';
}

function scenarioFromAnchors(
  method: EstimationMethod,
  methodLabel: string,
  anchors: EvaluatedNumericAnchor[],
  gaps: AiAnalysisDraft['gaps'],
): ScenarioCandidate | null {
  const usable = anchors.filter((anchor) => anchor.included && anchor.normalizedValue !== null && anchor.weight > 0);
  if (!usable.length) return null;
  const totalWeight = usable.reduce((sum, anchor) => sum + anchor.weight, 0);
  if (totalWeight <= 0) return null;

  const expectedRaw = usable.reduce((sum, anchor) => sum + (anchor.normalizedValue || 0) * anchor.weight, 0) / totalWeight;
  const dispersion = usable.reduce(
    (sum, anchor) => sum + anchor.weight * Math.abs((anchor.normalizedValue || 0) - expectedRaw) / expectedRaw,
    0,
  ) / totalWeight;
  const readiness = calculateEvidenceReadiness(usable, gaps, dispersion);
  const sampleSize = effectiveSampleSize(usable);
  let status: ScenarioCandidate['status'] = usable.length >= 2 &&
    sampleSize >= 1.4 &&
    readiness.score >= ENGINE_THRESHOLDS.supportedReadiness
    ? 'SUPPORTED'
    : readiness.score >= ENGINE_THRESHOLDS.directionalReadiness
      ? 'DIRECTIONAL'
      : 'INSUFFICIENT_EVIDENCE';

  if (usable.length === 1) {
    const single = usable[0];
    const exceptionallyStrong = single.comparabilityScore >= 0.65 &&
      single.evidenceQuality >= 0.65 &&
      single.normalizationConfidence >= 0.65;
    status = exceptionallyStrong ? 'DIRECTIONAL' : 'INSUFFICIENT_EVIDENCE';
  }

  let rangeWidth = clamp(
    ENGINE_THRESHOLDS.minimumRangeWidth,
    ENGINE_THRESHOLDS.maximumRangeWidth,
    dispersion + 0.25 * (1 - readiness.score / 100),
  );
  if (usable.length === 1) rangeWidth = Math.max(rangeWidth, ENGINE_THRESHOLDS.oneAnchorMinimumRangeWidth);
  if (usable.length === 2) rangeWidth = Math.max(rangeWidth, ENGINE_THRESHOLDS.twoAnchorMinimumRangeWidth);

  let expected = expectedRaw;
  let aggressive = expected * (1 - rangeWidth);
  let conservative = expected * (1 + rangeWidth);
  const rangeFactors = [
    `${usable.length} eligible ${methodLabel.toLowerCase()} anchor${usable.length === 1 ? '' : 's'} produced an effective sample size of ${sampleSize.toFixed(2)}.`,
    `Weighted anchor dispersion was ${Math.round(dispersion * 100)}%.`,
    `Evidence Readiness was ${readiness.score}/100.`,
  ];

  const officialRanges = new Map<string, EvaluatedNumericAnchor[]>();
  for (const anchor of usable) {
    if (!anchor.rangeId || !anchor.rangeBound || anchor.valueBasis !== 'INDIVIDUAL_AWARD') continue;
    officialRanges.set(anchor.rangeId, [...(officialRanges.get(anchor.rangeId) || []), anchor]);
  }
  const officialRange = [...officialRanges.values()].find((items) =>
    items.some((item) => item.rangeBound === 'LOW') && items.some((item) => item.rangeBound === 'HIGH'),
  );
  if (officialRange) {
    const low = officialRange.find((item) => item.rangeBound === 'LOW')?.normalizedValue;
    const high = officialRange.find((item) => item.rangeBound === 'HIGH')?.normalizedValue;
    if (low !== null && low !== undefined && high !== null && high !== undefined && low <= high) {
      aggressive = low;
      conservative = high;
      expected = clamp(low, high, expected);
      rangeFactors.push('A solicitation-stated individual-award range directly bounded Aggressive and Conservative.');
    }
  }

  return {
    method,
    methodLabel,
    anchors: usable,
    aggressive: roundCurrency(aggressive),
    expected: roundCurrency(expected),
    conservative: roundCurrency(conservative),
    status,
    readiness,
    sampleSize: roundScore(sampleSize),
    dispersion,
    rangeWidth,
    rangeFactors,
    assumptions: [],
    verifiedInputs: usable.map((anchor) => `${anchor.evidenceId} - ${anchor.sourceLabel}`),
    sensitivities: [],
  };
}

const roleTokens = (value?: string) => new Set((value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) =>
  token.length > 2 && !['senior', 'junior', 'lead', 'level', 'specialist'].includes(token),
));

function roleMatch(left?: string, right?: string) {
  const a = roleTokens(left);
  const b = roleTokens(right);
  if (!a.size || !b.size) return 0;
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function bottomUpCandidate(
  draft: Pick<AiAnalysisDraft, 'deal' | 'evidence' | 'gaps'>,
): ScenarioCandidate | null {
  const months = extractPeriodMonths(draft.deal.periodOfPerformance);
  const labor = (draft.deal.laborSignals || []).filter((signal) => signal.title?.trim());
  if (!months || !labor.length) return null;
  if (labor.some((signal) => !signal.quantity || signal.quantity <= 0 || !signal.annualHours || signal.annualHours <= 0)) return null;

  const rates = draft.evidence.filter((item) =>
    item.numeric?.valueType === 'HOURLY_CEILING_RATE' &&
    item.numeric.units === 'USD_PER_HOUR' &&
    item.numeric.currency === 'USD' &&
    item.numeric.originalValue > 0,
  );
  if (!rates.length) return null;

  const components: Array<{ label: string; annualCost: number; evidenceIds: string[] }> = [];
  for (const signal of labor) {
    const matches = rates.filter((item) => roleMatch(signal.title, item.numeric?.scopeText || item.claim) >= 0.5);
    if (!matches.length) return null;
    const hourlyRate = median(matches.map((item) => item.numeric!.originalValue));
    components.push({
      label: `${signal.title}: ${signal.quantity} FTE x ${signal.annualHours} hours`,
      annualCost: signal.quantity! * signal.annualHours! * hourlyRate,
      evidenceIds: matches.map((item) => item.id),
    });
  }

  const annualCost = components.reduce((sum, component) => sum + component.annualCost, 0);
  const years = months / 12;
  const escalationEvidence = draft.evidence.find((item) =>
    item.numeric?.valueType === 'ESCALATION_RATE' &&
    item.numeric.units === 'PERCENT' &&
    item.numeric.originalValue > 0 &&
    item.numeric.originalValue < 20,
  );
  const escalation = escalationEvidence?.numeric ? escalationEvidence.numeric.originalValue / 100 : 0;
  const fullYears = Math.floor(years);
  const partialYear = years - fullYears;
  let expected = 0;
  for (let year = 0; year < fullYears; year += 1) expected += annualCost * ((1 + escalation) ** year);
  if (partialYear > 0) expected += annualCost * partialYear * ((1 + escalation) ** fullYears);
  if (!Number.isFinite(expected) || expected <= 0) return null;

  const evidenceIds = [...new Set([
    ...components.flatMap((component) => component.evidenceIds),
    ...(escalationEvidence ? [escalationEvidence.id] : []),
  ])];
  const synthetic: EvaluatedNumericAnchor = {
    id: 'ANCHOR-MODEL-BOTTOM-UP',
    evidenceId: 'MODEL-BOTTOM-UP',
    sourceLabel: 'Deterministic bottom-up labor model',
    originalValue: expected,
    normalizedValue: expected,
    valueType: 'ESTIMATED_VALUE',
    units: 'TOTAL_USD',
    role: 'CENTRAL_ANCHOR',
    comparabilityScore: 1,
    comparability: {
      scope: 1, scale: 1, acquisition: 1, customer: 1, period: 1,
      naicsPsc: 1, laborIntensity: 1, recency: 1, technologySecurityLocation: 1, coverage: 1,
    },
    evidenceQuality: 0.86,
    normalizationConfidence: escalationEvidence || months <= 12 ? 0.84 : 0.76,
    weight: 0.72,
    included: true,
    inclusionRationale: 'Complete solicitation staffing quantities and hours were multiplied by matched official hourly-rate evidence.',
    exclusionReasons: [],
    normalizationSteps: [],
    evidenceIds,
    opportunitySpecific: true,
    valueBasis: 'OPPORTUNITY_TOTAL',
  };
  const readiness = calculateEvidenceReadiness([synthetic], draft.gaps, 0);
  const rangeWidth = Math.max(ENGINE_THRESHOLDS.oneAnchorMinimumRangeWidth, 0.20);
  return {
    method: 'BOTTOM_UP_LABOR',
    methodLabel: 'Bottom-up labor model',
    anchors: [synthetic],
    aggressive: roundCurrency(expected * (1 - rangeWidth)),
    expected: roundCurrency(expected),
    conservative: roundCurrency(expected * (1 + rangeWidth)),
    status: 'DIRECTIONAL',
    readiness,
    sampleSize: 1,
    dispersion: 0,
    rangeWidth,
    rangeFactors: [
      `Complete quantified staffing was modeled across ${months} months.`,
      'A 20% planning band reflects labor mix, fee, and non-labor uncertainty.',
    ],
    assumptions: [
      'The extracted staffing quantities and annual hours represent the complete priced labor model.',
      'Matched GSA CALC+ values are treated as loaded public ceiling-rate proxies, not company-specific rates.',
      escalationEvidence ? `BLS escalation evidence (${escalationEvidence.id}) was applied by performance year.` : 'No escalation was applied because a suitable cited series was unavailable.',
      'Travel, materials, ODCs, subcontractor premiums, fee, and unpriced CLINs are excluded unless embedded in the cited rates.',
    ],
    verifiedInputs: components.map((component) => component.label),
    sensitivities: [
      'Changes to staffing mix, productive hours, or period of performance move the estimate directly.',
      'Company-specific rates, fee, ODCs, and subcontractor structure may materially change the working position.',
    ],
  };
}

function predecessorEvidence(item: EvidenceItem | undefined, draft: Pick<AiAnalysisDraft, 'deal'>) {
  if (!item) return false;
  const text = `${item.claim} ${item.numeric?.scopeText || ''} ${item.sourceRecordId || ''}`.toLowerCase();
  if (/\bpredecessor\b|\bincumbent\b|follow-on|follow on/.test(text)) return true;
  const identifiers = draft.deal.facts
    .filter((fact) => /incumbent|predecessor|current contract|prior contract|contract number|award id/i.test(fact.label))
    .map((fact) => fact.value.trim().toLowerCase())
    .filter((value) => value.length >= 4 && !/unknown|not found|n\/a/.test(value));
  return identifiers.some((identifier) => text.includes(identifier));
}

function publicBenchmark(candidate: ScenarioCandidate | null): PublicMarketBenchmark {
  if (!candidate || candidate.status === 'INSUFFICIENT_EVIDENCE') {
    return {
      status: 'NOT_SUPPORTED', aggressive: null, expected: null, conservative: null, evidenceIds: [],
      summary: 'Public comparable evidence does not currently support a standalone benchmark.',
    };
  }
  return {
    status: candidate.status === 'SUPPORTED' ? 'SUPPORTED' : 'DIRECTIONAL',
    aggressive: candidate.aggressive,
    expected: candidate.expected,
    conservative: candidate.conservative,
    evidenceIds: candidate.anchors.map((anchor) => anchor.evidenceId),
    summary: `${candidate.methodLabel} produced a ${candidate.status.toLowerCase()} public-market benchmark.`,
  };
}

function markSelectedAnchors(
  all: EvaluatedNumericAnchor[],
  selected: EvaluatedNumericAnchor[],
  methodLabel: string,
) {
  const selectedIds = new Set(selected.map((anchor) => anchor.id));
  return all.map((anchor) => {
    if (!anchor.included || selectedIds.has(anchor.id)) return anchor;
    return {
      ...anchor,
      included: false,
      weight: 0,
      inclusionRationale: undefined,
      exclusionReasons: [...new Set([...anchor.exclusionReasons, `${methodLabel} was selected as the stronger available estimation basis.`])],
    };
  });
}

function insufficientPosition(
  draft: Pick<AiAnalysisDraft, 'marketAssessment' | 'gaps'>,
  anchors: EvaluatedNumericAnchor[],
  benchmark: PublicMarketBenchmark,
): MarketPosition {
  const readiness = calculateEvidenceReadiness([], draft.gaps, 0);
  return {
    currency: 'USD',
    aggressive: null,
    expected: null,
    conservative: null,
    rangeStatus: 'INSUFFICIENT_EVIDENCE',
    posture: 'UNDETERMINED',
    summary: draft.marketAssessment.summary,
    estimationMethod: 'NO_RESPONSIBLE_ESTIMATE',
    methodLabel: 'No responsible estimate',
    confidence: 'LOW',
    formulaVersion: MARKET_POSITION_ENGINE_VERSION,
    publicBenchmark: benchmark,
    evidenceReadiness: readiness,
    anchors,
    effectiveSampleSize: 0,
    dispersionPct: 0,
    rangeWidthPct: 0,
    constraints: [],
    rangeFactors: ['No available method had enough verified scope, quantity, duration, or comparable total-value evidence.'],
    assumptions: ['The engine will not manufacture a total from incomplete component data.'],
    verifiedInputs: [],
    sensitivities: draft.gaps.filter((gap) => gap.priority === 'HIGH').slice(0, 4).map((gap) => `${gap.question} ${gap.impact}`),
    basis: draft.marketAssessment.basis,
    drivers: draft.marketAssessment.drivers,
  };
}

export function calculateDeterministicScenarios(
  draft: Pick<AiAnalysisDraft, 'deal' | 'evidence' | 'gaps' | 'marketAssessment'>,
  options: EngineOptions,
): MarketPosition {
  if (!options.asOfDate || Number.isNaN(Date.parse(options.asOfDate))) {
    throw new Error('A valid as-of date is required for deterministic Market Position calculations.');
  }

  const anchors = draft.evidence
    .map((evidence) => evaluateAnchor(evidence, draft, options))
    .filter((anchor): anchor is EvaluatedNumericAnchor => Boolean(anchor));
  const evidenceById = new Map(draft.evidence.map((item) => [item.id, item]));
  const eligible = anchors.filter((anchor) => anchor.included && anchor.normalizedValue !== null);
  const direct = eligible.filter((anchor) => anchor.opportunitySpecific);
  const indirect = eligible.filter((anchor) => !anchor.opportunitySpecific);
  const predecessor = indirect.filter((anchor) => predecessorEvidence(evidenceById.get(anchor.evidenceId), draft));

  const directCandidate = scenarioFromAnchors('DIRECT_GOVERNMENT', 'Direct government basis', direct, draft.gaps);
  const predecessorCandidate = scenarioFromAnchors('PREDECESSOR_INCUMBENT', 'Predecessor or incumbent basis', predecessor, draft.gaps);
  const comparableMethod: EstimationMethod = indirect.some((anchor) => anchor.normalizationSteps.length > 0)
    ? 'PARAMETRIC_ANALOGY'
    : 'COMPARABLE_AWARDS';
  const comparableLabel = comparableMethod === 'PARAMETRIC_ANALOGY' ? 'Normalized analogous awards' : 'Comparable awards';
  const comparableCandidate = scenarioFromAnchors(comparableMethod, comparableLabel, indirect, draft.gaps);
  const bottomUp = bottomUpCandidate(draft);
  const benchmark = publicBenchmark(comparableCandidate);

  let selected: ScenarioCandidate | null = null;
  if (directCandidate && directCandidate.status !== 'INSUFFICIENT_EVIDENCE') {
    selected = directCandidate;
  } else if (predecessorCandidate && predecessorCandidate.status !== 'INSUFFICIENT_EVIDENCE') {
    selected = predecessorCandidate;
  } else if (comparableCandidate?.status === 'SUPPORTED') {
    selected = comparableCandidate;
  } else if (bottomUp) {
    selected = bottomUp;
  } else if (comparableCandidate?.status === 'DIRECTIONAL') {
    selected = comparableCandidate;
  }

  if (!selected) return insufficientPosition(draft, anchors, benchmark);

  const isBottomUp = selected.method === 'BOTTOM_UP_LABOR';
  let resultAnchors = markSelectedAnchors(anchors, isBottomUp ? [] : selected.anchors, selected.methodLabel);
  if (isBottomUp) resultAnchors = [...resultAnchors, ...selected.anchors];
  const constraints: string[] = [];
  const compatibleCeilings = anchors.filter((anchor) =>
    anchor.role === 'CONSTRAINT' &&
    anchor.normalizedValue !== null &&
    anchor.comparabilityScore >= 0.8 &&
    anchor.evidenceQuality >= 0.65,
  );
  let aggressive = selected.aggressive;
  let expected = selected.expected;
  let conservative = selected.conservative;
  if (compatibleCeilings.length) {
    const ceiling = Math.min(...compatibleCeilings.map((anchor) => anchor.normalizedValue as number));
    constraints.push(`Verified compatible opportunity ceiling of ${ceiling.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} applied as an upper constraint.`);
    if (expected > ceiling) return insufficientPosition(draft, resultAnchors, benchmark);
    conservative = Math.min(conservative, ceiling);
  }
  aggressive = Math.min(aggressive, expected);
  conservative = Math.max(conservative, expected);

  const gapSensitivities = draft.gaps
    .filter((gap) => gap.priority === 'HIGH')
    .slice(0, 3)
    .map((gap) => `${gap.question} ${gap.impact}`);
  const assumptions = [
    ...selected.assumptions,
    'Qualitative competitive intelligence did not add or subtract an arbitrary percentage.',
    ...selected.anchors.flatMap((anchor) => anchor.normalizationSteps.map((step) => step.rationale)),
  ];

  return {
    currency: 'USD',
    aggressive: roundCurrency(aggressive),
    expected: roundCurrency(expected),
    conservative: roundCurrency(conservative),
    rangeStatus: selected.status,
    posture: draft.marketAssessment.posture,
    summary: draft.marketAssessment.summary,
    estimationMethod: selected.method,
    methodLabel: selected.methodLabel,
    confidence: confidenceFor(selected.status, selected.readiness.score),
    formulaVersion: MARKET_POSITION_ENGINE_VERSION,
    publicBenchmark: benchmark,
    evidenceReadiness: selected.readiness,
    anchors: resultAnchors,
    effectiveSampleSize: selected.sampleSize,
    dispersionPct: Math.round(selected.dispersion * 100),
    rangeWidthPct: Math.round(selected.rangeWidth * 100),
    constraints,
    rangeFactors: selected.rangeFactors,
    assumptions: [...new Set(assumptions)],
    verifiedInputs: [...new Set(selected.verifiedInputs)],
    sensitivities: [...new Set([...selected.sensitivities, ...gapSensitivities])],
    basis: [...new Set([selected.methodLabel, ...draft.marketAssessment.basis])],
    drivers: draft.marketAssessment.drivers,
  };
}
