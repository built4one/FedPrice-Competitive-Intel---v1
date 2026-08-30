import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import ExcelJS from 'exceljs';
import type {
  AiAnalysisDraft,
  ConnectorStatus,
  DecisionNarrative,
  EvidenceItem,
  OpportunityAnalysis,
} from './src/types.js';
import { querySamGov } from './src/adapters/sam.js';
import { queryUSASpending } from './src/adapters/usaspending.js';
import { queryGsaCalc } from './src/adapters/gsa.js';
import { queryBls } from './src/adapters/bls.js';
import type { AdapterResult } from './src/adapters/types.js';
import { calculateDeterministicScenarios } from './src/domain/marketPosition/scenarioEngine.js';
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
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

app.use(express.json({ limit: '5mb' }));

function aiClient() {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured. Add it in Google AI Studio Secrets and restart the app.');
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
  },
  required: ['originalValue', 'valueType', 'currency', 'units'],
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
- Use valueType values exactly from: EVALUATED_PRICE, ESTIMATED_VALUE, TOTAL_AWARD_VALUE, CURRENT_AWARD_AMOUNT, CONTRACT_CEILING, INITIAL_OBLIGATION, CURRENT_OBLIGATIONS, EVENTUAL_SPEND, HOURLY_CEILING_RATE, ESCALATION_RATE, BUDGET_CONTEXT, UNKNOWN.
- Use units TOTAL_USD, USD_PER_HOUR, PERCENT, or OTHER. Do not convert unlike units.
- Set opportunitySpecific true only for a value that describes this solicitation.
- Set recurringService, scalableByQuantity, or sharedAcrossAwards true only when the document supports it.
- Never invent an incumbent, competitor, amount, staffing level, source, normalization factor, or evidence ID.
- SOLICITATION_FACT requires a document citation. Label deductions ANALYST_INFERENCE.
- Confidence values are 0-100, but do not create an opportunity score or probability of win.
- Do not claim public-source research was performed during this extraction pass.

PRODUCT TASK
1. Extract deal, evaluation, staffing, pricing, and acquisition facts.
2. Build an evidence ledger, including explicit numeric evidence with correct value types.
3. Identify gaps that affect comparability or normalization.
4. Produce qualitative competitor and incumbent reconstruction with fact/inference separation.
5. Produce marketAssessment and narrative fields that explain conditions, guardrails, and next actions without authoritative dollar values.

Use concise language suitable for a federal pricing lead.`;

const sourceNames: ConnectorStatus['name'][] = ['SAM.gov', 'USAspending', 'GSA CALC+', 'BLS'];
const connectorCache = new Map<string, { expiresAt: number; result: AdapterResult }>();
const connectorCacheTtlMs = 15 * 60 * 1000;

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

async function analyzeFiles(files: Express.Multer.File[]): Promise<OpportunityAnalysis> {
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
  draft.gaps = draft.gaps || [];
  draft.marketAssessment = sanitizeMarketAssessment(draft.marketAssessment);
  draft.narrative = sanitizeNarrative(draft.narrative);
  const warnings: string[] = [];
  let researchStatus: OpportunityAnalysis['meta']['researchStatus'] = 'SOLICITATION_ONLY';
  const connectors: ConnectorStatus[] = [];

  try {
    const fileNames = files.map(f => f.originalname);
    const results = await runConnectorSet(draft.deal, undefined, false, fileNames);
    for (const result of results) {
      connectors.push(connectorStatus(result));
      draft.evidence = mergeEvidence(draft.evidence, result.evidence);
    }
    if (results.some((result) => result.success && result.recordsFound > 0)) {
      researchStatus = 'PARTIAL';
      try {
        await synthesizeOfficialEvidence(draft);
      } catch (error) {
        warnings.push(`Official evidence was retrieved but qualitative synthesis could not be refreshed. ${error instanceof Error ? error.message : ''}`.trim());
      }
    }
  } catch (error) {
    warnings.push(`Government API adapters failed to run: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (process.env.ENABLE_GOOGLE_SEARCH !== 'false') {
    try {
      const researchResponse = await client.models.generateContent({
        model,
        contents: `Research the public federal market for this opportunity using Google Search.
Return JSON with keys marketAssessment, competitors, incumbent, and narrative only.
Improve only qualitative claims supported by current public sources and preserve the existing shapes.
Never return or revise an authoritative Market Position dollar value, numeric range, opportunity score, or probability of win.
Do not put dollar values in narrative strings. Put source URLs in competitor and incumbent sourceRefs.

BASE ANALYSIS:
${JSON.stringify(draft)}`,
        config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
      });
      const research = parseJson(researchResponse.text);
      draft.marketAssessment = sanitizeMarketAssessment(research.marketAssessment || draft.marketAssessment);
      draft.competitors = research.competitors || draft.competitors;
      draft.incumbent = research.incumbent || draft.incumbent;
      draft.narrative = sanitizeNarrative(research.narrative || draft.narrative);
      const chunks = researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: EvidenceItem[] = chunks.flatMap((chunk: any, index: number) => chunk.web?.uri ? [{
        id: `EXT-${index + 1}`,
        type: 'EXTERNAL_SOURCE' as const,
        sourceLabel: chunk.web.title || `External source ${index + 1}`,
        claim: 'Public market source used during grounded qualitative enrichment.',
        url: chunk.web.uri,
        confidence: 80,
        retrievedAt: new Date().toISOString(),
      }] : []);
      draft.evidence = mergeEvidence(draft.evidence, sources);
      researchStatus = 'GROUNDED';
    } catch (error) {
      warnings.push(`Public-market enrichment was unavailable; the brief remains solicitation and official-adapter grounded. ${error instanceof Error ? error.message : ''}`.trim());
      researchStatus = 'PARTIAL';
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
  calculationEngine: 'market-position-v2.0.0',
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
    return {
      ...raw,
      marketPosition: createLegacyPosition(raw.marketPosition),
      narrative: legacyNarrative(raw),
      meta: {
        ...raw.meta,
        warnings: [...new Set([
          ...(raw.meta.warnings || []),
          'This legacy run must be recalculated before its numeric Market Position can be used.',
        ])],
      },
    } as OpportunityAnalysis;
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
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: 'Choose solicitation files before starting the analysis.' });
    const allowed = [
      'application/pdf',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    for (const file of files) {
      if (!allowed.includes(file.mimetype)) {
        return res.status(415).json({ error: `File ${file.originalname} is not supported. Use a PDF, DOCX, DOC, or TXT file.` });
      }
    }
    res.json({ data: await analyzeFiles(files) });
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
      { field: 'Evidence Readiness', value: `${analysis.marketPosition.evidenceReadiness.score}/100` },
      { field: 'Formula Version', value: analysis.marketPosition.formulaVersion },
      { field: 'Calculation Basis', value: 'Weighted comparable total-value evidence only' },
    ]);

    const methodology = workbook.addWorksheet('Calculation Methodology');
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
    })));

    const intelligence = workbook.addWorksheet('Intelligence');
    intelligence.columns = [{ header: 'Category', key: 'category', width: 24 }, { header: 'Finding', key: 'finding', width: 100 }];
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
      { header: 'Evidence Type', key: 'evidenceType', width: 22 },
    ];
    analysis.competitors.forEach((competitor) => competitors.addRow({
      name: competitor.name,
      role: competitor.role,
      capabilities: competitor.demonstratedCapabilities?.join(', '),
      technology: competitor.techPlatform,
      evidenceType: competitor.evidenceType,
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

async function start() {
  if (process.env.NODE_ENV !== 'production') {
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
