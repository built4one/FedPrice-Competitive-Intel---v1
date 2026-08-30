import type {
  CalculationRole,
  DealProfile,
  EvidenceItem,
  NormalizationStep,
  NumericEvidence,
} from '../../types';

const CENTRAL_VALUE_TYPES = new Set<NumericEvidence['valueType']>([
  'EVALUATED_PRICE',
  'ESTIMATED_VALUE',
  'TOTAL_AWARD_VALUE',
  'EVENTUAL_SPEND',
]);

export function extractPeriodMonths(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/,/g, '');
  const months = normalized.match(/(\d+(?:\.\d+)?)\s*(?:month|months|mo\b)/);
  if (months) return Number(months[1]);
  const years = normalized.match(/(\d+(?:\.\d+)?)\s*(?:year|years|yr\b)/);
  if (years) return Number(years[1]) * 12;
  return undefined;
}

export function determineCalculationRole(numeric: NumericEvidence, asOfDate: string): CalculationRole {
  if (!Number.isFinite(numeric.originalValue) || numeric.originalValue <= 0) return 'EXCLUDED';
  if (numeric.currency !== 'USD' && numeric.units !== 'PERCENT') return 'EXCLUDED';
  if (numeric.sharedAcrossAwards) return 'EXCLUDED';
  if (numeric.valueBasis === 'PAST_PERFORMANCE_THRESHOLD') return 'EXCLUDED';
  if (numeric.valueBasis === 'ORDER_LIMIT') return 'CONTEXT';
  if (['PROGRAM_TOTAL', 'MULTIPLE_AWARD_POOL', 'BUDGET'].includes(numeric.valueBasis || '')) return 'CONTEXT';
  if (CENTRAL_VALUE_TYPES.has(numeric.valueType)) return numeric.units === 'TOTAL_USD' ? 'CENTRAL_ANCHOR' : 'EXCLUDED';
  if (numeric.valueType === 'CURRENT_AWARD_AMOUNT') {
    const completed = numeric.endDate && Date.parse(numeric.endDate) <= Date.parse(asOfDate);
    return completed && numeric.units === 'TOTAL_USD' ? 'CENTRAL_ANCHOR' : 'CONTEXT';
  }
  if (numeric.valueType === 'CONTRACT_CEILING') {
    const compatibleBasis = numeric.valueBasis === 'OPPORTUNITY_TOTAL' || numeric.valueBasis === 'INDIVIDUAL_AWARD';
    return numeric.units === 'TOTAL_USD' && numeric.opportunitySpecific && compatibleBasis ? 'CONSTRAINT' : 'CONTEXT';
  }
  if (numeric.valueType === 'HOURLY_CEILING_RATE') return 'COMPONENT';
  if (numeric.valueType === 'ESCALATION_RATE') return 'MODIFIER';
  if (['INITIAL_OBLIGATION', 'CURRENT_OBLIGATIONS', 'BUDGET_CONTEXT'].includes(numeric.valueType)) return 'CONTEXT';
  return 'EXCLUDED';
}

interface NormalizationResult {
  normalizedValue: number | null;
  confidence: number;
  steps: NormalizationStep[];
  notes: string[];
}

export function normalizeNumericEvidence(
  evidence: EvidenceItem,
  deal: DealProfile,
  allEvidence: EvidenceItem[],
  asOfDate: string,
): NormalizationResult {
  const numeric = evidence.numeric;
  if (!numeric || !Number.isFinite(numeric.originalValue) || numeric.originalValue <= 0) {
    return { normalizedValue: null, confidence: 0, steps: [], notes: ['Numeric value is missing or invalid.'] };
  }
  if (numeric.units !== 'TOTAL_USD' || numeric.currency !== 'USD') {
    return {
      normalizedValue: numeric.originalValue,
      confidence: 1,
      steps: [],
      notes: ['Retained in its native units and barred from total-value weighting.'],
    };
  }

  let value = numeric.originalValue;
  let confidence = numeric.opportunitySpecific ? 1 : 0.95;
  const steps: NormalizationStep[] = [];
  const notes: string[] = [];
  const targetMonths = extractPeriodMonths(deal.periodOfPerformance);

  if (numeric.periodMonths && targetMonths && numeric.periodMonths !== targetMonths) {
    if (numeric.recurringService) {
      const factor = targetMonths / numeric.periodMonths;
      value *= factor;
      confidence *= 0.95;
      steps.push({
        type: 'PERIOD',
        factor,
        rationale: `Recurring service value normalized from ${numeric.periodMonths} to ${targetMonths} months.`,
        evidenceIds: [evidence.id],
      });
    } else {
      confidence *= 0.72;
      notes.push('Period differs from the target and could not be normalized without assuming steady-state services.');
    }
  } else if (!numeric.opportunitySpecific && (!numeric.periodMonths || !targetMonths)) {
    confidence *= 0.85;
    notes.push('Period normalization was not possible because one period was unavailable.');
  }

  if (numeric.quantity && numeric.targetQuantity && numeric.quantity !== numeric.targetQuantity) {
    if (numeric.scalableByQuantity) {
      const factor = numeric.targetQuantity / numeric.quantity;
      value *= factor;
      confidence *= 0.95;
      steps.push({
        type: 'QUANTITY',
        factor,
        rationale: `Value normalized from quantity ${numeric.quantity} to ${numeric.targetQuantity}.`,
        evidenceIds: [evidence.id],
      });
    } else {
      confidence *= 0.75;
      notes.push('Scale differs from the target and no evidence supports linear quantity scaling.');
    }
  }

  const targetYear = new Date(asOfDate).getUTCFullYear();
  if (numeric.baseYear && numeric.baseYear < targetYear) {
    const yearDifference = targetYear - numeric.baseYear;
    const escalation = allEvidence.find((item) =>
      item.numeric?.valueType === 'ESCALATION_RATE' &&
      item.numeric.units === 'PERCENT' &&
      item.numeric.originalValue > 0 &&
      item.numeric.originalValue < 20,
    );
    if (escalation?.numeric && yearDifference <= 3) {
      const factor = (1 + escalation.numeric.originalValue / 100) ** yearDifference;
      value *= factor;
      confidence *= 0.93;
      steps.push({
        type: 'ESCALATION',
        factor,
        rationale: `Escalated ${yearDifference} year${yearDifference === 1 ? '' : 's'} using the cited BLS change rate.`,
        evidenceIds: [evidence.id, escalation.id],
      });
    } else if (yearDifference > 1) {
      confidence *= 0.80;
      notes.push('The value year differs from the analysis year and no sufficiently applicable escalation series was available.');
    }
  }

  return {
    normalizedValue: Number.isFinite(value) ? value : null,
    confidence: Math.max(0, Math.min(1, confidence)),
    steps,
    notes,
  };
}
