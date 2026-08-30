import type { EvidenceItem } from '../../types';

function stableRangeId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `RANGE-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function classifyNumericEvidence(items: EvidenceItem[]) {
  for (const item of items) {
    const numeric = item.numeric;
    if (!numeric) continue;
    const claim = `${item.claim} ${item.section || ''}`.toLowerCase();
    if (/past performance|relevant experience/.test(claim) && /minimum|at least|threshold/.test(claim)) {
      numeric.valueBasis = 'PAST_PERFORMANCE_THRESHOLD';
    } else if (/minimum order|maximum order|order limitation/.test(claim)) {
      numeric.valueBasis = 'ORDER_LIMIT';
    } else if (/individual (?:awards?|contracts?)|each award|single award/.test(claim)) {
      numeric.valueBasis = 'INDIVIDUAL_AWARD';
      numeric.opportunitySpecific = true;
    } else if (/total estimated funding|program(?:-wide)? funding|portfolio funding|anticipated funding for fy|annual funding/.test(claim)) {
      numeric.valueBasis = /multiple awards?|pool/.test(claim) ? 'MULTIPLE_AWARD_POOL' : 'PROGRAM_TOTAL';
    } else if (numeric.valueType === 'BUDGET_CONTEXT') {
      numeric.valueBasis = 'BUDGET';
    } else if (numeric.opportunitySpecific && numeric.units === 'TOTAL_USD' && !numeric.valueBasis) {
      numeric.valueBasis = 'OPPORTUNITY_TOTAL';
    } else {
      numeric.valueBasis ||= 'UNKNOWN';
    }
  }

  const rangeGroups = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    if (!item.numeric || item.numeric.valueBasis !== 'INDIVIDUAL_AWARD') continue;
    if (!/range|between|from.+to/.test(item.claim.toLowerCase())) continue;
    const key = `${item.sourceLabel}|${item.section || ''}|${item.claim.toLowerCase().replace(/\$?[\d,.]+/g, '#')}`;
    rangeGroups.set(key, [...(rangeGroups.get(key) || []), item]);
  }
  for (const [key, group] of rangeGroups) {
    const ordered = group.filter((item) => item.numeric).sort((a, b) => (a.numeric?.originalValue || 0) - (b.numeric?.originalValue || 0));
    if (ordered.length < 2) continue;
    const rangeId = stableRangeId(key);
    ordered[0].numeric!.rangeBound = 'LOW';
    ordered[0].numeric!.rangeId = rangeId;
    ordered[ordered.length - 1].numeric!.rangeBound = 'HIGH';
    ordered[ordered.length - 1].numeric!.rangeId = rangeId;
  }
}
