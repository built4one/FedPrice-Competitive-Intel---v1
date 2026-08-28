import { z } from 'zod';
import type { AdapterResult } from './types';
import type { DealProfile, EvidenceItem } from '../types';
import { ConnectorError, fetchJsonWithRetry } from './http';

const responseSchema = z.object({
  totalRecords: z.number().default(0),
  opportunitiesData: z.array(z.object({
    noticeId: z.string().nullish(), title: z.string().nullish(), solicitationNumber: z.string().nullish(),
    department: z.string().nullish(), subTier: z.string().nullish(), postedDate: z.string().nullish(),
    type: z.string().nullish(), naicsCode: z.string().nullish(),
  }).passthrough()).default([]),
}).passthrough();

const mmddyyyy = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;

export async function querySamGov(deal: DealProfile): Promise<AdapterResult> {
  const apiKey = process.env.SAM_API_KEY;
  const retrievedAt = new Date().toISOString();
  const querySummary = deal.solicitationNumber ? `solicitation: ${deal.solicitationNumber}` : `title: ${deal.title}`;
  if (!apiKey) {
    return {
      name: 'SAM.gov', success: false, status: 'UNAVAILABLE', recordsFound: 0, evidence: [],
      message: 'Optional SAM_API_KEY is not configured.', durationMs: 0, attempts: 0, retrievedAt, querySummary,
    };
  }

  try {
    const from = new Date();
    from.setUTCFullYear(from.getUTCFullYear() - 1);
    const params = new URLSearchParams({
      api_key: apiKey, postedFrom: mmddyyyy(from), postedTo: mmddyyyy(new Date()), limit: '10', offset: '0',
    });
    if (deal.solicitationNumber?.trim()) params.set('solnum', deal.solicitationNumber.trim());
    else if (deal.title?.trim()) params.set('title', deal.title.trim());
    const response = await fetchJsonWithRetry<unknown>(`https://api.sam.gov/prod/opportunities/v2/search?${params}`, {
      headers: { Accept: 'application/json' },
    }, { timeoutMs: 15_000, maxAttempts: 3 });
    const parsed = responseSchema.parse(response.data);
    const evidence: EvidenceItem[] = parsed.opportunitiesData.map((opportunity, index) => ({
      id: `SAM-${opportunity.noticeId || opportunity.solicitationNumber || index + 1}`,
      type: 'EXTERNAL_SOURCE', sourceLabel: 'SAM.gov Opportunities API',
      sourceRecordId: opportunity.noticeId || opportunity.solicitationNumber || undefined,
      claim: `SAM notice: ${opportunity.title || 'Untitled opportunity'}${opportunity.solicitationNumber ? ` (${opportunity.solicitationNumber})` : ''}${opportunity.department ? ` from ${opportunity.department}` : ''}.`,
      confidence: 98, retrievedAt,
      url: opportunity.noticeId ? `https://sam.gov/opp/${opportunity.noticeId}/view` : 'https://sam.gov/search/',
    }));
    return {
      name: 'SAM.gov', success: true, status: evidence.length ? 'SUCCESS' : 'ZERO_RESULTS', recordsFound: evidence.length, evidence,
      message: evidence.length ? undefined : 'SAM.gov responded successfully but found no matching notice in the last year.',
      durationMs: response.durationMs, attempts: response.attempts, retrievedAt, querySummary,
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : undefined;
    return {
      name: 'SAM.gov', success: false, status: failure?.status || 'ERROR', recordsFound: 0, evidence: [],
      message: error instanceof z.ZodError ? 'SAM.gov returned an unexpected response shape.' : (error instanceof Error ? error.message : 'SAM.gov request failed.'),
      durationMs: failure?.durationMs || 0, attempts: failure?.attempts || 1, retrievedAt, querySummary,
    };
  }
}
