import type { AdapterResult } from './types';
import type { DealProfile, EvidenceItem } from '../types';

export async function queryUSASpending(deal: DealProfile): Promise<AdapterResult> {
  try {
    const keywords = [deal.agency, deal.naics].filter(Boolean) as string[];
    if (keywords.length === 0) keywords.push("Technology");

    const payload = {
      filters: {
        award_type_codes: ["A", "B", "C", "D"], // Contracts
        keywords: keywords
      },
      limit: 3
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const res = await fetch('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const results = data.results || [];
    
    const evidence: EvidenceItem[] = results.map((award: any, i: number) => ({
      id: `USA-${Date.now()}-${i}`,
      type: 'MARKET_DATA',
      sourceLabel: 'USAspending.gov API',
      claim: `Historical award ${award.Award_ID} to ${award.Recipient_Name} for $${Number(award.Award_Amount).toLocaleString()}.`,
      confidence: 95,
      url: `https://www.usaspending.gov/award/${award.Generated_Internal_ID}`
    }));

    return { name: 'USAspending', success: true, recordsFound: data.page_metadata?.count || 0, evidence };
  } catch (err: any) {
    return { name: 'USAspending', success: false, recordsFound: 0, evidence: [], message: err.message };
  }
}
