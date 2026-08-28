import { z } from 'zod';
import type { AdapterResult } from './types';
import type { EvidenceItem } from '../types';
import { ConnectorError, fetchJsonWithRetry } from './http';

const responseSchema = z.object({
  status: z.string(),
  message: z.array(z.string()).default([]),
  Results: z.object({
    series: z.array(z.object({
      seriesID: z.string(),
      data: z.array(z.object({
        year: z.string(), period: z.string(), periodName: z.string(), value: z.string(),
      }).passthrough()).default([]),
    }).passthrough()).default([]),
  }),
}).passthrough();

export async function queryBls(): Promise<AdapterResult> {
  const retrievedAt = new Date().toISOString();
  const currentYear = new Date().getUTCFullYear();
  const seriesId = 'CIU1010000000000A';
  const querySummary = `Employment Cost Index · ${currentYear - 2}–${currentYear}`;
  try {
    const payload: Record<string, unknown> = {
      seriesid: [seriesId], startyear: String(currentYear - 2), endyear: String(currentYear),
    };
    if (process.env.BLS_API_KEY) payload.registrationkey = process.env.BLS_API_KEY;
    const response = await fetchJsonWithRetry<unknown>('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload),
    }, { timeoutMs: 12_000, maxAttempts: 3 });
    const parsed = responseSchema.parse(response.data);
    if (parsed.status !== 'REQUEST_SUCCEEDED') throw new Error(parsed.message.join(' ') || `BLS returned status ${parsed.status}.`);
    const points = parsed.Results.series[0]?.data || [];
    const latest = points[0];
    const evidence: EvidenceItem[] = latest ? [{
      id: `BLS-${seriesId}-${latest.year}-${latest.period}`,
      type: 'EXTERNAL_SOURCE', sourceLabel: 'BLS Public Data API', sourceRecordId: seriesId,
      claim: `Employment Cost Index 12-month change for civilian workers was ${latest.value}% in ${latest.periodName} ${latest.year}.`,
      confidence: 99, value: Number(latest.value), units: 'percent change', retrievedAt, url: 'https://www.bls.gov/eci/',
    }] : [];
    return {
      name: 'BLS', success: true, status: evidence.length ? 'SUCCESS' : 'ZERO_RESULTS', recordsFound: points.length, evidence,
      message: evidence.length ? undefined : 'BLS returned no observations for the requested period.',
      durationMs: response.durationMs, attempts: response.attempts, retrievedAt, querySummary,
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : undefined;
    return {
      name: 'BLS', success: false, status: failure?.status || 'ERROR', recordsFound: 0, evidence: [],
      message: error instanceof z.ZodError ? 'BLS returned an unexpected response shape.' : (error instanceof Error ? error.message : 'BLS request failed.'),
      durationMs: failure?.durationMs || 0, attempts: failure?.attempts || 1, retrievedAt, querySummary,
    };
  }
}
