import type { AdapterResult } from './types';
import type { EvidenceItem } from '../types';

export async function queryBls(): Promise<AdapterResult> {
  try {
    // Employment Cost Index (ECI) for civilian workers (CIU1010000000000A)
    const currentYear = new Date().getFullYear();
    const payload = {
      seriesid: ['CIU1010000000000A'],
      startyear: (currentYear - 2).toString(),
      endyear: currentYear.toString()
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    if (data.status !== 'REQUEST_SUCCEEDED') throw new Error('BLS API returned non-success status');
    
    const seriesData = data.Results?.series?.[0]?.data || [];
    const evidence: EvidenceItem[] = seriesData.slice(0, 1).map((point: any) => ({
      id: `BLS-${Date.now()}`,
      type: 'MARKET_DATA',
      sourceLabel: 'BLS API',
      claim: `Employment Cost Index (ECI) observation for ${point.periodName} ${point.year}: ${point.value}.`,
      confidence: 98,
      url: `https://www.bls.gov/eci/`
    }));

    return { name: 'BLS', success: true, recordsFound: seriesData.length || 0, evidence };
  } catch (err: any) {
    return { name: 'BLS', success: false, recordsFound: 0, evidence: [], message: err.message };
  }
}
