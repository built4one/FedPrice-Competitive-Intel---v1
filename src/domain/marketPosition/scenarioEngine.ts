import type {
  AiAnalysisDraft,
  EvaluatedNumericAnchor,
  EvidenceItem,
  MarketPosition,
  NumericEvidence,
} from '../../types';
import { scoreComparability, scoreEvidenceQuality } from './comparability';
import { ENGINE_THRESHOLDS, MARKET_POSITION_ENGINE_VERSION } from './engineConfig';
import { calculateEvidenceReadiness, effectiveSampleSize } from './readiness';
import { determineCalculationRole, normalizeNumericEvidence } from './valueNormalization';

interface EngineOptions {
  asOfDate: string;
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
  if (role === 'COMPONENT') exclusionReasons.push('Component rate requires a supported staffing-and-hours model before it can become a total-value anchor.');
  if (role === 'MODIFIER') exclusionReasons.push('Escalation evidence may normalize another value but is not a dollar anchor.');
  if (role === 'CONTEXT') exclusionReasons.push('Funding or budget context is not a like-for-like total evaluated price.');
  if (role === 'CONSTRAINT') exclusionReasons.push('A ceiling can constrain the range but cannot determine Expected by itself.');
  if (role === 'EXCLUDED') exclusionReasons.push('Value type or units are not eligible for total-value weighting.');
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
  };
}

function insufficientPosition(
  draft: Pick<AiAnalysisDraft, 'marketAssessment'>,
  anchors: EvaluatedNumericAnchor[],
  readiness: MarketPosition['evidenceReadiness'],
  rangeFactors: string[],
): MarketPosition {
  return {
    currency: 'USD',
    aggressive: null,
    expected: null,
    conservative: null,
    rangeStatus: 'INSUFFICIENT_EVIDENCE',
    posture: 'UNDETERMINED',
    summary: draft.marketAssessment.summary,
    formulaVersion: MARKET_POSITION_ENGINE_VERSION,
    evidenceReadiness: readiness,
    anchors,
    effectiveSampleSize: 0,
    dispersionPct: 0,
    rangeWidthPct: 0,
    constraints: [],
    rangeFactors,
    assumptions: ['Only comparable total-value anchors may generate an authoritative Market Position.'],
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
  const included = anchors.filter((anchor) => anchor.included && anchor.normalizedValue !== null);

  if (!included.length) {
    const readiness = calculateEvidenceReadiness([], draft.gaps, 0);
    return insufficientPosition(
      draft,
      anchors,
      readiness,
      ['No numeric evidence met the like-for-like inclusion rules.'],
    );
  }

  const totalWeight = included.reduce((sum, anchor) => sum + anchor.weight, 0);
  if (totalWeight <= 0) {
    const readiness = calculateEvidenceReadiness([], draft.gaps, 0);
    return insufficientPosition(draft, anchors, readiness, ['Eligible anchors had no effective deterministic weight.']);
  }
  const expectedRaw = included.reduce((sum, anchor) => sum + (anchor.normalizedValue || 0) * anchor.weight, 0) / totalWeight;
  const dispersion = included.reduce(
    (sum, anchor) => sum + anchor.weight * Math.abs((anchor.normalizedValue || 0) - expectedRaw) / expectedRaw,
    0,
  ) / totalWeight;
  const readiness = calculateEvidenceReadiness(included, draft.gaps, dispersion);
  const sampleSize = effectiveSampleSize(included);
  let status: MarketPosition['rangeStatus'] = included.length >= 2 &&
    sampleSize >= 1.4 &&
    readiness.score >= ENGINE_THRESHOLDS.supportedReadiness
    ? 'SUPPORTED'
    : readiness.score >= ENGINE_THRESHOLDS.directionalReadiness
      ? 'DIRECTIONAL'
      : 'INSUFFICIENT_EVIDENCE';

  if (included.length === 1) {
    const single = included[0];
    const exceptionallyStrong = single.comparabilityScore >= 0.8 &&
      single.evidenceQuality >= 0.8 &&
      single.normalizationConfidence >= 0.8;
    status = exceptionallyStrong ? 'DIRECTIONAL' : 'INSUFFICIENT_EVIDENCE';
  }

  if (status === 'INSUFFICIENT_EVIDENCE') {
    return insufficientPosition(
      draft,
      anchors,
      readiness,
      ['Eligible evidence remains too sparse or weak to support a defensible numeric position.'],
    );
  }

  let rangeWidth = clamp(
    ENGINE_THRESHOLDS.minimumRangeWidth,
    ENGINE_THRESHOLDS.maximumRangeWidth,
    dispersion + 0.25 * (1 - readiness.score / 100),
  );
  if (included.length === 1) rangeWidth = Math.max(rangeWidth, ENGINE_THRESHOLDS.oneAnchorMinimumRangeWidth);
  if (included.length === 2) rangeWidth = Math.max(rangeWidth, ENGINE_THRESHOLDS.twoAnchorMinimumRangeWidth);

  let expected = expectedRaw;
  let aggressive = expected * (1 - rangeWidth);
  let conservative = expected * (1 + rangeWidth);
  const constraints: string[] = [];
  const rangeFactors = [
    `${included.length} eligible total-value anchor${included.length === 1 ? '' : 's'} produced an effective sample size of ${sampleSize.toFixed(2)}.`,
    `Weighted anchor dispersion was ${Math.round(dispersion * 100)}%.`,
    `Evidence Readiness was ${readiness.score}/100.`,
  ];

  const applicableCeilings = anchors.filter((anchor) =>
    anchor.role === 'CONSTRAINT' &&
    anchor.normalizedValue !== null &&
    anchor.comparabilityScore >= 0.8 &&
    anchor.evidenceQuality >= 0.65,
  );
  if (applicableCeilings.length) {
    const ceiling = Math.min(...applicableCeilings.map((anchor) => anchor.normalizedValue as number));
    constraints.push(`Verified opportunity ceiling of ${ceiling.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} applied as an upper constraint.`);
    if (ceiling < Math.min(...included.map((anchor) => anchor.normalizedValue as number)) * 0.75) {
      return insufficientPosition(
        draft,
        anchors,
        { ...readiness, score: Math.min(readiness.score, 44) },
        [...rangeFactors, 'Comparable evidence materially conflicts with the verified opportunity ceiling.'],
      );
    }
    expected = Math.min(expected, ceiling);
    conservative = Math.min(conservative, ceiling);
    aggressive = Math.min(aggressive, expected);
  }

  aggressive = Math.min(aggressive, expected);
  conservative = Math.max(conservative, expected);
  const assumptions = [
    'Only evidence normalized to total USD on a compatible opportunity basis influenced Expected.',
    'Qualitative competitive intelligence did not add or subtract an arbitrary percentage.',
    ...included.flatMap((anchor) => anchor.normalizationSteps.map((step) => step.rationale)),
  ];

  return {
    currency: 'USD',
    aggressive: roundCurrency(aggressive),
    expected: roundCurrency(expected),
    conservative: roundCurrency(conservative),
    rangeStatus: status,
    posture: draft.marketAssessment.posture,
    summary: draft.marketAssessment.summary,
    formulaVersion: MARKET_POSITION_ENGINE_VERSION,
    evidenceReadiness: readiness,
    anchors,
    effectiveSampleSize: roundScore(sampleSize),
    dispersionPct: Math.round(dispersion * 100),
    rangeWidthPct: Math.round(rangeWidth * 100),
    constraints,
    rangeFactors,
    assumptions: [...new Set(assumptions)],
    basis: draft.marketAssessment.basis,
    drivers: draft.marketAssessment.drivers,
  };
}
