import { z } from 'zod';
import type { AdapterResult } from './types';
import type { DealProfile, EvidenceItem } from '../types';
import { ConnectorError, fetchJsonWithRetry } from './http';

const resourceLinkSchema = z.object({
  type: z.string().nullish(),
  name: z.string().nullish(),
  link: z.string().nullish()
}).passthrough();

const responseSchema = z.object({
  totalRecords: z.number().default(0),
  opportunitiesData: z.array(z.object({
    noticeId: z.string().nullish(), title: z.string().nullish(), solicitationNumber: z.string().nullish(),
    department: z.string().nullish(), subTier: z.string().nullish(), postedDate: z.string().nullish(),
    type: z.string().nullish(), naicsCode: z.string().nullish(),
    resourceLinks: z.array(z.union([resourceLinkSchema, z.string()])).nullish()
  }).passthrough()).default([]),
}).passthrough();

const mmddyyyy = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;

export async function querySamGov(deal: DealProfile, uploadedFiles: string[] = []): Promise<AdapterResult> {
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
    let parsed: z.infer<typeof responseSchema> | null = null;
    let response: { data: unknown, durationMs: number, attempts: number } | null = null;
    let statusMsg: string | undefined = '';

    // Strategy 1: Exact solicitation match without date range constraints (fixes invalid date issue for older opps)
    if (deal.solicitationNumber?.trim()) {
      const params = new URLSearchParams({ api_key: apiKey, limit: '10', offset: '0', solnum: deal.solicitationNumber.trim() });
      try {
        response = await fetchJsonWithRetry<unknown>(`https://api.sam.gov/prod/opportunities/v2/search?${params}`, { headers: { Accept: 'application/json' } }, { timeoutMs: 15_000, maxAttempts: 2 });
        const solParsed = responseSchema.parse(response.data);
        if (solParsed.opportunitiesData.length > 0) {
          parsed = solParsed;
          statusMsg = undefined;
        }
      } catch (e) {
        // Fallthrough if it fails
      }
    }

    // Strategy 2: Date bounded search if Strategy 1 failed or we only have title
    if (!parsed) {
      const from = new Date();
      from.setUTCFullYear(from.getUTCFullYear() - 1);
      const params = new URLSearchParams({
        api_key: apiKey, postedFrom: mmddyyyy(from), postedTo: mmddyyyy(new Date()), limit: '10', offset: '0',
      });
      if (deal.solicitationNumber?.trim()) params.set('solnum', deal.solicitationNumber.trim());
      else if (deal.title?.trim()) params.set('title', deal.title.trim());

      response = await fetchJsonWithRetry<unknown>(`https://api.sam.gov/prod/opportunities/v2/search?${params}`, {
        headers: { Accept: 'application/json' },
      }, { timeoutMs: 15_000, maxAttempts: 2 });
      parsed = responseSchema.parse(response.data);
      statusMsg = parsed.opportunitiesData.length > 0 ? undefined : 'SAM.gov responded successfully but found no matching notice in the last year.';
    }

    const durationMs = response?.durationMs || 0;
    const attempts = response?.attempts || 1;

    let samDocuments: { name: string; url: string; provided: boolean; type: string }[] = [];
    if (parsed.opportunitiesData[0]?.resourceLinks) {
      samDocuments = await Promise.all(parsed.opportunitiesData[0].resourceLinks.map(async (link) => {
        let name = 'Unnamed Document';
        let url = '#';
        let type = 'document';
        
        if (typeof link === 'string') {
          url = link;
          try {
            const u = new URL(link);
            u.searchParams.set('api_key', apiKey);
            const res = await fetch(u.toString(), { method: 'GET', redirect: 'manual' });
            const disp = res.headers.get('content-disposition');
            if (disp) {
              const match = disp.match(/filename="?([^"]+)"?/);
              if (match) name = match[1];
            }
          } catch (e) {
            name = 'Document (Fetch Failed)';
          }
        } else {
          name = link.name || 'Unnamed Document';
          url = link.link || '#';
          type = link.type || 'document';
        }
        
        const isProvided = uploadedFiles.some(file => file.toLowerCase() === name.toLowerCase() || name.toLowerCase().includes(file.toLowerCase()) || file.toLowerCase().includes(name.toLowerCase()));
        return { name, url, type, provided: isProvided };
      }));
    }

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
      message: statusMsg,
      durationMs, attempts, retrievedAt, querySummary,
      samDocuments: samDocuments.length > 0 ? samDocuments : undefined
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
