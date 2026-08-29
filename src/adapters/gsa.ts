import { z } from 'zod';
import type { AdapterResult } from './types';
import type { EvidenceItem, LaborSignal } from '../types';
import { ConnectorError, fetchJsonWithRetry } from './http';

const sourceSchema = z.object({
  id: z.union([z.string(), z.number()]),
  labor_category: z.string(),
  current_price: z.union([z.number(), z.string()]),
  next_year_price: z.union([z.number(), z.string()]).nullish(),
  vendor_name: z.string().nullish(),
  schedule: z.string().nullish(),
  education_level: z.string().nullish(),
  min_years_experience: z.union([z.number(), z.string()]).nullish(),
  worksite: z.string().nullish(),
  security_clearance: z.boolean().nullish(),
  idv_piid: z.string().nullish(),
}).passthrough();

const responseSchema = z.object({
  hits: z.object({
    hits: z.array(z.object({ _source: sourceSchema }).passthrough()).default([]),
  }).passthrough(),
}).passthrough();

const usefulTokens = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !['the', 'and', 'for', 'senior', 'junior'].includes(token));

export async function queryGsaCalc(laborSignals: LaborSignal[]): Promise<AdapterResult> {
  const retrievedAt = new Date().toISOString();
  const category = laborSignals?.find((item) => item.title?.trim())?.title?.trim();
  const querySummary = category ? `labor category: ${category}` : 'No labor category extracted';
  if (!category) {
    return {
      name: 'GSA CALC+', success: true, status: 'ZERO_RESULTS', recordsFound: 0, evidence: [],
      message: 'No labor category was available to search.', durationMs: 0, attempts: 0, retrievedAt, querySummary,
    };
  }

  try {
    const url = `https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/?keyword=${encodeURIComponent(category)}`;
    const response = await fetchJsonWithRetry<unknown>(url, { headers: { Accept: 'application/json' } }, { timeoutMs: 15_000, maxAttempts: 3 });
    const parsed = responseSchema.parse(response.data);
    const tokens = usefulTokens(category);
    const comparable = parsed.hits.hits
      .map((hit) => hit._source)
      .filter((rate) => {
        const normalized = rate.labor_category.toLowerCase();
        return tokens.length === 0 || tokens.some((token) => normalized.includes(token));
      })
      .slice(0, 10);

    const evidence: EvidenceItem[] = comparable.map((rate) => {
      const price = Number(rate.current_price);
      return {
        id: `GSA-${rate.id}`,
        type: 'EXTERNAL_SOURCE', sourceLabel: 'GSA CALC+ API', sourceRecordId: String(rate.id),
        claim: `${rate.labor_category} has a current GSA ceiling rate of ${price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}/hour${rate.vendor_name ? ` from ${rate.vendor_name}` : ''}${rate.schedule ? ` on ${rate.schedule}` : ''}.`,
        confidence: 96,
        numeric: Number.isFinite(price) && price > 0 ? {
          originalValue: price,
          valueType: 'HOURLY_CEILING_RATE' as const,
          currency: 'USD' as const,
          units: 'USD_PER_HOUR' as const,
          scopeText: rate.labor_category,
          contractType: rate.schedule || undefined,
          technologySecurityLocation: [
            rate.worksite,
            rate.security_clearance ? 'security clearance required' : undefined,
            rate.education_level,
          ].filter(Boolean).join(' '),
        } : undefined,
        retrievedAt,
        url: 'https://buy.gsa.gov/pricing/qr/mas?page=1&page_size=20',
      };
    });
    return {
      name: 'GSA CALC+', success: true, status: evidence.length ? 'SUCCESS' : 'ZERO_RESULTS', recordsFound: evidence.length, evidence,
      message: evidence.length ? undefined : 'GSA responded successfully but returned no sufficiently comparable labor categories.',
      durationMs: response.durationMs, attempts: response.attempts, retrievedAt, querySummary,
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : undefined;
    return {
      name: 'GSA CALC+', success: false, status: failure?.status || 'ERROR', recordsFound: 0, evidence: [],
      message: error instanceof z.ZodError ? 'GSA returned an unexpected response shape.' : (error instanceof Error ? error.message : 'GSA request failed.'),
      durationMs: failure?.durationMs || 0, attempts: failure?.attempts || 1, retrievedAt, querySummary,
    };
  }
}
