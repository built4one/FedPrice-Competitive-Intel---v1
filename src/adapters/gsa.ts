import type { AdapterResult } from './types';
import type { DealProfile, EvidenceItem, LaborSignal } from '../types';

export async function queryGsaCalc(laborSignals: LaborSignal[]): Promise<AdapterResult> {
  if (!laborSignals || laborSignals.length === 0) {
    return { name: 'GSA CALC+', success: true, recordsFound: 0, evidence: [], message: 'No labor categories to search.' };
  }

  try {
    // Take the most prominent labor category to search for realistic market rates
    const query = encodeURIComponent(laborSignals[0].title);
    const url = `https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/?q=${query}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const results = data.results || [];
    
    const evidence: EvidenceItem[] = results.slice(0, 3).map((rate: any, i: number) => ({
      id: `GSA-${Date.now()}-${i}`,
      type: 'MARKET_DATA',
      sourceLabel: 'GSA CALC+ API',
      claim: `Schedule rate found for "${rate.labor_category}": $${rate.next_year_rate} (${rate.vendor_name}, ${rate.schedule_name}).`,
      confidence: 85,
      url: `https://calc.gsa.gov/`
    }));

    return { name: 'GSA CALC+', success: true, recordsFound: data.count || 0, evidence };
  } catch (err: any) {
    return { name: 'GSA CALC+', success: false, recordsFound: 0, evidence: [], message: err.message };
  }
}
