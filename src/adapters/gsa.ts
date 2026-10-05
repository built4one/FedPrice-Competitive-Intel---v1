import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AdapterResult } from './types';
import type { EvidenceItem, LaborSignal } from '../types';
import { ConnectorError, fetchJsonWithRetry } from './http';
import { laborFamily, laborRoleMatch, requiresClearance } from '../domain/laborMatching';

const sourceSchema = z.object({
  id: z.union([z.string(), z.number()]), labor_category: z.string(), current_price: z.union([z.number(), z.string()]),
  vendor_name: z.string().nullish(), idv_piid: z.string().nullish(), worksite: z.string().nullish(),
  security_clearance: z.union([z.boolean(), z.string()]).nullish(),
  min_years_experience: z.union([z.number(), z.string()]).nullish(), education_level: z.string().nullish(),
  contract_end: z.string().nullish(),
}).passthrough();
const responseSchema = z.object({ hits: z.object({
  total: z.union([z.number(), z.object({ value: z.number(), relation: z.string().optional() })]).optional(),
  hits: z.array(z.object({ _source: sourceSchema }).passthrough()).default([]),
}).passthrough() }).passthrough();
const endpoint = 'https://api.gsa.gov/acquisition/calc/v3/api/ceilingrates/';
const pageSize = 1000;
const cleared = (value: unknown) => value === true || /^(yes|true)$/i.test(String(value));
const quantile = (values: number[], p: number) => {
  const index = (values.length - 1) * p;
  const low = Math.floor(index), high = Math.ceil(index);
  return values[low] + (values[high] - values[low]) * (index - low);
};

export async function queryGsaCalc(laborSignals: LaborSignal[]): Promise<AdapterResult> {
  const retrievedAt = new Date().toISOString();
  const signals = [...new Map((laborSignals || []).filter(s => s.title?.trim()).map(s => [s.title.toLowerCase(), s])).values()].slice(0, 30);
  const queries = [...new Map(signals.map(s => {
    const category = laborFamily(s.title), clearance = requiresClearance(s.clearance);
    return [`${category}|${clearance}`, { category, clearance }];
  })).values()];
  const querySummary = queries.map(q => `${q.category}${q.clearance ? ' (cleared)' : ''}`).join(', ');
  if (!queries.length) return { name: 'GSA CALC+', success: true, status: 'ZERO_RESULTS', recordsFound: 0, evidence: [], message: 'No specific labor categories were extracted.', durationMs: 0, attempts: 0, retrievedAt, querySummary };
  const started = Date.now();
  const results = [];
  for (let offset = 0; offset < queries.length; offset += 5) {
    results.push(...await Promise.allSettled(queries.slice(offset, offset + 5).map(async query => {
      const urlFor = (page: number) => `${endpoint}?keyword=${encodeURIComponent(query.category)}&page=${page}&page_size=${pageSize}&ordering=vendor_name&sort=asc${query.clearance ? '&filter=security_clearance:yes' : ''}`;
      const first = await fetchJsonWithRetry<unknown>(urlFor(1), { headers: { Accept: 'application/json' } }, { timeoutMs: 12_000, maxAttempts: 2 });
      const parsed = responseSchema.parse(first.data);
      const total = typeof parsed.hits.total === 'number' ? parsed.hits.total : parsed.hits.total?.value ?? parsed.hits.hits.length;
      const pageCount = Math.ceil(total / pageSize);
      // Large searches sample beginning, middle and end by vendor, never the cheapest first records.
      const pages = pageCount <= 3 ? Array.from({length: Math.max(0,pageCount - 1)}, (_,i) => i + 2)
        : [...new Set([Math.ceil(pageCount / 2), pageCount])];
      const rest = await Promise.allSettled(pages.map(async page => {
        const result = await fetchJsonWithRetry<unknown>(urlFor(page), {}, { timeoutMs: 12_000, maxAttempts: 1 });
        return responseSchema.parse(result.data).hits.hits;
      }));
      const hits = [...parsed.hits.hits, ...rest.flatMap(r => r.status === 'fulfilled' ? r.value : [])];
      const records = [...new Map(hits.map(h => {
        const s = h._source;
        const key = [s.vendor_name,s.idv_piid,s.labor_category,s.min_years_experience,s.education_level,s.worksite,s.security_clearance,s.current_price].join('|');
        return [key, s];
      })).values()].filter(s => Number.isFinite(Number(s.current_price)) && Number(s.current_price) > 0
        && (!query.clearance || cleared(s.security_clearance))
        && (!s.contract_end || Date.parse(s.contract_end) >= Date.parse(retrievedAt.slice(0,10))));
      return { ...query, records, complete: hits.length >= total && !(typeof parsed.hits.total === 'object' && parsed.hits.total.relation === 'gte'), url: urlFor(1), total };
    })));
  }
  const successful = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  const evidence: EvidenceItem[] = [];
  const messages: string[] = [];
  for (const signal of signals) {
    const mappedFamily = laborFamily(signal.title);
    const result = successful.find(q => q.category === mappedFamily && q.clearance === requiresClearance(signal.clearance));
    if (!result) { messages.push(`${signal.title}: rate search unavailable.`); continue; }
    const exactMatches = result.records.filter(r => laborRoleMatch(signal.title, r.labor_category) >= 0.8);
    const familyProxyAllowed = mappedFamily.toLowerCase() !== signal.title.trim().toLowerCase();
    const familyMatches = familyProxyAllowed
      ? result.records.filter(r => laborRoleMatch(mappedFamily, r.labor_category) >= 0.8)
      : [];
    const matches = exactMatches.length ? exactMatches : familyMatches;
    const proxyUsed = exactMatches.length === 0 && familyMatches.length > 0;
    if (!matches.length) { messages.push(`${signal.title}: no rate matched the role and clearance filter.`); continue; }
    const rates = matches.map(r => Number(r.current_price)).sort((a,b) => a-b);
    const value = quantile(rates, 0.5);
    const id = createHash('sha256').update(`${signal.title}|${result.clearance}`).digest('hex').slice(0,12);
    evidence.push({
      id: `GSA-SAMPLE-${id}`, type: 'EXTERNAL_SOURCE', sourceLabel: 'GSA CALC+ API', sourceRecordId: id,
      claim: proxyUsed
        ? `${signal.title}: provisional ${mappedFamily} family proxy with median public ceiling rate ${value.toFixed(2)} USD/hour across ${matches.length} matched contract/category records. Analyst must validate that the proxy is suitable before pricing use. ${result.clearance ? 'Records require clearance; exact clearance level is not verified.' : 'No clearance filter applied.'} ${result.complete ? 'Complete retrieved search population.' : 'Bounded sample of the search population; provisional benchmark.'}`
        : `${signal.title}: median public ceiling rate ${value.toFixed(2)} USD/hour across ${matches.length} matched contract/category records. ${result.clearance ? 'Records require clearance; exact clearance level is not verified.' : 'No clearance filter applied.'} ${result.complete ? 'Complete retrieved search population.' : 'Bounded sample of the search population; provisional benchmark.'}`,
      excerpt: `Search role: ${result.category}. ${proxyUsed ? `Solicitation title mapped to ${mappedFamily} as a provisional benchmark family. ` : ''}Matched categories: ${[...new Set(matches.map(r => r.labor_category))].slice(0,16).join('; ')}. Record examples: ${matches.slice(0,8).map(r => `${r.id}: ${r.vendor_name}, ${r.idv_piid}, ${r.labor_category}, ${r.current_price}/hour`).join('; ')}`,
      confidence: proxyUsed ? (result.complete ? 75 : 60) : (result.complete ? 90 : 70), retrievedAt, url: result.url,
      numeric: { originalValue: value, valueType: 'HOURLY_CEILING_RATE', units: 'USD_PER_HOUR', currency: 'USD',
        scopeText: signal.title, sourceDate: retrievedAt.slice(0,10), matchedLaborCategory: signal.title,
        lowerRate: quantile(rates,0.25), upperRate: quantile(rates,0.75), rateSampleSize: matches.length,
        rateSampleComplete: result.complete, clearanceRequired: result.clearance, laborMatchScore: proxyUsed ? 0.60 : 0.85,
        technologySecurityLocation: `${proxyUsed ? `Provisional ${mappedFamily} family mapping; validate qualifications. ` : ''}${result.clearance ? 'Clearance required; exact level and worksite must be validated.' : 'Clearance and worksite not constrained.'}`,
      },
    });
    if (proxyUsed) messages.push(`${signal.title}: used a provisional ${mappedFamily} family proxy; analyst validation required.`);
    if (!result.complete) messages.push(`${signal.title}: sampled ${matches.length} matching records from ${result.total} search results.`);
  }
  if (signals.length < laborSignals.length) messages.push('The first 30 distinct labor roles were searched; remaining roles need review.');
  const failure = results.find(r => r.status === 'rejected');
  return { name: 'GSA CALC+', success: successful.length > 0,
    status: evidence.length ? 'SUCCESS' : successful.length ? 'ZERO_RESULTS' : failure?.status === 'rejected' && failure.reason instanceof ConnectorError ? failure.reason.status : 'ERROR',
    recordsFound: evidence.length, evidence, message: messages.join(' ') || (evidence.length ? 'Role-matched public ceiling-rate samples. These are not transaction prices or competitor bids.' : 'No comparable rate evidence returned.'),
    durationMs: Date.now() - started, attempts: queries.length, retrievedAt, querySummary };
}