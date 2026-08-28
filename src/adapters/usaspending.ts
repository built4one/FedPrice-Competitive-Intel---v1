import { z } from 'zod';
import type { AdapterResult } from './types';
import type { DealProfile, EvidenceItem } from '../types';
import { ConnectorError, fetchJsonWithRetry } from './http';

const awardSchema = z.object({
  'Award ID': z.string().nullish(),
  'Recipient Name': z.string().nullish(),
  'Award Amount': z.union([z.number(), z.string()]).nullish(),
  'Start Date': z.string().nullish(),
  'End Date': z.string().nullish(),
  'Awarding Agency': z.string().nullish(),
  'Award Type': z.string().nullish(),
  generated_internal_id: z.string().nullish(),
}).passthrough();

const responseSchema = z.object({
  results: z.array(awardSchema).default([]),
  page_metadata: z.object({ page: z.number().optional(), hasNext: z.boolean().optional() }).passthrough().optional(),
  messages: z.array(z.string()).optional(),
}).passthrough();

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const validNaics = (value?: string) => value?.match(/\b\d{6}\b/)?.[0];

function filtersFor(deal: DealProfile, broadened = false) {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 8);
  const filters: Record<string, unknown> = {
    award_type_codes: ['A', 'B', 'C', 'D'],
    time_period: [{ start_date: isoDate(start), end_date: isoDate(new Date()) }],
  };
  const naics = validNaics(deal.naics);
  if (naics) filters.naics_codes = { require: [naics] };
  if (!broadened && deal.agency?.trim()) {
    filters.agencies = [{ type: 'awarding', tier: 'toptier', name: deal.agency.trim() }];
  }
  return filters;
}

async function search(deal: DealProfile, broadened: boolean) {
  const payload = {
    filters: filtersFor(deal, broadened),
    fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Start Date', 'End Date', 'Awarding Agency', 'Award Type'],
    page: 1,
    limit: 10,
    subawards: false,
  };
  return fetchJsonWithRetry<unknown>('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  }, { timeoutMs: 15_000, maxAttempts: 3 });
}

export async function queryUSASpending(deal: DealProfile): Promise<AdapterResult> {
  const retrievedAt = new Date().toISOString();
  const naics = validNaics(deal.naics);
  const querySummary = [deal.agency && `agency: ${deal.agency}`, naics && `NAICS: ${naics}`, '8-year contract history'].filter(Boolean).join(' · ');
  if (!deal.agency?.trim() && !naics) {
    return {
      name: 'USAspending', success: true, status: 'ZERO_RESULTS', recordsFound: 0, evidence: [],
      message: 'No agency or valid six-digit NAICS code was available for a defensible award search.',
      durationMs: 0, attempts: 0, retrievedAt, querySummary,
    };
  }
  try {
    let response;
    let broadened = false;
    try {
      response = await search(deal, false);
    } catch (error) {
      if (error instanceof ConnectorError && error.status === 'INVALID_QUERY' && deal.agency && naics) {
        response = await search(deal, true);
        broadened = true;
      } else {
        throw error;
      }
    }
    let parsed = responseSchema.parse(response.data);
    if (parsed.results.length === 0 && deal.agency && naics && !broadened) {
      response = await search(deal, true);
      parsed = responseSchema.parse(response.data);
      broadened = true;
    }

    const evidence: EvidenceItem[] = parsed.results.map((award, index) => {
      const amount = Number(award['Award Amount'] ?? 0);
      const awardId = award['Award ID'] || `record-${index + 1}`;
      const recipient = award['Recipient Name'] || 'recipient not reported';
      return {
        id: `USA-${award.generated_internal_id || awardId}`,
        type: 'EXTERNAL_SOURCE',
        sourceLabel: 'USAspending.gov API',
        sourceRecordId: award.generated_internal_id || awardId,
        claim: `Historical contract award ${awardId} to ${recipient}${Number.isFinite(amount) && amount > 0 ? ` for ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` : ''}.`,
        confidence: 98,
        value: Number.isFinite(amount) ? amount : undefined,
        units: Number.isFinite(amount) ? 'USD award amount' : undefined,
        retrievedAt,
        url: award.generated_internal_id ? `https://www.usaspending.gov/award/${award.generated_internal_id}` : 'https://www.usaspending.gov/search',
      };
    });

    return {
      name: 'USAspending', success: true, status: evidence.length ? 'SUCCESS' : 'ZERO_RESULTS',
      recordsFound: evidence.length, evidence,
      message: evidence.length ? undefined : 'The query completed successfully but found no comparable awards.',
      durationMs: response.durationMs, attempts: response.attempts, retrievedAt,
      querySummary: `${querySummary}${broadened ? ' · broadened to NAICS' : ''}`,
    };
  } catch (error) {
    const failure = error instanceof ConnectorError ? error : undefined;
    return {
      name: 'USAspending', success: false, status: failure?.status || 'ERROR', recordsFound: 0, evidence: [],
      message: error instanceof z.ZodError ? 'USAspending returned an unexpected response shape.' : (error instanceof Error ? error.message : 'USAspending request failed.'),
      durationMs: failure?.durationMs || 0, attempts: failure?.attempts || 1, retrievedAt, querySummary,
    };
  }
}
