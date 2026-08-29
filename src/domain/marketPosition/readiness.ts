import type { DataGap, EvaluatedNumericAnchor, EvidenceReadinessBreakdown } from '../../types';

const weightedAverage = (anchors: EvaluatedNumericAnchor[], field: 'comparabilityScore' | 'evidenceQuality' | 'normalizationConfidence') => {
  const totalWeight = anchors.reduce((sum, anchor) => sum + anchor.weight, 0);
  if (totalWeight <= 0) return 0;
  return anchors.reduce((sum, anchor) => sum + anchor[field] * anchor.weight, 0) / totalWeight;
};

export function effectiveSampleSize(anchors: EvaluatedNumericAnchor[]) {
  const sum = anchors.reduce((total, anchor) => total + anchor.weight, 0);
  const squared = anchors.reduce((total, anchor) => total + anchor.weight ** 2, 0);
  return squared > 0 ? (sum ** 2) / squared : 0;
}

export function calculateEvidenceReadiness(
  anchors: EvaluatedNumericAnchor[],
  gaps: DataGap[],
  dispersion: number,
): EvidenceReadinessBreakdown {
  const effectiveQuantity = Math.min(1, effectiveSampleSize(anchors) / 3);
  const sourceDiversity = Math.min(1, new Set(anchors.map((anchor) => anchor.sourceLabel)).size / 3);
  const consistency = anchors.length ? Math.max(0, 1 - dispersion / 0.5) : 0;
  const highGaps = gaps.filter((gap) => gap.priority === 'HIGH').length;
  const gapResolution = 1 - Math.min(1, highGaps / 4);
  const comparability = weightedAverage(anchors, 'comparabilityScore');
  const evidenceQuality = weightedAverage(anchors, 'evidenceQuality');
  const normalizationConfidence = weightedAverage(anchors, 'normalizationConfidence');
  const readiness = (
    comparability * 0.25 +
    evidenceQuality * 0.20 +
    normalizationConfidence * 0.15 +
    effectiveQuantity * 0.15 +
    sourceDiversity * 0.10 +
    consistency * 0.10 +
    gapResolution * 0.05
  );
  const percent = (value: number) => Math.round(value * 100);
  return {
    score: percent(readiness),
    comparability: percent(comparability),
    evidenceQuality: percent(evidenceQuality),
    normalizationConfidence: percent(normalizationConfidence),
    effectiveQuantity: percent(effectiveQuantity),
    sourceDiversity: percent(sourceDiversity),
    consistency: percent(consistency),
    gapResolution: percent(gapResolution),
  };
}
