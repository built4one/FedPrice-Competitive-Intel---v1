import type { DealProfile, EvidenceItem, DataGap } from '../types';
import { laborRoleMatch, requiresClearance } from './laborMatching';

export function laborCoverage(deal: DealProfile, evidence: EvidenceItem[]) {
  const rates = evidence.filter(e => e.numeric?.valueType === 'HOURLY_CEILING_RATE' && e.numeric.units === 'USD_PER_HOUR' && e.numeric.originalValue > 0);
  return (deal.laborSignals || []).map(signal => {
    const matches = rates.filter(e => {
      const n = e.numeric!;
      return (!n.matchedLaborCategory || n.matchedLaborCategory === signal.title)
        && (!requiresClearance(signal.clearance) || n.clearanceRequired)
        && laborRoleMatch(signal.title,n.scopeText || e.claim) >= 0.8;
    });
    const values = matches.map(e => e.numeric!.originalValue).sort((a,b)=>a-b);
    const center = values.length ? (values[Math.floor((values.length-1)/2)] + values[Math.ceil((values.length-1)/2)])/2 : null;
    const proxyMapped = matches.some(e => (e.numeric?.laborMatchScore ?? 1) < 0.8);
    return { signal, evidenceIds:matches.map(e=>e.id), medianRate:center, sampleSize:matches.reduce((sum,e)=>sum+(e.numeric!.rateSampleSize || 1),0),
      lowerRate:matches[0]?.numeric?.lowerRate ?? center,upperRate:matches[0]?.numeric?.upperRate ?? center, proxyMapped,
      limitation: matches.length
        ? proxyMapped
          ? 'Provisional role-family ceiling-rate proxy; validate the mapped family, qualifications, clearance level, and worksite before final pricing use.'
          : 'Public ceiling-rate proxy; verify exact qualifications, clearance level, and worksite.'
        : 'No defensible role/clearance rate match. Supply a cited comparable rate or analyst-approved mapping.' };
  });
}

export function laborCoverageGaps(deal: DealProfile, evidence: EvidenceItem[]): DataGap[] {
  const gaps: DataGap[] = [];
  if (deal.laborModelComplete === false) gaps.push({question:'Complete the documented staffing schedule.',impact:deal.laborModelSource || 'Not all labor rows and performance periods were extracted.',priority:'HIGH'});
  for (const row of laborCoverage(deal,evidence)) {
    if (row.medianRate == null) gaps.push({question:`Validate a rate benchmark for ${row.signal.title}.`,impact:row.limitation,priority:'HIGH'});
    else if (row.proxyMapped) gaps.push({question:`Validate the provisional role-family mapping for ${row.signal.title}.`,impact:row.limitation,priority:'MEDIUM'});
    if (!row.signal.periods?.length && !row.signal.quantity) gaps.push({question:`Confirm staffing quantity for ${row.signal.title}.`,impact:'This labor category cannot be extended into a total without a documented quantity.',priority:'HIGH'});
  }
  return gaps;
}
