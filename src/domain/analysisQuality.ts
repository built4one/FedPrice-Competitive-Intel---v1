import type { DataGap, OpportunityAnalysis } from '../types';

export function normalizeGaps(gaps: DataGap[] = []): DataGap[] {
  return gaps.map(gap => ({ ...gap, priority: ['HIGH', 'MEDIUM', 'LOW'].includes(String(gap.priority).toUpperCase())
    ? String(gap.priority).toUpperCase() as DataGap['priority'] : 'HIGH' }));
}

export function assessmentIssues(analysis: OpportunityAnalysis): string[] {
  return [...new Set([
    ...(analysis.ptwStrategy?.status === 'DRAFT' ? [] : [analysis.ptwStrategy?.reason || 'Strategic assessment has not been generated.']),
    ...normalizeGaps(analysis.gaps).filter(gap => gap.priority === 'HIGH').map(gap => `${gap.question} ${gap.impact}`),
    ...(analysis.meta.connectors || []).filter(c => !['SUCCESS', 'CACHED'].includes(c.status))
      .map(c => `${c.name}: ${c.status.replaceAll('_', ' ')}. ${c.message || 'No usable source evidence was returned.'}`),
    ...(analysis.marketPosition.expected == null ? analysis.marketPosition.rangeFactors : []),
    ...analysis.marketPosition.sensitivities,
    ...analysis.meta.warnings.filter(w => !w.startsWith('Package snapshot:')),
  ])];
}
