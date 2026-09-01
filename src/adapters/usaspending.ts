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
  'Awarding Sub Agency': z.string().nullish(),
  'Award Type': z.string().nullish(),
  'Description': z.string().nullish(),
  'NAICS Code': z.union([z.string(), z.number()]).nullish(),
  'Product or Service Code': z.string().nullish(),
  generated_internal_id: z.string().nullish(),
}).passthrough();

const responseSchema = z.object({
  results: z.array(awardSchema).default([]),
  page_metadata: z.object({ page: z.number().optional(), hasNext: z.boolean().optional() }).passthrough().optional(),
  messages: z.array(z.string()).optional(),
}).passthrough();

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const validNaics = (value?: string) => value?.match(/\b\d{6}\b/)?.[0];

const agencyAliases: Array<[RegExp, { tier: 'toptier' | 'subtier'; name: string }]> = [
  [/\bNASA\b|National Aeronautics|Langley/i, { tier: 'toptier', name: 'National Aeronautics and Space Administration' }],
  [/Food and Drug|\bFDA\b/i, { tier: 'subtier', name: 'Food and Drug Administration' }],
  [/Air Force|\bAFRL\b/i, { tier: 'subtier', name: 'Department of the Air Force' }],
  [/\bArmy\b|ACC-/i, { tier: 'subtier', name: 'Department of the Army' }],
  [/\bNavy\b|NAVSEA|NAVAIR/i, { tier: 'subtier', name: 'Department of the Navy' }],
  [/Department of Defense|\bDoD\b/i, { tier: 'toptier', name: 'Department of Defense' }],
  [/Health and Human Services|\bHHS\b/i, { tier: 'toptier', name: 'Department of Health and Human Services' }],
];

export function normalizeAwardingAgency(value?: string) {
  if (!value?.trim()) return undefined;
  return agencyAliases.find(([pattern]) => pattern.test(value))?.[1] || { tier: 'toptier' as const, name: value.trim() };
}

const stopWords = new Set(['and', 'the', 'for', 'with', 'from', 'this', 'that', 'services', 'service', 'support', 'contract', 'department']);
const textTokens = (value?: string) => new Set((value || '').toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !stopWords.has(token)));
const overlap = (left?: string, right?: string) => {
  const a = textTokens(left); const b = textTokens(right);
  if (!a.size || !b.size) return undefined;
  return [...a].filter((token) => b.has(token)).length / Math.min(a.size, b.size);
};

function awardRelevance(award: z.infer<typeof awardSchema>, deal: DealProfile) {
  const factors: Array<[number, number | undefined]> = [];
  const targetAgency = normalizeAwardingAgency(deal.agency)?.name;
  const awardAgency = `${award['Awarding Agency'] || ''} ${award['Awarding Sub Agency'] || ''}`;
  const searchableAward = `${award['Award ID'] || ''} ${award['Recipient Name'] || ''} ${award['Description'] || ''}`.toLowerCase();
  const identifiers = searchTermsFor(deal).filter((term) => term.length >= 4);
  const identifierMatch = identifiers.length
    ? Math.max(...identifiers.map((term) => searchableAward.includes(term.toLowerCase()) ? 1 : overlap(term, searchableAward) || 0))
    : undefined;
  factors.push([0.25, overlap(targetAgency, awardAgency)]);
  factors.push([0.30, overlap(`${deal.title} ${deal.scopeSummary}`, award['Description'] || undefined)]);
  const targetNaics = validNaics(deal.naics);
  const awardNaics = validNaics(award['NAICS Code'] ? String(award['NAICS Code']) : undefined);
  factors.push([0.15, targetNaics && awardNaics ? (targetNaics === awardNaics ? 1 : targetNaics.slice(0, 4) === awardNaics.slice(0, 4) ? 0.6 : 0) : undefined]);
  factors.push([0.10, deal.psc && award['Product or Service Code'] ? (deal.psc === award['Product or Service Code'] ? 1 : deal.psc.slice(0, 2) === award['Product or Service Code']?.slice(0, 2) ? 0.6 : 0) : undefined]);
  factors.push([0.20, identifierMatch]);
  const covered = factors.reduce((sum, [weight, value]) => sum + (value === undefined ? 0 : weight), 0);
  return covered ? factors.reduce((sum, [weight, value]) => sum + weight * (value || 0), 0) / covered : 0;
}

export function searchTermsFor(deal: DealProfile) {
  const factTerms = (deal.facts || [])
    .filter((fact) => /program|acronym|incumbent|predecessor|current contract|prior contract|contract number|award id|vehicle/i.test(fact.label))
    .map((fact) => fact.value.trim())
    .filter((value) => value.length >= 4 && !/unknown|not found|not provided|n\/a/i.test(value));
  const acronyms = (deal.title.match(/\b[A-Z][A-Z0-9]{2,}\b/g) || []).filter((value) => !['RFP', 'RFQ', 'IDIQ'].includes(value));
  const title = deal.title.trim().length >= 8 ? deal.title.trim().slice(0, 100) : '';
  return [...new Set([deal.solicitationNumber?.trim(), ...factTerms, ...acronyms, title].filter((value): value is string => Boolean(value)))].slice(0, 6);
}

function filtersFor(deal: DealProfile, broadened = false, keyword?: string) {
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 8);
  const filters: Record<string, unknown> = {
    award_type_codes: ['A', 'B', 'C', 'D'],
    time_period: [{ start_date: isoDate(start), end_date: isoDate(new Date()) }],
  };
  const naics = validNaics(deal.naics);
  if (naics && !keyword) filters.naics_codes = { require: [naics] };
  const agency = normalizeAwardingAgency(deal.agency);
  if (!broadened && agency) {
    filters.agencies = [{ type: 'awarding', tier: agency.tier, name: agency.name }];
  }
  if (keyword) filters.keywords = [keyword];
  return filters;
}

async function search(deal: DealProfile, broadened: boolean, keyword?: string) {
  const payload = {
    filters: filtersFor(deal, broadened, keyword),
    fields: [
      'Award ID', 'Recipient Name', 'Award Amount', 'Start Date', 'End Date', 'Awarding Agency',
      'Awarding Sub Agency', 'Award Type', 'Description', 'NAICS Code', 'Product or Service Code',
    ],
    page: 1,
    limit: 50,
    subawards: false,
  };
  return fetchJsonWithRetry<unknown>('https://api.usaspending.gov/api/v2/search/spending_by_award/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  }, { timeoutMs: keyword ? 10_000 : 15_000, maxAttempts: keyword ? 2 : 3 });
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
    let baselineResponse;
    let broadened = false;
    try {
      baselineResponse = await search(deal, false);
    } catch (error) {
      if (error instanceof ConnectorError && error.status === 'INVALID_QUERY' && deal.agency && naics) {
        baselineResponse = await search(deal, true);
        broadened = true;
      } else {
        throw error;
      }
    }
    let baseline = responseSchema.parse(baselineResponse.data);
    if (baseline.results.length === 0 && deal.agency && naics && !broadened) {
      baselineResponse = await search(deal, true);
      baseline = responseSchema.parse(baselineResponse.data);
      broadened = true;
    }

    const focusedTerms = searchTermsFor(deal).slice(0, 5);
    const focusedSettled = await Promise.allSettled(focusedTerms.map((term) => search(deal, false, term)));
    const focusedResponses = focusedSettled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const focusedResults = focusedResponses.flatMap((response) => responseSchema.parse(response.data).results);
    const allResults = [...baseline.results, ...focusedResults];
    const dedupedResults = [...new Map(allResults.map((award, index) => [
      award.generated_internal_id || award['Award ID'] || `record-${index}`,
      award,
    ])).values()];

    const ranked = dedupedResults
      .map((award) => ({ award, relevance: awardRelevance(award, deal) }))
      .filter(({ relevance }) => relevance >= 0.45)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 10);

    const evidence: EvidenceItem[] = ranked.map(({ award }, index) => {
      const amount = Number(award['Award Amount'] ?? 0);
      const awardId = award['Award ID'] || `record-${index + 1}`;
      const recipient = award['Recipient Name'] || 'recipient not reported';
      const startDate = award['Start Date'] ? new Date(award['Start Date']) : undefined;
      const endDate = award['End Date'] ? new Date(award['End Date']) : undefined;
      const periodMonths = startDate && endDate && !Number.isNaN(startDate.valueOf()) && !Number.isNaN(endDate.valueOf())
        ? Math.max(1, Math.round((endDate.valueOf() - startDate.valueOf()) / (30.4375 * 24 * 60 * 60 * 1000)))
        : undefined;
      return {
        id: `USA-${award.generated_internal_id || awardId}`,
        type: 'EXTERNAL_SOURCE',
        sourceLabel: 'USAspending.gov API',
        sourceRecordId: award.generated_internal_id || awardId,
        claim: `Historical contract award ${awardId} to ${recipient}${Number.isFinite(amount) && amount > 0 ? ` for ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` : ''}.`,
        confidence: 98,
        numeric: Number.isFinite(amount) && amount > 0 ? {
          originalValue: amount,
          valueType: 'CURRENT_AWARD_AMOUNT' as const,
          currency: 'USD' as const,
          units: 'TOTAL_USD' as const,
          periodMonths,
          baseYear: startDate && !Number.isNaN(startDate.valueOf()) ? startDate.getUTCFullYear() : undefined,
          sourceDate: award['Start Date'] || undefined,
          endDate: award['End Date'] || undefined,
          agency: award['Awarding Sub Agency'] || award['Awarding Agency'] || undefined,
          naics: award['NAICS Code'] ? String(award['NAICS Code']) : undefined,
          psc: award['Product or Service Code'] || undefined,
          contractType: award['Award Type'] || undefined,
          scopeText: award['Description'] || undefined,
          acquisitionStructure: award['Award Type'] || undefined,
          laborIntensity: 'UNKNOWN' as const,
          valueBasis: 'INDIVIDUAL_AWARD' as const,
        } : undefined,
        retrievedAt,
        url: award.generated_internal_id ? `https://www.usaspending.gov/award/${award.generated_internal_id}` : 'https://www.usaspending.gov/search',
      };
    });

    return {
      name: 'USAspending', success: true, status: evidence.length ? 'SUCCESS' : 'ZERO_RESULTS',
      recordsFound: evidence.length, evidence,
      message: evidence.length ? undefined : `The query completed successfully but none of ${dedupedResults.length} returned awards met the minimum relevance standard.`,
      durationMs: baselineResponse.durationMs + focusedResponses.reduce((sum, response) => sum + response.durationMs, 0),
      attempts: baselineResponse.attempts + focusedResponses.reduce((sum, response) => sum + response.attempts, 0),
      retrievedAt,
      querySummary: `${querySummary}${broadened ? ' · broadened to NAICS' : ''}${focusedTerms.length ? ` · focused: ${focusedTerms.join(', ')}` : ''} · ${evidence.length}/${dedupedResults.length} relevance-qualified`,
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
