import type { AdapterResult } from './types';
import type { DealProfile, EvidenceItem } from '../types';

export async function querySamGov(deal: DealProfile): Promise<AdapterResult> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) {
    return { name: 'SAM.gov', success: false, recordsFound: 0, evidence: [], message: 'API key not configured' };
  }

  try {
    const query = encodeURIComponent(deal.solicitationNumber || deal.title || 'Federal');
    const url = `https://api.sam.gov/prod/opportunities/v2/search?api_key=${apiKey}&limit=3&q=${query}`;
    
    // We set a 3-second timeout so a hanging API doesn't crash the server request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const evidence: EvidenceItem[] = (data.opportunitiesData || []).map((opp: any, i: number) => ({
      id: `SAM-${Date.now()}-${i}`,
      type: 'MARKET_DATA',
      sourceLabel: 'SAM.gov API',
      claim: `Notice found: ${opp.title} (${opp.solicitationNumber}) by ${opp.agency}.`,
      confidence: 90,
      url: `https://sam.gov/opp/${opp.noticeId}/view`
    }));

    return { name: 'SAM.gov', success: true, recordsFound: data.totalRecords || 0, evidence };
  } catch (err: any) {
    return { name: 'SAM.gov', success: false, recordsFound: 0, evidence: [], message: err.message };
  }
}
