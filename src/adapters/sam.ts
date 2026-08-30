import { z } from 'zod';
import type { AdapterResult, SamDocumentStatus } from './types';
import type { DealProfile, EvidenceItem } from '../types';
import { ConnectorError, fetchJsonWithRetry } from './http';

const resourceLinkSchema = z.object({
  type: z.string().nullish(),
  name: z.string().nullish(),
  link: z.string().nullish(),
}).passthrough();

const opportunitySchema = z.object({
  noticeId: z.string().nullish(),
  title: z.string().nullish(),
  solicitationNumber: z.string().nullish(),
  fullParentPathName: z.string().nullish(),
  department: z.string().nullish(),
  subTier: z.string().nullish(),
  office: z.string().nullish(),
  postedDate: z.string().nullish(),
  responseDeadLine: z.string().nullish(),
  type: z.string().nullish(),
  typeOfSetAsideDescription: z.string().nullish(),
  naicsCode: z.string().nullish(),
  classificationCode: z.string().nullish(),
  description: z.string().nullish(),
  uiLink: z.string().nullish(),
  resourceLinks: z.array(z.union([resourceLinkSchema, z.string()])).nullish(),
}).passthrough();

const responseSchema = z.object({
  totalRecords: z.number().default(0),
  opportunitiesData: z.array(opportunitySchema).default([]),
}).passthrough();

type SamOpportunity = z.infer<typeof opportunitySchema>;

export interface SamOpportunityMetadata {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  agency?: string;
  department?: string;
  subTier?: string;
  office?: string;
  postedDate?: string;
  responseDeadline?: string;
  noticeType?: string;
  setAside?: string;
  naics?: string;
  psc?: string;
  descriptionUrl?: string;
  uiUrl?: string;
}

export interface SamRetrievedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  sourceUrl: string;
}

export interface SamOpportunityPackage {
  opportunity: SamOpportunityMetadata;
  files: SamRetrievedFile[];
  adapterResult: AdapterResult;
}

const mmddyyyy = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
const normalize = (value?: string | null) => value?.trim().toLowerCase() || '';
const maxAutoFiles = Math.max(1, Number(process.env.SAM_AUTO_MAX_FILES || 20));
const maxAutoFileBytes = Math.max(1, Number(process.env.SAM_AUTO_MAX_FILE_MB || 8)) * 1024 * 1024;
const maxAutoPackageBytes = Math.max(1, Number(process.env.SAM_AUTO_MAX_PACKAGE_MB || 24)) * 1024 * 1024;

function publicUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.searchParams.delete('api_key');
    return url.toString();
  } catch {
    return value;
  }
}

function withApiKey(value: string, apiKey: string) {
  const url = new URL(value);
  if (url.hostname === 'api.sam.gov' || url.hostname.endsWith('.sam.gov') || url.hostname === 'sam.gov') {
    url.searchParams.set('api_key', apiKey);
  }
  return url.toString();
}

function filenameFromDisposition(disposition: string | null) {
  if (!disposition) return undefined;
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded.replace(/["']/g, '')); } catch { return encoded.replace(/["']/g, ''); }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
}

function filenameFromUrl(value: string, fallback = 'SAM Opportunity Document') {
  try {
    const url = new URL(value);
    const candidate = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
    return candidate && candidate.toLowerCase() !== 'download' ? candidate : fallback;
  } catch {
    return fallback;
  }
}

function inferMime(name: string, header?: string | null) {
  const normalizedHeader = header?.split(';')[0]?.trim().toLowerCase();
  if (normalizedHeader && normalizedHeader !== 'application/octet-stream' && normalizedHeader !== 'binary/octet-stream') return normalizedHeader;
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.txt') || lower.endsWith('.csv')) return 'text/plain';
  return 'application/octet-stream';
}

function isSupportedMime(mime: string) {
  return [
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(mime);
}

function isProvided(name: string, uploadedFiles: string[]) {
  const normalizedName = normalize(name);
  return uploadedFiles.some((file) => {
    const normalizedFile = normalize(file);
    return normalizedFile === normalizedName || normalizedName.includes(normalizedFile) || normalizedFile.includes(normalizedName);
  });
}

export function parseSamOpportunityReference(value: string) {
  const input = value.trim();
  if (!input) return {};
  try {
    const url = new URL(input);
    if (url.hostname === 'sam.gov' || url.hostname.endsWith('.sam.gov')) {
      const match = url.pathname.match(/\/opp\/([^/]+)\/view/i);
      if (match?.[1]) return { noticeId: match[1] };
    }
  } catch {
    // A solicitation number is expected to not parse as a URL.
  }
  return { solicitationNumber: input };
}

function exactMatches(data: z.infer<typeof responseSchema>, reference: ReturnType<typeof parseSamOpportunityReference>) {
  if (reference.noticeId) return data.opportunitiesData.filter((item) => normalize(item.noticeId) === normalize(reference.noticeId));
  if (reference.solicitationNumber) return data.opportunitiesData.filter((item) => normalize(item.solicitationNumber) === normalize(reference.solicitationNumber));
  return [];
}

async function findOpportunity(referenceValue: string, apiKey: string) {
  const reference = parseSamOpportunityReference(referenceValue);
  if (!reference.noticeId && !reference.solicitationNumber) throw new Error('Enter a solicitation number or SAM.gov opportunity URL.');

  const baseParams = new URLSearchParams({ api_key: apiKey, limit: '10', offset: '0' });
  if (reference.noticeId) baseParams.set('noticeid', reference.noticeId);
  if (reference.solicitationNumber) baseParams.set('solnum', reference.solicitationNumber);

  // Preserve the known-good exact lookup first. Some SAM deployments accept exact identifiers without dates.
  try {
    const response = await fetchJsonWithRetry<unknown>(`https://api.sam.gov/prod/opportunities/v2/search?${baseParams}`, { headers: { Accept: 'application/json' } }, { timeoutMs: 15_000, maxAttempts: 2 });
    const parsed = responseSchema.parse(response.data);
    const exact = exactMatches(parsed, reference);
    if (exact.length) return { opportunity: exact[0], durationMs: response.durationMs, attempts: response.attempts };
  } catch (error) {
    if (error instanceof ConnectorError && ['RATE_LIMITED', 'AUTH_REQUIRED', 'TIMEOUT', 'SOURCE_UNAVAILABLE'].includes(error.status)) throw error;
  }

  // Documented API behavior requires a <= 1-year posted-date window. Walk recent windows only when needed.
  let attempts = 0;
  let durationMs = 0;
  for (let yearOffset = 0; yearOffset < 4; yearOffset += 1) {
    const postedTo = new Date();
    postedTo.setUTCFullYear(postedTo.getUTCFullYear() - yearOffset);
    const postedFrom = new Date(postedTo);
    postedFrom.setUTCFullYear(postedFrom.getUTCFullYear() - 1);
    const params = new URLSearchParams(baseParams);
    params.set('postedFrom', mmddyyyy(postedFrom));
    params.set('postedTo', mmddyyyy(postedTo));
    const response = await fetchJsonWithRetry<unknown>(`https://api.sam.gov/prod/opportunities/v2/search?${params}`, { headers: { Accept: 'application/json' } }, { timeoutMs: 15_000, maxAttempts: 2 });
    attempts += response.attempts;
    durationMs += response.durationMs;
    const parsed = responseSchema.parse(response.data);
    const exact = exactMatches(parsed, reference);
    if (exact.length) return { opportunity: exact[0], durationMs, attempts };
  }
  return { opportunity: undefined, durationMs, attempts };
}

function metadataFromOpportunity(opportunity: SamOpportunity): SamOpportunityMetadata {
  return {
    noticeId: opportunity.noticeId || undefined,
    title: opportunity.title || undefined,
    solicitationNumber: opportunity.solicitationNumber || undefined,
    agency: opportunity.subTier || opportunity.department || opportunity.fullParentPathName || undefined,
    department: opportunity.department || undefined,
    subTier: opportunity.subTier || undefined,
    office: opportunity.office || undefined,
    postedDate: opportunity.postedDate || undefined,
    responseDeadline: opportunity.responseDeadLine || undefined,
    noticeType: opportunity.type || undefined,
    setAside: opportunity.typeOfSetAsideDescription || undefined,
    naics: opportunity.naicsCode || undefined,
    psc: opportunity.classificationCode || undefined,
    descriptionUrl: publicUrl(opportunity.description),
    uiUrl: opportunity.noticeId ? `https://sam.gov/opp/${opportunity.noticeId}/view` : publicUrl(opportunity.uiLink),
  };
}

function noticeEvidence(opportunity: SamOpportunity, retrievedAt: string): EvidenceItem {
  const details = [
    opportunity.solicitationNumber ? `solicitation ${opportunity.solicitationNumber}` : '',
    opportunity.naicsCode ? `NAICS ${opportunity.naicsCode}` : '',
    opportunity.typeOfSetAsideDescription || '',
  ].filter(Boolean).join(' · ');
  return {
    id: `SAM-${opportunity.noticeId || opportunity.solicitationNumber || 'NOTICE'}`,
    type: 'EXTERNAL_SOURCE',
    sourceLabel: 'SAM.gov Opportunities API',
    sourceRecordId: opportunity.noticeId || opportunity.solicitationNumber || undefined,
    claim: `SAM notice: ${opportunity.title || 'Untitled opportunity'}${details ? ` — ${details}` : ''}.`,
    confidence: 98,
    retrievedAt,
    url: opportunity.noticeId ? `https://sam.gov/opp/${opportunity.noticeId}/view` : 'https://sam.gov/opportunities',
  };
}

async function downloadResource(
  rawLink: string | z.infer<typeof resourceLinkSchema>,
  apiKey: string,
  uploadedFiles: string[],
  remainingBytes: number,
): Promise<{ document: SamDocumentStatus; file?: SamRetrievedFile }> {
  const link = typeof rawLink === 'string' ? rawLink : rawLink.link || '';
  const initialName = typeof rawLink === 'string' ? filenameFromUrl(rawLink) : rawLink.name || filenameFromUrl(link);
  const type = typeof rawLink === 'string' ? 'document' : rawLink.type || 'document';
  const safeUrl = publicUrl(link) || '#';
  if (!link || !/^https?:\/\//i.test(link)) {
    return { document: { name: initialName, url: safeUrl, provided: false, type, retrievalStatus: 'FAILED', message: 'SAM did not provide a downloadable URL.' } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(withApiKey(link, apiKey), { headers: { Accept: '*/*' }, redirect: 'follow', signal: controller.signal });
    if (!response.ok) {
      return { document: { name: initialName, url: safeUrl, provided: false, type, retrievalStatus: response.status === 401 || response.status === 403 ? 'RESTRICTED' : 'FAILED', message: `Download returned HTTP ${response.status}.` } };
    }
    const name = filenameFromDisposition(response.headers.get('content-disposition')) || initialName;
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (isProvided(name, uploadedFiles)) {
      return { document: { name, url: safeUrl, provided: true, type, retrievalStatus: 'PROVIDED', sizeBytes: declaredSize || undefined } };
    }
    if (declaredSize > maxAutoFileBytes || declaredSize > remainingBytes) {
      return { document: { name, url: safeUrl, provided: false, type, retrievalStatus: 'TOO_LARGE', sizeBytes: declaredSize || undefined, message: 'Document exceeds the automatic retrieval size budget.' } };
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxAutoFileBytes || buffer.length > remainingBytes) {
      return { document: { name, url: safeUrl, provided: false, type, retrievalStatus: 'TOO_LARGE', sizeBytes: buffer.length, message: 'Document exceeds the automatic retrieval size budget.' } };
    }
    const mime = inferMime(name, response.headers.get('content-type'));
    if (!isSupportedMime(mime)) {
      return { document: { name, url: safeUrl, provided: false, type, retrievalStatus: 'UNSUPPORTED', sizeBytes: buffer.length, message: `Unsupported document type (${mime}).` } };
    }
    return {
      document: { name, url: safeUrl, provided: false, type, retrievalStatus: 'RETRIEVED', sizeBytes: buffer.length, mimeType: mime },
      file: { originalname: name, mimetype: mime, size: buffer.length, buffer, sourceUrl: safeUrl },
    };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Download timed out.' : (error instanceof Error ? error.message : 'Download failed.');
    return { document: { name: initialName, url: safeUrl, provided: false, type, retrievalStatus: 'FAILED', message } };
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function retrieveDescription(opportunity: SamOpportunity, apiKey: string, remainingBytes: number) {
  if (!opportunity.description || remainingBytes <= 0) return undefined;
  const safeUrl = publicUrl(opportunity.description) || opportunity.description;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(withApiKey(opportunity.description, apiKey), { headers: { Accept: 'text/html,text/plain,*/*' }, signal: controller.signal });
    if (!response.ok) return undefined;
    const text = stripHtml(await response.text());
    if (!text) return undefined;
    const buffer = Buffer.from(text.slice(0, Math.min(text.length, remainingBytes)), 'utf8');
    return {
      document: { name: 'SAM Opportunity Description.txt', url: safeUrl, provided: false, type: 'description', retrievalStatus: 'RETRIEVED' as const, sizeBytes: buffer.length, mimeType: 'text/plain' },
      file: { originalname: 'SAM Opportunity Description.txt', mimetype: 'text/plain', size: buffer.length, buffer, sourceUrl: safeUrl },
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveSamOpportunityPackage(referenceValue: string, uploadedFiles: string[] = []): Promise<SamOpportunityPackage> {
  const apiKey = process.env.SAM_API_KEY;
  if (!apiKey) throw new Error('SAM_API_KEY is not configured for this deployment.');
  const retrievedAt = new Date().toISOString();
  const found = await findOpportunity(referenceValue, apiKey);
  if (!found.opportunity) throw new Error('No exact SAM.gov opportunity matched that solicitation number or URL.');

  const documents: SamDocumentStatus[] = [];
  const files: SamRetrievedFile[] = [];
  let usedBytes = 0;
  const description = await retrieveDescription(found.opportunity, apiKey, maxAutoPackageBytes - usedBytes);
  if (description) {
    documents.push(description.document);
    files.push(description.file);
    usedBytes += description.file.size;
  }

  const links = (found.opportunity.resourceLinks || []).slice(0, maxAutoFiles);
  for (const link of links) {
    const retrieved = await downloadResource(link, apiKey, uploadedFiles, maxAutoPackageBytes - usedBytes);
    documents.push(retrieved.document);
    if (retrieved.file) {
      files.push(retrieved.file);
      usedBytes += retrieved.file.size;
    }
  }
  if ((found.opportunity.resourceLinks || []).length > links.length) {
    documents.push({
      name: `${(found.opportunity.resourceLinks || []).length - links.length} additional SAM document(s)`,
      url: found.opportunity.noticeId ? `https://sam.gov/opp/${found.opportunity.noticeId}/view` : 'https://sam.gov/opportunities',
      provided: false,
      type: 'document',
      retrievalStatus: 'SKIPPED',
      message: `Automatic intake is limited to ${maxAutoFiles} SAM attachments per run.`,
    });
  }

  const retrievedCount = documents.filter((item) => item.retrievalStatus === 'RETRIEVED').length;
  const providedCount = documents.filter((item) => item.retrievalStatus === 'PROVIDED').length;
  const unresolvedCount = documents.filter((item) => !['RETRIEVED', 'PROVIDED'].includes(item.retrievalStatus || '')).length;
  const message = `Official package: ${retrievedCount} SAM document(s) retrieved for analysis${providedCount ? `, ${providedCount} already provided by the analyst` : ''}${unresolvedCount ? `, ${unresolvedCount} unresolved` : ''}.`;
  const evidence = [noticeEvidence(found.opportunity, retrievedAt)];
  const adapterResult: AdapterResult = {
    name: 'SAM.gov',
    success: true,
    status: 'SUCCESS',
    recordsFound: 1,
    evidence,
    message,
    durationMs: found.durationMs,
    attempts: found.attempts || 1,
    retrievedAt,
    querySummary: `exact opportunity: ${found.opportunity.solicitationNumber || found.opportunity.noticeId}`,
    samDocuments: documents,
  };
  return { opportunity: metadataFromOpportunity(found.opportunity), files, adapterResult };
}

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
    if (!deal.solicitationNumber?.trim()) {
      return {
        name: 'SAM.gov', success: true, status: 'ZERO_RESULTS', recordsFound: 0, evidence: [],
        message: 'No solicitation number was available for an exact SAM.gov lookup.', durationMs: 0, attempts: 0, retrievedAt, querySummary,
      };
    }
    const found = await findOpportunity(deal.solicitationNumber, apiKey);
    if (!found.opportunity) {
      return {
        name: 'SAM.gov', success: true, status: 'ZERO_RESULTS', recordsFound: 0, evidence: [],
        message: 'SAM.gov responded successfully but no exact notice matched the solicitation number.', durationMs: found.durationMs, attempts: found.attempts || 1, retrievedAt, querySummary,
      };
    }
    const samDocuments: SamDocumentStatus[] = (found.opportunity.resourceLinks || []).map((link) => {
      const rawUrl = typeof link === 'string' ? link : link.link || '#';
      const name = typeof link === 'string' ? filenameFromUrl(link) : link.name || filenameFromUrl(rawUrl);
      return {
        name,
        url: publicUrl(rawUrl) || '#',
        type: typeof link === 'string' ? 'document' : link.type || 'document',
        provided: isProvided(name, uploadedFiles),
        retrievalStatus: isProvided(name, uploadedFiles) ? 'PROVIDED' : 'DISCOVERED',
      };
    });
    return {
      name: 'SAM.gov', success: true, status: 'SUCCESS', recordsFound: 1,
      evidence: [noticeEvidence(found.opportunity, retrievedAt)],
      message: samDocuments.length ? `${samDocuments.length} official attachment link(s) discovered on the exact SAM.gov notice.` : 'Exact SAM.gov notice found; no attachment links were returned by the public API.',
      durationMs: found.durationMs, attempts: found.attempts || 1, retrievedAt, querySummary,
      samDocuments: samDocuments.length ? samDocuments : undefined,
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
