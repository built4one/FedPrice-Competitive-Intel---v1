import type {
  ComparabilityBreakdown,
  DealProfile,
  EvidenceItem,
  NumericEvidence,
} from '../../types';
import { COMPARABILITY_WEIGHTS } from './engineConfig';
import { extractPeriodMonths } from './valueNormalization';

const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'from', 'this', 'that', 'services', 'service', 'support', 'contract']);

function tokens(value?: string) {
  return new Set((value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
}

function overlapScore(left?: string, right?: string): number | null {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return null;
  const shared = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return Math.min(1, (shared / union) * 4);
}

function exactOrOverlap(left?: string, right?: string): number | null {
  if (!left?.trim() || !right?.trim()) return null;
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return overlapScore(a, b);
}

function periodScore(sourceMonths?: number, targetMonths?: number): number | null {
  if (!sourceMonths || !targetMonths) return null;
  return Math.min(sourceMonths, targetMonths) / Math.max(sourceMonths, targetMonths);
}

function scaleScore(source?: number, target?: number): number | null {
  if (!source || !target || source <= 0 || target <= 0) return null;
  return Math.min(source, target) / Math.max(source, target);
}

function naicsPscScore(numeric: NumericEvidence, deal: DealProfile): number | null {
  const sourceNaics = numeric.naics?.replace(/\D/g, '');
  const targetNaics = deal.naics?.replace(/\D/g, '');
  if (sourceNaics && targetNaics) {
    if (sourceNaics === targetNaics) return 1;
    if (sourceNaics.slice(0, 4) === targetNaics.slice(0, 4)) return 0.7;
    return 0.1;
  }
  if (numeric.psc && deal.psc) {
    if (numeric.psc === deal.psc) return 1;
    if (numeric.psc.slice(0, 2) === deal.psc.slice(0, 2)) return 0.6;
    return 0.1;
  }
  return null;
}

function targetLaborIntensity(deal: DealProfile): NumericEvidence['laborIntensity'] {
  const quantity = deal.laborSignals.reduce((sum, item) => sum + (item.quantity || 0), 0);
  if (quantity >= 25 || deal.laborSignals.length >= 8) return 'HIGH';
  if (quantity > 0 || deal.laborSignals.length > 0) return 'MEDIUM';
  return 'UNKNOWN';
}

function laborScore(source: NumericEvidence['laborIntensity'], target: NumericEvidence['laborIntensity']): number | null {
  if (!source || source === 'UNKNOWN' || !target || target === 'UNKNOWN') return null;
  if (source === target) return 1;
  if ((source === 'LOW' && target === 'HIGH') || (source === 'HIGH' && target === 'LOW')) return 0.2;
  return 0.65;
}

function recencyScore(sourceDate: string | undefined, asOfDate: string): number | null {
  if (!sourceDate || Number.isNaN(Date.parse(sourceDate))) return null;
  const years = Math.max(0, (Date.parse(asOfDate) - Date.parse(sourceDate)) / (365.25 * 24 * 60 * 60 * 1000));
  if (years <= 2) return 1;
  if (years <= 4) return 0.8;
  if (years <= 6) return 0.6;
  if (years <= 8) return 0.4;
  return 0.2;
}

export function scoreComparability(
  evidence: EvidenceItem,
  deal: DealProfile,
  asOfDate: string,
): { score: number; breakdown: ComparabilityBreakdown } {
  const numeric = evidence.numeric;
  if (!numeric) {
    const breakdown = {
      scope: null, scale: null, acquisition: null, customer: null, period: null,
      naicsPsc: null, laborIntensity: null, recency: null, technologySecurityLocation: null, coverage: 0,
    };
    return { score: 0, breakdown };
  }
  if (numeric.opportunitySpecific) {
    const breakdown: ComparabilityBreakdown = {
      scope: 1, scale: 1, acquisition: 1, customer: 1, period: 1,
      naicsPsc: 1, laborIntensity: 1, recency: 1, technologySecurityLocation: 1, coverage: 1,
    };
    return { score: 1, breakdown };
  }

  const dealTechContext = [
    deal.scopeSummary,
    ...deal.laborSignals.map((item) => [item.location, item.clearance].filter(Boolean).join(' ')),
  ].join(' ');
  const breakdown: ComparabilityBreakdown = {
    scope: overlapScore(numeric.scopeText, `${deal.title} ${deal.scopeSummary}`),
    scale: scaleScore(numeric.quantity, numeric.targetQuantity),
    acquisition: exactOrOverlap(numeric.contractType || numeric.acquisitionStructure, `${deal.contractType} ${deal.awardStructure}`),
    customer: exactOrOverlap(numeric.agency, deal.agency),
    period: periodScore(numeric.periodMonths, extractPeriodMonths(deal.periodOfPerformance)),
    naicsPsc: naicsPscScore(numeric, deal),
    laborIntensity: laborScore(numeric.laborIntensity, targetLaborIntensity(deal)),
    recency: recencyScore(numeric.sourceDate, asOfDate),
    technologySecurityLocation: overlapScore(numeric.technologySecurityLocation, dealTechContext),
    coverage: 0,
  };

  let coveredWeight = 0;
  let weightedSimilarity = 0;
  for (const [factor, weight] of Object.entries(COMPARABILITY_WEIGHTS)) {
    const value = breakdown[factor as keyof typeof COMPARABILITY_WEIGHTS];
    if (typeof value === 'number') {
      coveredWeight += weight;
      weightedSimilarity += weight * value;
    }
  }
  breakdown.coverage = coveredWeight;
  const similarity = coveredWeight > 0 ? weightedSimilarity / coveredWeight : 0;
  const score = similarity * Math.sqrt(coveredWeight);
  return { score: Math.max(0, Math.min(1, score)), breakdown };
}

export function scoreEvidenceQuality(evidence: EvidenceItem): number {
  const numeric = evidence.numeric;
  if (!numeric) return 0;
  const authority = evidence.type === 'SOLICITATION_FACT'
    ? 1
    : evidence.type === 'EXTERNAL_SOURCE'
      ? 0.92
      : evidence.type === 'ANALYST_INFERENCE'
        ? 0.35
        : 0;
  const clarity = numeric.valueType === 'UNKNOWN' || numeric.units === 'OTHER' ? 0.2 : 1;
  const lineageFields = [evidence.sourceRecordId, evidence.section, evidence.url, evidence.retrievedAt].filter(Boolean).length;
  const lineage = Math.min(1, 0.35 + lineageFields * 0.18);
  const completenessFields = [
    numeric.units,
    numeric.valueType,
    numeric.periodMonths,
    numeric.agency,
    numeric.naics || numeric.psc,
    numeric.scopeText,
  ].filter((value) => value !== undefined && value !== '' && value !== 'UNKNOWN').length;
  const completeness = Math.min(1, 0.35 + completenessFields * 0.11);
  return Math.max(0, Math.min(1, authority * 0.4 + clarity * 0.25 + lineage * 0.2 + completeness * 0.15));
}
