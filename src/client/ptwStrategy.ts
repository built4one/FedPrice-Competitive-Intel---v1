import type { OpportunityAnalysis } from '../types';

export async function requestPtwStrategy(analysis: OpportunityAnalysis, signal?: AbortSignal): Promise<OpportunityAnalysis> {
  const response = await fetch('/api/ptw-strategy', {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(analysis), signal});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.data) throw new Error(payload.error || 'Strategic assessment could not be completed. The evidence run is still available.');
  return {...payload.data, storageVersion: analysis.storageVersion};
}
