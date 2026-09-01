import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import ExcelJS from 'exceljs';
import type {
  AiAnalysisDraft,
  ConnectorStatus,
  DecisionNarrative,
  EvidenceItem,
  OpportunityAnalysis,
} from './src/types.js';
import { querySamGov, resolveSamOpportunityPackage, type SamOpportunityMetadata, type SamRetrievedFile } from './src/adapters/sam.js';
import { queryUSASpending } from './src/adapters/usaspending.js';
import { queryGsaCalc } from './src/adapters/gsa.js';
import { queryBls } from './src/adapters/bls.js';
import type { AdapterResult } from './src/adapters/types.js';
import { calculateDeterministicScenarios } from './src/domain/marketPosition/scenarioEngine.js';
import { MARKET_POSITION_ENGINE_VERSION } from './src/domain/marketPosition/engineConfig.js';
import { classifyNumericEvidence } from './src/domain/marketPosition/evidenceClassification.js';
import { createExecutivePdf } from './src/exports/executivePdf.js';
import {
  createLegacyPosition,
  enforceAuthoritativeAnalysis,
  isCurrentEngine,
  marketAssessmentFromPosition,
  sanitizeMarketAssessment,
  sanitizeNarrative,
} from './src/domain/marketPosition/authoritative.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 10 },
});

type AnalysisFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

app.use(express.json({ limit: '5mb' }));

function aiClient() {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  return new GoogleGenAI({ apiKey });
}

function parseJson(text?: string) {
  if (!text) throw new Error('The AI returned an empty response.');
  const cleaned = text.replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI response was not valid JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const stringArray = { type: 'ARRAY', items: { type: 'STRING' } };
const numericEvidenceSchema = {
  type: 'OBJECT',
  properties: {
    originalValue: { type: 'NUMBER' },
    valueType: { type: 'STRING' },
    currency: { type: 'STRING' },
    units: { type: 'STRING' },
    periodMonths: { type: 'NUMBER' },
    baseYear: { type: 'NUMBER' },
    quantity: { type: 'NUMBER' },
    targetQuantity: { type: 'NUMBER' },
    sourceDate: { type: 'STRING' },
    endDate: { type: 'STRING' },
    agency: { type: 'STRING' },
    naics: { type: 'STRING' },
    psc: { type: 'STRING' },
    contractType: { type: 'STRING' },
    acquisitionStructure: { type: 'STRING' },
    scopeText: { type: 'STRING' },
    laborIntensity: { type: 'STRING' },
    technologySecurityLocation: { type: 'STRING' },
    opportunitySpecific: { type: 'BOOLEAN' },
    recurringService: { type: 'BOOLEAN' },
    scalableByQuantity: { type: 'BOOLEAN' },
    sharedAcrossAwards: { type: 'BOOLEAN' },
    valueBasis: { type: 'STRING' },
    rangeBound: { type: 'STRING' },
    rangeId: { type: 'STRING' },
  },
  required: ['originalValue', 'valueType', 'currency', 'units', 'valueBasis'],
};

const driverSchema = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      name: { type: 'STRING' },
      assessment: { type: 'STRING' },
      evidenceIds: stringArray,
      inference: { type: 'BOOLEAN' },
    },
    required: ['name', 'assessment', 'evidenceIds', 'inference'],
  },
};

const narrativeSchema = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    rationale: { type: 'STRING' },
    decisionFactors: stringArray,
    guardrails: stringArray,
    nextActions: stringArray,
  },
  required: ['headline', 'rationale', 'decisionFactors', 'guardrails', 'nextActions'],
};

const baseSchema = {
  type: 'OBJECT',
  properties: {
    deal: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' },
        agency: { type: 'STRING' },
        solicitationNumber: { type: 'STRING' },
        contractType: { type: 'STRING' },
        dueDate: { type: 'STRING' },
        periodOfPerformance: { type: 'STRING' },
        naics: { type: 'STRING' },
        psc: { type: 'STRING' },
        awardStructure: { type: 'STRING' },
        evaluationMethod: { type: 'STRING' },
        scopeSummary: { type: 'STRING' },
        facts: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING' }, value: { type: 'STRING' }, section: { type: 'STRING' }, confidence: { type: 'NUMBER' },
            },
            required: ['label', 'value', 'confidence'],
          },
        },
        requirements: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' }, detail: { type: 'STRING' }, category: { type: 'STRING' },
              section: { type: 'STRING' }, confidence: { type: 'NUMBER' },
            },
            required: ['name', 'detail', 'category', 'confidence'],
          },
        },
        laborSignals: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              title: { type: 'STRING' }, quantity: { type: 'NUMBER' }, annualHours: { type: 'NUMBER' },
              location: { type: 'STRING' }, clearance: { type: 'STRING' }, section: { type: 'STRING' },
            },
            required: ['title'],
          },
        },
        pricingSignals: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              signal: { type: 'STRING' }, implication: { type: 'STRING' }, section: { type: 'STRING' }, confidence: { type: 'NUMBER' },
            },
            required: ['signal', 'implication', 'confidence'],
          },
        },
      },
      required: [
        'title', 'agency', 'solicitationNumber', 'contractType', 'dueDate', 'periodOfPerformance',
        'naics', 'awardStructure', 'evaluationMethod', 'scopeSummary', 'facts', 'requirements',
        'laborSignals', 'pricingSignals',
      ],
    },
    marketAssessment: {
      type: 'OBJECT',
      properties: {
        posture: { type: 'STRING' },
        summary: { type: 'STRING' },
        basis: stringArray,
        drivers: driverSchema,
      },
      required: ['posture', 'summary', 'basis', 'drivers'],
    },
    competitors: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' }, role: { type: 'STRING' }, pricingPosture: { type: 'STRING' },
          rationale: { type: 'STRING' }, differentiators: stringArray, risks: stringArray, sourceRefs: stringArray,
          confidence: { type: 'NUMBER' }, evidenceType: { type: 'STRING' }, demonstratedCapabilities: stringArray,
          deliveryModel: { type: 'STRING' }, techPlatform: { type: 'STRING' }, laborShape: { type: 'STRING' },
          partnerEcosystem: stringArray, vehicleAccess: stringArray, incumbentAdvantage: { type: 'STRING' },
          automationClaims: stringArray, costDrivers: stringArray, unknowns: stringArray,
        },
        required: ['name', 'role', 'pricingPosture', 'rationale', 'differentiators', 'risks', 'sourceRefs', 'confidence', 'evidenceType'],
      },
    },
    incumbent: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' }, status: { type: 'STRING' }, strengths: stringArray, vulnerabilities: stringArray,
        transitionRisk: { type: 'STRING' }, confidence: { type: 'NUMBER' }, sourceRefs: stringArray,
      },
      required: ['name', 'status', 'strengths', 'vulnerabilities', 'transitionRisk', 'confidence', 'sourceRefs'],
    },
    evidence: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' }, type: { type: 'STRING' }, sourceLabel: { type: 'STRING' }, section: { type: 'STRING' },
          claim: { type: 'STRING' }, excerpt: { type: 'STRING' }, confidence: { type: 'NUMBER' },
          numeric: numericEvidenceSchema,
        },
        required: ['id', 'type', 'sourceLabel', 'claim', 'confidence'],
      },
    },
    gaps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' }, impact: { type: 'STRING' }, priority: { type: 'STRING' },
        },
        required: ['question', 'impact', 'priority'],
      },
    },
    affordability: {
      type: 'OBJECT',
      properties: {
        estimatedCeiling: { type: 'NUMBER' }, budgetSignals: stringArray, obligationsHistory: { type: 'STRING' },
        fundingAvailability: { type: 'STRING' }, confidence: { type: 'STRING' }, evidenceIds: stringArray,
      },
      required: ['budgetSignals', 'fundingAvailability', 'confidence'],
    },
    gaoFindings: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' }, implication: { type: 'STRING' }, sourceUrl: { type: 'STRING' },
          relevanceScore: { type: 'NUMBER' }, evidenceIds: stringArray,
        },
        required: ['topic', 'implication', 'relevanceScore'],
      },
    },
    preRfpSignals: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING' }, date: { type: 'STRING' }, summary: { type: 'STRING' },
          impact: { type: 'STRING' }, evidenceIds: stringArray,
        },
        required: ['type', 'date', 'summary', 'impact'],
      },
    },
    narrative: narrativeSchema,
  },
  required: ['deal', 'marketAssessment', 'competitors', 'incumbent', 'evidence', 'gaps', 'narrative'],
};

const analysisPrompt = `You are a federal capture and competitive-pricing analyst. Analyze the attached solicitation and return a concise evidence-led market assessment.

NON-NEGOTIABLE AUTHORITY RULES
- Do not calculate or recommend Aggressive, Expected, Conservative, low, target, high, or any other Market Position dollar value.
- Do not put dollar values in the narrative. The deterministic engine owns every authoritative Market Position number.
- Extract a numeric evidence object only when the document explicitly states the value. Preserve its section and excerpt.
- Keep evaluated price, estimated value, ceiling, initial obligation, current obligations, eventual spend, total award value, hourly ceiling rate, escalation rate, and budget context distinct.
- CRITICAL: If a value represents the total deal or contract size, you MUST use valueType 'ESTIMATED_VALUE', 'TOTAL_AWARD_VALUE', or 'EVALUATED_PRICE', and YOU MUST set units exactly to 'TOTAL_USD'.
- Classify the measurement basis using valueBasis exactly from: OPPORTUNITY_TOTAL, INDIVIDUAL_AWARD, PROGRAM_TOTAL, MULTIPLE_AWARD_POOL, ORDER_LIMIT, PAST_PERFORMANCE_THRESHOLD, BUDGET, UNKNOWN.
- Program-wide funding, portfolio funding, annual funding, and multiple-award pools are context, not the expected value of one award.
- Minimum/maximum order limitations and past-performance eligibility thresholds are not Market Position anchors.
- For a stated individual-award range, return the low and high values as separate evidence items with the same rangeId and rangeBound LOW or HIGH.
- Use valueType values exactly from: EVALUATED_PRICE, ESTIMATED_VALUE, TOTAL_AWARD_VALUE, CURRENT_AWARD_AMOUNT, CONTRACT_CEILING, INITIAL_OBLIGATION, CURRENT_OBLIGATIONS, EVENTUAL_SPEND, HOURLY_CEILING_RATE, ESCALATION_RATE, BUDGET_CONTEXT, UNKNOWN.
- Use units TOTAL_USD, USD_PER_HOUR, PERCENT, or OTHER. Do not convert unlike units.
- Set opportunitySpecific true only for a value that describes this solicitation.
- Set recurringService, scalableByQuantity, or sharedAcrossAwards true only when the document supports it.
- Never invent an incumbent, competitor, amount, staffing level, source, normalization factor, or evidence ID.
- Extract every explicitly stated labor category, quantity/headcount, annual hours, CLIN quantity, and performance period needed for a bottom-up model. Leave quantity or annualHours absent when the source does not state it.
- Preserve predecessor contract numbers, incumbent names, program names, acronyms, task-order identifiers, and vehicle identifiers as deal facts so official award searches can use them.
- Do not create numeric evidence for dates, page numbers, proposal-validity days, or periods of performance. Keep those as deal facts.
- SOLICITATION_FACT requires a document citation. Label deductions ANALYST_INFERENCE.
- Confidence values are 0-100, but do not create an opportunity score or probability of win.
- Do not claim public-source research was performed during this extraction pass.
- When a file named SAM Opportunity Metadata.txt is present, treat its notice ID, solicitation number, agency, NAICS, PSC, response deadline, set-aside, and notice type as authoritative SAM.gov facts.

PRODUCT TASK
1. Extract deal, evaluation, staffing, pricing, acquisition, predecessor, and program-identifier facts.
2. Build an evidence ledger, including explicit numeric evidence with correct value types.
3. Identify gaps that affect comparability or normalization.
4. Produce qualitative competitor and incumbent reconstruction with fact/inference separation.
5. Produce marketAssessment and narrative fields that explain conditions, guardrails, and next actions without authoritative dollar values.

Use concise language suitable for a federal pricing lead.`;

const sourceNames: ConnectorStatus['name'][] = ['SAM.gov', 'USAspending', 'GSA CALC+', 'BLS'];
const connectorCache = new Map<string, { expiresAt: number; result: AdapterResult }>();
const connectorCacheTtlMs = 15 * 60 * 1000;
const blockedResearchHosts = [
  'facebook.com', 'wikipedia.org', 'fool.com', 'marketsandmarkets.com', 'mordorintelligence.com',
  'govtribe.com', 'highergov.com', 'govoppintel.com', 'orangeslices.ai',
];

function usableResearchUrl(value?: string) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    return !blockedResearchHosts.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

function connectorCacheKey(name: ConnectorStatus['name'], deal: OpportunityAnalysis['deal']) {
  const labor = deal.laborSignals?.map((item) => item.title).filter(Boolean).slice(0, 5) || [];
  return JSON.stringify([name, deal.agency, deal.naics, deal.solicitationNumber, deal.title, labor]);
}

async function runConnectorSet(deal: OpportunityAnalysis['deal'], only?: ConnectorStatus['name'], force = false, fileNames: string[] = []) {
  const tasks: Record<ConnectorStatus['name'], () => Promise<AdapterResult>> = {
    'SAM.gov': () => querySamGov(deal, fileNames),
    USAspending: () => queryUSASpending(deal),
    'GSA CALC+': () => queryGsaCalc(deal.laborSignals || []),
    BLS: () => queryBls(),
  };
  const selected = only ? [only] : sourceNames;
  const settled = await Promise.allSettled(selected.map(async (name) => {
    const key = connectorCacheKey(name, deal);
    const cached = connectorCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, status: 'CACHED' as const, message: cached.result.message || 'Preserved cached result used.' };
    }
    const result = await tasks[name]();
    if (result.success) connectorCache.set(key, { expiresAt: Date.now() + connectorCacheTtlMs, result });
    return result;
  }));
  return settled.map((result, index): AdapterResult => {
    if (result.status === 'fulfilled') return result.value;
    return {
      name: selected[index], success: false, status: 'ERROR', recordsFound: 0, evidence: [],
      message: result.reason instanceof Error ? result.reason.message : String(result.reason), durationMs: 0, attempts: 1,
      retrievedAt: new Date().toISOString(), querySummary: 'Connector failed before the request completed.',
    };
  });
}

function connectorStatus(result: AdapterResult): ConnectorStatus {
  return {
    name: result.name,
    status: result.status,
    recordsFound: result.recordsFound,
    message: result.message,
    durationMs: result.durationMs,
    attempts: result.attempts,
    retrievedAt: result.retrievedAt,
    querySummary: result.querySummary,
    samDocuments: result.samDocuments,
  };
}

function mergeEvidence(existing: EvidenceItem[] = [], incoming: EvidenceItem[] = []) {
  const merged = new Map((existing || []).filter(Boolean).map((item) => [item.id, item]));
  for (const item of (incoming || []).filter(Boolean)) merged.set(item.id, item);
  return [...merged.values()];
}

function samMetadataFile(metadata: SamOpportunityMetadata, naicsOverride?: string): AnalysisFile {
  const content = [
    'OFFICIAL SAM.GOV OPPORTUNITY METADATA',
    `Notice ID: ${metadata.noticeId || ''}`,
    `Title: ${metadata.title || ''}`,
    `Solicitation Number: ${metadata.solicitationNumber || ''}`,
    `Agency: ${metadata.agency || ''}`,
    `Department: ${metadata.department || ''}`,
    `Sub-Tier: ${metadata.subTier || ''}`,
    `Office: ${metadata.office || ''}`,
    `NAICS: ${metadata.naics || naicsOverride || ''}`,
    `PSC / Classification: ${metadata.psc || ''}`,
    `Notice Type: ${metadata.noticeType || ''}`,
    `Set-Aside: ${metadata.setAside || ''}`,
    `Posted Date: ${metadata.postedDate || ''}`,
    `Response Deadline: ${metadata.responseDeadline || ''}`,
    `SAM Opportunity URL: ${metadata.uiUrl || ''}`,
  ].join('\n');
  const buffer = Buffer.from(content, 'utf8');
  return { originalname: 'SAM Opportunity Metadata.txt', mimetype: 'text/plain', size: buffer.length, buffer };
}

function autoFile(file: SamRetrievedFile): AnalysisFile {
  return { originalname: file.originalname, mimetype: file.mimetype, size: file.size, buffer: file.buffer };
}

async function normalizeSpreadsheet(file: AnalysisFile): Promise<AnalysisFile> {
  const isXlsx = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.originalname.toLowerCase().endsWith('.xlsx');
  if (!isXlsx) return file;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer as never);
  const lines: string[] = [`SOURCE SPREADSHEET: ${file.originalname}`];
  workbook.eachSheet((worksheet) => {
    lines.push(`\nSHEET: ${worksheet.name}`);
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const rendered = values.map((value) => {
        if (value == null) return '';
        if (typeof value === 'object') {
          const record = value as unknown as Record<string, unknown>;
          if ('text' in record) return String(record.text || '');
          if ('result' in record) return String(record.result || '');
          try { return JSON.stringify(value); } catch { return String(value); }
        }
        return String(value);
      }).join('\t');
      if (rendered.trim()) lines.push(rendered);
    });
  });
  const buffer = Buffer.from(lines.join('\n'), 'utf8');
  return { originalname: `${file.originalname}.txt`, mimetype: 'text/plain', size: buffer.length, buffer };
}

async function normalizeAnalysisFiles(files: AnalysisFile[]) {
  return Promise.all(files.map((file) => normalizeSpreadsheet(file)));
}

function mergeSamDealMetadata(analysis: OpportunityAnalysis, metadata: SamOpportunityMetadata, naicsOverride?: string) {
  analysis.deal = {
    ...analysis.deal,
    title: metadata.title || analysis.deal.title,
    agency: metadata.agency || analysis.deal.agency,
    solicitationNumber: metadata.solicitationNumber || analysis.deal.solicitationNumber,
    dueDate: metadata.responseDeadline || analysis.deal.dueDate,
    naics: metadata.naics || naicsOverride || analysis.deal.naics,
    psc: metadata.psc || analysis.deal.psc,
  };
}

function recalculateForOfficialDealMetadata(analysis: OpportunityAnalysis) {
  const draft: AiAnalysisDraft = {
    deal: analysis.deal,
    marketAssessment: marketAssessmentFromPosition(analysis.marketPosition),
    competitors: analysis.competitors,
    incumbent: analysis.incumbent,
    evidence: analysis.evidence,
    gaps: analysis.gaps,
    narrative: analysis.narrative,
    affordability: analysis.affordability,
    gaoFindings: analysis.gaoFindings,
    preRfpSignals: analysis.preRfpSignals,
  };
  analysis.marketPosition = calculateDeterministicScenarios(draft, { asOfDate: analysis.meta.analyzedAt });
}

async function synthesizeOfficialEvidence(draft: AiAnalysisDraft) {
  const official = draft.evidence.filter((item) => item.type === 'EXTERNAL_SOURCE' && /API/.test(item.sourceLabel));
  if (official.length === 0) return;
  const response = await aiClient().models.generateContent({
    model,
    contents: `Update only the qualitative interpretation using the validated official evidence below.
Return JSON with keys marketAssessment, competitors, incumbent, and narrative. Preserve their existing shapes and evidence IDs.
Never return a Market Position dollar value, numeric range, opportunity score, or probability of win.
Treat award amounts, ceilings, obligations, hourly ceiling rates, and escalation percentages as different measurements.
Do not put dollar values in narrative strings.

CURRENT QUALITATIVE ANALYSIS:
${JSON.stringify({
  marketAssessment: draft.marketAssessment,
  competitors: draft.competitors,
  incumbent: draft.incumbent,
  narrative: draft.narrative,
})}

OFFICIAL EVIDENCE:
${JSON.stringify(official)}`,
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  const synthesis = parseJson(response.text);
  draft.marketAssessment = sanitizeMarketAssessment(synthesis.marketAssessment || draft.marketAssessment);
  draft.competitors = synthesis.competitors || draft.competitors;
  draft.incumbent = synthesis.incumbent || draft.incumbent;
  draft.narrative = sanitizeNarrative(synthesis.narrative || draft.narrative);
}

async function analyzeFiles(files: AnalysisFile[]): Promise<OpportunityAnalysis> {
  const client = aiClient();
  const inlineDataParts = files.map(file => ({
    inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype || 'application/octet-stream' }
  }));
  const response = await client.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        { text: analysisPrompt },
        ...inlineDataParts,
      ],
    }],
    config: { responseMimeType: 'application/json', responseSchema: baseSchema as never, temperature: 0.15 },
  });
  const draft = parseJson(response.text) as AiAnalysisDraft;
  draft.evidence = draft.evidence || [];
  classifyNumericEvidence(draft.evidence);
  draft.gaps = draft.gaps || [];
  draft.marketAssessment = sanitizeMarketAssessment(draft.marketAssessment);
  draft.narrative = sanitizeNarrative(draft.narrative);
  const warnings: string[] = [];
  let researchStatus: OpportunityAnalysis['meta']['researchStatus'] = 'SOLICITATION_ONLY';
  const connectors: ConnectorStatus[] = [];

  const fileNames = files.map(f => f.originalname);
  const connectorWork = runConnectorSet(draft.deal, undefined, false, fileNames);
  const researchWork = process.env.ENABLE_GOOGLE_SEARCH !== 'false'
    ? client.models.generateContent({
      model,
      contents: `Research the public federal market for this opportunity using Google Search.
Return JSON with keys marketAssessment, competitors, incumbent, and narrative only.
Improve only qualitative claims supported by current public sources and preserve the existing shapes.
Never return or revise an authoritative Market Position dollar value, numeric range, opportunity score, or probability of win.
Do not put dollar values in narrative strings. Put source URLs in competitor and incumbent sourceRefs.
Prefer official .gov/.mil records and first-party company sources. Do not rely on Wikipedia, social media, market-size aggregators, procurement aggregators, or search-result snippets.

BASE ANALYSIS:
${JSON.stringify(draft)}`,
      config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
    })
    : Promise.resolve(null);

  const [connectorOutcome, researchOutcome] = await Promise.allSettled([connectorWork, researchWork]);

  if (connectorOutcome.status === 'fulfilled') {
    const results = connectorOutcome.value;
    for (const result of results) {
      connectors.push(connectorStatus(result));
      draft.evidence = mergeEvidence(draft.evidence, result.evidence);
    }
    if (results.some((result) => result.success && result.recordsFound > 0)) {
      researchStatus = 'PARTIAL';
    }
  } else {
    warnings.push(`Government API adapters failed to run: ${connectorOutcome.reason instanceof Error ? connectorOutcome.reason.message : String(connectorOutcome.reason)}`);
  }

  if (researchOutcome.status === 'fulfilled' && researchOutcome.value) {
    try {
      const researchResponse = researchOutcome.value;
      const research = parseJson(researchResponse.text);
      draft.marketAssessment = sanitizeMarketAssessment(research.marketAssessment || draft.marketAssessment);
      draft.competitors = research.competitors || draft.competitors;
      draft.incumbent = research.incumbent || draft.incumbent;
      draft.narrative = sanitizeNarrative(research.narrative || draft.narrative);
      const chunks = researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: EvidenceItem[] = chunks.flatMap((chunk: any, index: number) => usableResearchUrl(chunk.web?.uri) ? [{
        id: `EXT-${index + 1}`,
        type: 'EXTERNAL_SOURCE' as const,
        sourceLabel: chunk.web.title || `External source ${index + 1}`,
        claim: 'Public market source used during grounded qualitative enrichment.',
        url: chunk.web.uri,
        confidence: 80,
        retrievedAt: new Date().toISOString(),
      }] : []);
      draft.evidence = mergeEvidence(draft.evidence, sources);
      researchStatus = sources.length ? 'GROUNDED' : researchStatus;
    } catch (error) {
      warnings.push(`Public-market enrichment was unavailable; the brief remains solicitation and official-adapter grounded. ${error instanceof Error ? error.message : ''}`.trim());
    }
  } else if (researchOutcome.status === 'rejected') {
    warnings.push(`Public-market enrichment was unavailable; the brief remains solicitation and official-adapter grounded. ${researchOutcome.reason instanceof Error ? researchOutcome.reason.message : ''}`.trim());
    if (researchStatus === 'SOLICITATION_ONLY') {
      researchStatus = connectors.some((connector) => connector.status === 'SUCCESS') ? 'PARTIAL' : 'SOLICITATION_ONLY';
    }
  }

  const analyzedAt = new Date().toISOString();
  const marketPosition = calculateDeterministicScenarios(draft, { asOfDate: analyzedAt });
  const { marketAssessment: _marketAssessment, ...analysisFields } = draft;
  return {
    ...analysisFields,
    marketPosition,
    narrative: sanitizeNarrative(draft.narrative),
    id: `run-${crypto.randomUUID()}`,
    meta: { mode: 'MARKET_ONLY', model, analyzedAt, researchStatus, warnings, connectors },
  };
}

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  aiConfigured: Boolean(apiKey),
  model,
  calculationEngine: MARKET_POSITION_ENGINE_VERSION,
}));

let localRuns: OpportunityAnalysis[] = [];

function legacyNarrative(raw: any): DecisionNarrative {
  const narrative = raw?.narrative || raw?.guidance || {};
  return sanitizeNarrative({
    headline: narrative.headline || 'Legacy analysis',
    rationale: narrative.rationale || 'Recalculate this run under the current methodology.',
    decisionFactors: narrative.decisionFactors || narrative.winConditions || [],
    guardrails: narrative.guardrails || [],
    nextActions: narrative.nextActions || [],
  });
}

function normalizeIncomingRun(raw: any): OpportunityAnalysis {
  if (!raw?.id || !raw?.deal || !raw?.meta) throw new Error('A valid Opportunity Run is required.');
  if (!isCurrentEngine(raw.marketPosition)) {
    const migrated = enforceAuthoritativeAnalysis({
      ...raw,
      marketPosition: raw.marketPosition || createLegacyPosition(),
      narrative: legacyNarrative(raw),
      meta: {
        ...raw.meta,
        warnings: [...new Set(raw.meta.warnings || [])],
      },
    } as OpportunityAnalysis);
    return {
      ...migrated,
      meta: {
        ...migrated.meta,
        warnings: [...new Set([
          ...migrated.meta.warnings,
          `This saved run was recalculated under ${MARKET_POSITION_ENGINE_VERSION}.`,
        ])],
      },
    };
  }
  return enforceAuthoritativeAnalysis(raw as OpportunityAnalysis);
}

app.get('/api/runs', (_req, res) => {
  res.json({ data: localRuns });
});

app.post('/api/runs', (req, res) => {
  try {
    const run = normalizeIncomingRun(req.body);
    localRuns = [run, ...localRuns.filter((item) => item.id !== run.id)];
    res.json({ success: true, data: run });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Run could not be saved.' });
  }
});

app.delete('/api/runs/:id', (req, res) => {
  localRuns = localRuns.filter((run) => run.id !== req.params.id);
  res.json({ success: true });
});

app.post('/api/analyze-solicitation', upload.array('files'), async (req, res) => {
  try {
    if (!apiKey) return res.status(503).json({ error: 'GEMINI_API_KEY is not configured for this deployment.' });
    const uploadedFiles = ((req.files as Express.Multer.File[] | undefined) || []) as AnalysisFile[];
    const opportunityRef = String(req.body?.opportunityRef || '').trim();
    const naicsOverride = String(req.body?.naicsOverride || '').trim();
    if (naicsOverride && !/^\d{6}$/.test(naicsOverride)) return res.status(400).json({ error: 'NAICS override must be a 6-digit code.' });
    if (!opportunityRef && uploadedFiles.length === 0) return res.status(400).json({ error: 'Enter a solicitation number or SAM.gov URL, or upload a solicitation package.' });

    const allowed = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    for (const file of uploadedFiles) {
      if (!allowed.includes(file.mimetype)) {
        return res.status(415).json({ error: `File ${file.originalname} is not supported. Use a PDF, DOCX, DOC, TXT, or XLSX file.` });
      }
    }

    let samPackage: Awaited<ReturnType<typeof resolveSamOpportunityPackage>> | undefined;
    let samFallbackWarning = '';
    if (opportunityRef) {
      try {
        samPackage = await resolveSamOpportunityPackage(opportunityRef, uploadedFiles.map((file) => file.originalname));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'SAM.gov opportunity intake failed.';
        if (uploadedFiles.length === 0) return res.status(502).json({ error: `SAM-first intake could not continue: ${message}` });
        samFallbackWarning = `SAM-first intake was unavailable, so the run used the analyst-provided package. ${message}`;
      }
    }

    const packageFiles: AnalysisFile[] = samPackage
      ? [samMetadataFile(samPackage.opportunity, naicsOverride), ...samPackage.files.map(autoFile)]
      : [];
    const combined = [...uploadedFiles, ...packageFiles];
    const deduped = [...new Map(combined.map((file) => [file.originalname.trim().toLowerCase(), file])).values()];
    if (deduped.length === 0) return res.status(400).json({ error: 'No analyzable solicitation documents were available.' });
    const normalizedFiles = await normalizeAnalysisFiles(deduped);
    const analysis = await analyzeFiles(normalizedFiles);

    if (samFallbackWarning) analysis.meta.warnings.push(samFallbackWarning);
    if (samPackage) {
      mergeSamDealMetadata(analysis, samPackage.opportunity, naicsOverride);
      analysis.evidence = mergeEvidence(analysis.evidence, samPackage.adapterResult.evidence);
      analysis.meta.connectors = [
        connectorStatus(samPackage.adapterResult),
        ...(analysis.meta.connectors || []).filter((connector) => connector.name !== 'SAM.gov'),
      ].sort((a, b) => sourceNames.indexOf(a.name) - sourceNames.indexOf(b.name));
      const unresolved = (samPackage.adapterResult.samDocuments || []).filter((document) => !['RETRIEVED', 'PROVIDED'].includes(document.retrievalStatus || '')).length;
      if (unresolved > 0) {
        analysis.meta.warnings.push(`${unresolved} SAM.gov document(s) could not be automatically analyzed. Review the SAM source diagnostics for unresolved or restricted files.`);
      }
      recalculateForOfficialDealMetadata(analysis);
    }
    res.json({ data: analysis });
  } catch (error) {
    console.error('Analysis failed', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'The analysis could not be completed.' });
  }
});

app.post('/api/retry-connector', async (req, res) => {
  try {
    let analysis = req.body?.analysis as OpportunityAnalysis | undefined;
    const source = req.body?.source as ConnectorStatus['name'] | undefined;
    if (!analysis?.deal || !sourceNames.includes(source as ConnectorStatus['name'])) {
      return res.status(400).json({ error: 'A valid analysis and connector name are required.' });
    }
    const [result] = await runConnectorSet(analysis.deal, source, true);
    const sourceLabels: Record<ConnectorStatus['name'], string[]> = {
      'SAM.gov': ['SAM.gov Opportunities API'],
      USAspending: ['USAspending.gov API'],
      'GSA CALC+': ['GSA CALC+ API'],
      BLS: ['BLS Public Data API'],
    };
    analysis.evidence = mergeEvidence(
      analysis.evidence.filter((item) => !sourceLabels[source!].includes(item.sourceLabel)),
      result.evidence,
    );
    analysis.meta.connectors = [
      ...(analysis.meta.connectors || []).filter((connector) => connector.name !== source),
      connectorStatus(result),
    ].sort((a, b) => sourceNames.indexOf(a.name) - sourceNames.indexOf(b.name));
    analysis.meta.analyzedAt = new Date().toISOString();

    const draft: AiAnalysisDraft = {
      deal: analysis.deal,
      marketAssessment: marketAssessmentFromPosition(analysis.marketPosition),
      competitors: analysis.competitors,
      incumbent: analysis.incumbent,
      evidence: analysis.evidence,
      gaps: analysis.gaps,
      narrative: analysis.narrative,
      affordability: analysis.affordability,
      gaoFindings: analysis.gaoFindings,
      preRfpSignals: analysis.preRfpSignals,
    };
    if (result.recordsFound > 0) {
      try {
        await synthesizeOfficialEvidence(draft);
      } catch (error) {
        analysis.meta.warnings.push(`The ${source} evidence refreshed, but qualitative synthesis did not. ${error instanceof Error ? error.message : ''}`.trim());
      }
    }
    analysis = {
      ...analysis,
      competitors: draft.competitors,
      incumbent: draft.incumbent,
      narrative: sanitizeNarrative(draft.narrative),
      marketPosition: calculateDeterministicScenarios(draft, { asOfDate: analysis.meta.analyzedAt }),
    };
    res.json({ data: analysis });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'The connector could not be retried.' });
  }
});

const displayValue = (value: number | null) => value === null ? 'Insufficient evidence' : value;

app.post('/api/export-brief', async (req, res) => {
  try {
    const analysis = normalizeIncomingRun(req.body);
    if (!analysis.deal?.title) return res.status(400).json({ error: 'Analysis payload is required.' });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Federal Market Position';

    const summary = workbook.addWorksheet('Executive Decision');
    summary.columns = [{ header: 'Field', key: 'field', width: 34 }, { header: 'Value', key: 'value', width: 92 }];
    summary.addRows([
      { field: 'Opportunity', value: analysis.deal.title },
      { field: 'Agency', value: analysis.deal.agency },
      { field: 'Solicitation', value: analysis.deal.solicitationNumber },
      { field: 'Aggressive Market Position', value: displayValue(analysis.marketPosition.aggressive) },
      { field: 'Expected Market Position', value: displayValue(analysis.marketPosition.expected) },
      { field: 'Conservative Market Position', value: displayValue(analysis.marketPosition.conservative) },
      { field: 'Range Status', value: analysis.marketPosition.rangeStatus },
      { field: 'Estimation Method', value: analysis.marketPosition.methodLabel },
      { field: 'Confidence', value: analysis.marketPosition.confidence },
      { field: 'Public Benchmark Status', value: analysis.marketPosition.publicBenchmark.status },
      { field: 'Public Benchmark Expected', value: displayValue(analysis.marketPosition.publicBenchmark.expected) },
      { field: 'Evidence Readiness', value: `${analysis.marketPosition.evidenceReadiness.score}/100` },
      { field: 'Formula Version', value: analysis.marketPosition.formulaVersion },
      { field: 'Calculation Basis', value: analysis.marketPosition.methodLabel },
    ]);

    const methodology = workbook.addWorksheet('Calculation Methodology');
    const evidenceById = new Map(analysis.evidence.map((item) => [item.id, item]));
    methodology.columns = [
      { header: 'Evidence ID', key: 'evidenceId', width: 18 },
      { header: 'Source', key: 'source', width: 28 },
      { header: 'Value Type', key: 'valueType', width: 24 },
      { header: 'Role', key: 'role', width: 20 },
      { header: 'Original Value', key: 'originalValue', width: 18 },
      { header: 'Normalized Value', key: 'normalizedValue', width: 20 },
      { header: 'Comparability', key: 'comparability', width: 16 },
      { header: 'Evidence Quality', key: 'quality', width: 18 },
      { header: 'Normalization Confidence', key: 'normalization', width: 24 },
      { header: 'Weight', key: 'weight', width: 12 },
      { header: 'Used', key: 'used', width: 10 },
      { header: 'Rationale', key: 'rationale', width: 80 },
      { header: 'Underlying Claim', key: 'claim', width: 90 },
    ];
    methodology.addRows(analysis.marketPosition.anchors.map((anchor) => ({
      evidenceId: anchor.evidenceId,
      source: anchor.sourceLabel,
      valueType: anchor.valueType,
      role: anchor.role,
      originalValue: anchor.originalValue,
      normalizedValue: anchor.normalizedValue,
      comparability: Math.round(anchor.comparabilityScore * 100),
      quality: Math.round(anchor.evidenceQuality * 100),
      normalization: Math.round(anchor.normalizationConfidence * 100),
      weight: anchor.weight,
      used: anchor.included ? 'Yes' : 'No',
      rationale: anchor.included ? anchor.inclusionRationale : anchor.exclusionReasons.join(' '),
      claim: evidenceById.get(anchor.evidenceId)?.claim || '',
    })));

    const intelligence = workbook.addWorksheet('Intelligence');
    intelligence.columns = [{ header: 'Category', key: 'category', width: 24 }, { header: 'Finding', key: 'finding', width: 100 }];
    intelligence.addRow({ category: 'Market Assessment', finding: analysis.marketPosition.summary });
    intelligence.addRow({ category: 'Incumbent', finding: analysis.incumbent.name ? `${analysis.incumbent.name} — ${analysis.incumbent.status}; transition risk ${analysis.incumbent.transitionRisk}.` : 'No incumbent was verified.' });
    analysis.narrative.decisionFactors.forEach((finding) => intelligence.addRow({ category: 'Decision Factor', finding }));
    analysis.narrative.guardrails.forEach((finding) => intelligence.addRow({ category: 'Guardrail', finding }));
    analysis.narrative.nextActions.forEach((finding) => intelligence.addRow({ category: 'Next Action', finding }));
    analysis.gaps.forEach((gap) => intelligence.addRow({ category: `Gap — ${gap.priority}`, finding: `${gap.question} ${gap.impact}` }));
    if (analysis.affordability) {
      intelligence.addRow({ category: 'Affordability', finding: analysis.affordability.estimatedCeiling ? `Reported ceiling: ${analysis.affordability.estimatedCeiling}` : 'No reported ceiling.' });
      intelligence.addRow({ category: 'Budget Signals', finding: analysis.affordability.budgetSignals?.join('; ') });
    }
    analysis.gaoFindings?.forEach((finding) => intelligence.addRow({ category: 'GAO / Source Selection', finding: `${finding.topic} — ${finding.implication}` }));
    analysis.preRfpSignals?.forEach((signal) => intelligence.addRow({ category: 'Pre-RFP Signal', finding: `${signal.type}: ${signal.summary}` }));

    const competitors = workbook.addWorksheet('Competition');
    competitors.columns = [
      { header: 'Name', key: 'name', width: 25 }, { header: 'Role', key: 'role', width: 20 },
      { header: 'Capabilities', key: 'capabilities', width: 50 }, { header: 'Technology', key: 'technology', width: 30 },
      { header: 'Delivery Model', key: 'deliveryModel', width: 32 }, { header: 'Cost Drivers', key: 'costDrivers', width: 45 },
      { header: 'Risks / Unknowns', key: 'risks', width: 55 }, { header: 'Assessment', key: 'rationale', width: 80 },
      { header: 'Evidence Type', key: 'evidenceType', width: 22 }, { header: 'Confidence', key: 'confidence', width: 14 },
      { header: 'Sources', key: 'sources', width: 60 },
    ];
    analysis.competitors.forEach((competitor) => competitors.addRow({
      name: competitor.name,
      role: competitor.role,
      capabilities: (competitor.demonstratedCapabilities?.length ? competitor.demonstratedCapabilities : competitor.differentiators)?.join(', '),
      technology: competitor.techPlatform,
      deliveryModel: competitor.deliveryModel,
      costDrivers: competitor.costDrivers?.join(', '),
      risks: [...(competitor.risks || []), ...(competitor.unknowns || [])].join(', '),
      rationale: competitor.rationale,
      evidenceType: competitor.evidenceType,
      confidence: competitor.confidence,
      sources: competitor.sourceRefs?.join(', '),
    }));

    const evidence = workbook.addWorksheet('Evidence Ledger');
    evidence.columns = [
      { header: 'ID', key: 'id', width: 16 }, { header: 'Type', key: 'type', width: 22 },
      { header: 'Source', key: 'sourceLabel', width: 35 }, { header: 'Section', key: 'section', width: 20 },
      { header: 'Claim', key: 'claim', width: 80 }, { header: 'Confidence', key: 'confidence', width: 14 },
      { header: 'Value Type', key: 'valueType', width: 24 }, { header: 'Original Value', key: 'originalValue', width: 18 },
    ];
    evidence.addRows(analysis.evidence.map((item) => ({
      ...item,
      valueType: item.numeric?.valueType,
      originalValue: item.numeric?.originalValue,
    })));

    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10243E' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = analysis.deal.solicitationNumber?.replace(/[^a-z0-9-]/gi, '_') || 'market-position';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Market_Position.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Export failed.' });
  }
});

app.post('/api/export-pdf', async (req, res) => {
  try {
    const analysis = normalizeIncomingRun(req.body);
    if (!analysis.deal?.title) return res.status(400).json({ error: 'Analysis payload is required.' });
    const buffer = await createExecutivePdf(analysis);
    if (!buffer.length) throw new Error('PDF generator returned an empty document.');
    const safeName = analysis.deal.solicitationNumber?.replace(/[^a-z0-9-]/gi, '_') || 'market-position';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Market_Position.pdf"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'PDF export failed.' });
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!(error instanceof multer.MulterError)) return next(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Each uploaded file must be 4 MB or smaller in the hosted demo.' });
  if (error.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Upload no more than 10 supplemental files at once.' });
  return res.status(400).json({ error: `Upload failed: ${error.message}` });
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(port, '0.0.0.0', () => console.log(`Federal Market Position running on http://localhost:${port}`));
}

export default app;
if (process.env.VERCEL !== "1") {
  start();
}
