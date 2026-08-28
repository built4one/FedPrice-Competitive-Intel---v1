import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import ExcelJS from 'exceljs';
import { calculateCompanyPosition } from './src/utils/companyPosition.js';
import type { CompanyContext, EvidenceItem, OpportunityAnalysis, ConnectorStatus } from './src/types.js';
import { querySamGov } from './src/adapters/sam.js';
import { queryUSASpending } from './src/adapters/usaspending.js';
import { queryGsaCalc } from './src/adapters/gsa.js';
import { queryBls } from './src/adapters/bls.js';
import type { AdapterResult } from './src/adapters/types.js';

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
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The AI response was not valid JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const stringArray = { type: 'ARRAY', items: { type: 'STRING' } };
const baseSchema = {
  type: 'OBJECT',
  properties: {
    deal: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING' }, agency: { type: 'STRING' }, solicitationNumber: { type: 'STRING' },
        contractType: { type: 'STRING' }, dueDate: { type: 'STRING' }, periodOfPerformance: { type: 'STRING' },
        naics: { type: 'STRING' }, awardStructure: { type: 'STRING' }, evaluationMethod: { type: 'STRING' },
        scopeSummary: { type: 'STRING' },
        facts: { type: 'ARRAY', items: { type: 'OBJECT', properties: { label: { type: 'STRING' }, value: { type: 'STRING' }, section: { type: 'STRING' }, confidence: { type: 'NUMBER' } }, required: ['label', 'value', 'confidence'] } },
        requirements: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, detail: { type: 'STRING' }, category: { type: 'STRING' }, section: { type: 'STRING' }, confidence: { type: 'NUMBER' } }, required: ['name', 'detail', 'category', 'confidence'] } },
        laborSignals: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, quantity: { type: 'NUMBER' }, annualHours: { type: 'NUMBER' }, location: { type: 'STRING' }, clearance: { type: 'STRING' }, section: { type: 'STRING' } }, required: ['title'] } },
        pricingSignals: { type: 'ARRAY', items: { type: 'OBJECT', properties: { signal: { type: 'STRING' }, implication: { type: 'STRING' }, section: { type: 'STRING' }, confidence: { type: 'NUMBER' } }, required: ['signal', 'implication', 'confidence'] } },
      },
      required: ['title', 'agency', 'solicitationNumber', 'contractType', 'dueDate', 'periodOfPerformance', 'naics', 'awardStructure', 'evaluationMethod', 'scopeSummary', 'facts', 'requirements', 'laborSignals', 'pricingSignals'],
    },
    marketPosition: {
      type: 'OBJECT',
      properties: {
        currency: { type: 'STRING' }, low: { type: 'NUMBER' }, target: { type: 'NUMBER' }, high: { type: 'NUMBER' },
        rangeStatus: { type: 'STRING' }, posture: { type: 'STRING' }, summary: { type: 'STRING' }, confidence: { type: 'STRING' },
        confidenceScore: { type: 'NUMBER' }, attractivenessScore: { type: 'NUMBER' }, basis: stringArray,
        drivers: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, score: { type: 'NUMBER' }, weight: { type: 'NUMBER' }, assessment: { type: 'STRING' }, evidenceIds: stringArray }, required: ['name', 'score', 'weight', 'assessment', 'evidenceIds'] } },
      },
      required: ['currency', 'low', 'target', 'high', 'rangeStatus', 'posture', 'summary', 'confidence', 'confidenceScore', 'attractivenessScore', 'basis', 'drivers'],
    },
    competitors: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      name: { type: 'STRING' }, role: { type: 'STRING' }, likelihood: { type: 'NUMBER' }, pricingPosture: { type: 'STRING' },
      rationale: { type: 'STRING' }, differentiators: stringArray, risks: stringArray, sourceRefs: stringArray,
      confidence: { type: 'NUMBER' }, evidenceType: { type: 'STRING' },
    }, required: ['name', 'role', 'likelihood', 'pricingPosture', 'rationale', 'differentiators', 'risks', 'sourceRefs', 'confidence', 'evidenceType'] } },
    incumbent: { type: 'OBJECT', properties: {
      name: { type: 'STRING' }, status: { type: 'STRING' }, strengths: stringArray, vulnerabilities: stringArray,
      transitionRisk: { type: 'STRING' }, confidence: { type: 'NUMBER' }, sourceRefs: stringArray,
    }, required: ['name', 'status', 'strengths', 'vulnerabilities', 'transitionRisk', 'confidence', 'sourceRefs'] },
    evidence: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      id: { type: 'STRING' }, type: { type: 'STRING' }, sourceLabel: { type: 'STRING' }, section: { type: 'STRING' },
      claim: { type: 'STRING' }, excerpt: { type: 'STRING' }, confidence: { type: 'NUMBER' },
    }, required: ['id', 'type', 'sourceLabel', 'claim', 'confidence'] } },
    gaps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, impact: { type: 'STRING' }, priority: { type: 'STRING' } }, required: ['question', 'impact', 'priority'] } },
    guidance: { type: 'OBJECT', properties: {
      headline: { type: 'STRING' }, targetPrice: { type: 'NUMBER' }, rangeLow: { type: 'NUMBER' }, rangeHigh: { type: 'NUMBER' },
      position: { type: 'STRING' }, rationale: { type: 'STRING' }, winConditions: stringArray, guardrails: stringArray, nextActions: stringArray,
    }, required: ['headline', 'targetPrice', 'rangeLow', 'rangeHigh', 'position', 'rationale', 'winConditions', 'guardrails', 'nextActions'] },
  },
  required: ['deal', 'marketPosition', 'competitors', 'incumbent', 'evidence', 'gaps', 'guidance'],
};

const analysisPrompt = `You are a federal capture and competitive-pricing analyst. Analyze the attached solicitation and produce a decision-grade market-position brief.

NON-NEGOTIABLE EVIDENCE RULES
- Solicitation facts must cite the actual section or attachment when discoverable.
- Never invent an incumbent, competitor, dollar value, agency history, benchmark, FAR clause, staffing level, or source.
- Label competitor hypotheses and other deductions ANALYST_INFERENCE.
- Use SOLICITATION_FACT only for claims supported by the uploaded document.
- If the document does not support a numeric market range, return 0 for low/target/high, use rangeStatus INSUFFICIENT, and explain the missing inputs.
- If a range is derived from explicit ceiling, staffing, hours, rates, or historical values, identify that basis and mark it DIRECTIONAL unless multiple reliable signals support it.
- Confidence values are 0-100. Scores are 0-100. Driver weights must total 100.
- Do not claim GSA CALC, BLS, SAM.gov, USAspending, or other research was performed in this first pass.

PRODUCT LOGIC
1) Extract the deal and evaluation facts. 2) Identify pricing and staffing signals. 3) assemble an evidence ledger.
4) assess likely competition and incumbent posture with explicit fact/inference labels. 5) create the market position.
6-7) Company inputs are optional and are intentionally not required here. 8-10) deliver market-based positioning guidance, guardrails, and next actions.

Use USD. Keep language concise, specific, and suitable for a federal pricing lead.`;

const sourceNames: ConnectorStatus['name'][] = ['SAM.gov', 'USAspending', 'GSA CALC+', 'BLS'];
const connectorCache = new Map<string, { expiresAt: number; result: AdapterResult }>();
const connectorCacheTtlMs = 15 * 60 * 1000;

function connectorCacheKey(name: ConnectorStatus['name'], deal: OpportunityAnalysis['deal']) {
  const labor = deal.laborSignals?.map((item) => item.title).filter(Boolean).slice(0, 5) || [];
  return JSON.stringify([name, deal.agency, deal.naics, deal.solicitationNumber, deal.title, labor]);
}

async function runConnectorSet(deal: OpportunityAnalysis['deal'], only?: ConnectorStatus['name'], force = false) {
  const tasks: Record<ConnectorStatus['name'], () => Promise<AdapterResult>> = {
    'SAM.gov': () => querySamGov(deal),
    USAspending: () => queryUSASpending(deal),
    'GSA CALC+': () => queryGsaCalc(deal.laborSignals || []),
    BLS: () => queryBls(),
  };
  const selected = only ? [only] : sourceNames;
  const settled = await Promise.allSettled(selected.map(async (name) => {
    const key = connectorCacheKey(name, deal);
    const cached = connectorCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return { ...cached.result, message: cached.result.message ? `${cached.result.message} Cached result.` : 'Cached result.' };
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
    name: result.name, status: result.status, recordsFound: result.recordsFound, message: result.message,
    durationMs: result.durationMs, attempts: result.attempts, retrievedAt: result.retrievedAt, querySummary: result.querySummary,
  };
}

function mergeEvidence(existing: EvidenceItem[] = [], incoming: EvidenceItem[] = []) {
  const merged = new Map((existing || []).filter(Boolean).map((item) => [item.id, item]));
  for (const item of (incoming || []).filter(Boolean)) merged.set(item.id, item);
  return [...merged.values()];
}

async function synthesizeOfficialEvidence(base: Omit<OpportunityAnalysis, 'id' | 'meta'>) {
  const official = base.evidence.filter((item) => item.type === 'EXTERNAL_SOURCE' && /API/.test(item.sourceLabel));
  if (official.length === 0) return;
  const client = aiClient();
  const response = await client.models.generateContent({
    model,
    contents: `Update the market interpretation using ONLY the validated official-source evidence below. Return ONLY JSON with keys marketPosition, competitors, incumbent, guidance and preserve their existing shapes. Preserve solicitation facts and evidence IDs. Never treat an award amount as a comparable target without scope similarity. Treat GSA values as ceiling rates, not paid rates. Use BLS only as escalation context. Do not create a numeric range if the evidence does not support one; preserve INSUFFICIENT and zero values when appropriate. Clearly separate verified facts from modeled estimates.\n\nCURRENT ANALYSIS:\n${JSON.stringify({ marketPosition: base.marketPosition, competitors: base.competitors, incumbent: base.incumbent, guidance: base.guidance })}\n\nOFFICIAL EVIDENCE:\n${JSON.stringify(official)}`,
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  const synthesis = parseJson(response.text);
  base.marketPosition = synthesis.marketPosition || base.marketPosition;
  base.competitors = synthesis.competitors || base.competitors;
  base.incumbent = synthesis.incumbent || base.incumbent;
  base.guidance = synthesis.guidance || base.guidance;
}

async function analyzeFile(file: Express.Multer.File, companyContext?: CompanyContext): Promise<OpportunityAnalysis> {
  const client = aiClient();
  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [
      { text: analysisPrompt },
      { inlineData: { data: file.buffer.toString('base64'), mimeType: file.mimetype || 'application/octet-stream' } },
    ] }],
    config: { responseMimeType: 'application/json', responseSchema: baseSchema as never, temperature: 0.15 },
  });
  const base = parseJson(response.text) as Omit<OpportunityAnalysis, 'id' | 'meta'>;
  const warnings: string[] = [];
  let researchStatus: OpportunityAnalysis['meta']['researchStatus'] = 'SOLICITATION_ONLY';
  const connectors: ConnectorStatus[] = [];

  try {
    const results = await runConnectorSet(base.deal);
    for (const r of results) {
      connectors.push(connectorStatus(r));
      base.evidence = mergeEvidence(base.evidence, r.evidence);
    }
    if (results.some(r => r.success && r.recordsFound > 0)) {
      researchStatus = 'PARTIAL';
      try {
        await synthesizeOfficialEvidence(base);
      } catch (error) {
        warnings.push(`Official evidence was retrieved but synthesis could not be refreshed. ${error instanceof Error ? error.message : ''}`.trim());
      }
    }
  } catch (err) {
    warnings.push(`Government API adapters failed to run: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (process.env.ENABLE_GOOGLE_SEARCH !== 'false') {
    try {
      const researchResponse = await client.models.generateContent({
        model,
        contents: `Research the public federal market for this opportunity using Google Search. Return ONLY JSON with keys marketPosition, competitors, incumbent, guidance. Preserve the same shapes shown in this base analysis. Treat the included official API evidence as higher authority than general web results. Improve only claims supported by current public sources. Put source URLs in each competitor/incumbent sourceRefs. Never treat an award amount as a comparable target without scope similarity. Treat GSA values as ceiling rates and BLS only as escalation context. Do not fabricate a dollar range when evidence is insufficient.\n\nBASE ANALYSIS:\n${JSON.stringify(base)}`,
        config: { tools: [{ googleSearch: {} }], temperature: 0.1 },
      });
      const research = parseJson(researchResponse.text);
      base.marketPosition = research.marketPosition || base.marketPosition;
      base.competitors = research.competitors || base.competitors;
      base.incumbent = research.incumbent || base.incumbent;
      base.guidance = research.guidance || base.guidance;
      const chunks = researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: EvidenceItem[] = chunks.flatMap((chunk: any, index: number) => chunk.web?.uri ? [{
        id: `EXT-${index + 1}`, type: 'EXTERNAL_SOURCE' as const, sourceLabel: chunk.web.title || `External source ${index + 1}`,
        claim: 'Public market source used during grounded enrichment.', url: chunk.web.uri, confidence: 80,
      }] : []);
      base.evidence = [...base.evidence, ...sources];
      researchStatus = 'GROUNDED';
    } catch (error) {
      warnings.push(`Public-market enrichment was unavailable; the brief is solicitation-grounded only. ${error instanceof Error ? error.message : ''}`.trim());
      researchStatus = 'PARTIAL';
    }
  }

  const analysis: OpportunityAnalysis = {
    ...base,
    id: `run-${crypto.randomUUID()}`,
    meta: { mode: companyContext ? 'MARKET_AND_COMPANY' : 'MARKET_ONLY', model, analyzedAt: new Date().toISOString(), researchStatus, warnings, connectors },
  };
  if (companyContext) {
    analysis.companyContext = companyContext;
    analysis.companyPosition = calculateCompanyPosition(analysis.marketPosition, companyContext);
  }
  return analysis;
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', aiConfigured: Boolean(apiKey), model }));

app.post('/api/analyze-solicitation', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a solicitation file before starting the analysis.' });
    const allowed = ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!allowed.includes(req.file.mimetype)) return res.status(415).json({ error: 'Use a PDF, DOCX, DOC, or TXT solicitation file.' });
    const context = req.body.companyContext ? JSON.parse(req.body.companyContext) as CompanyContext : undefined;
    res.json({ data: await analyzeFile(req.file, context) });
  } catch (error) {
    console.error('Analysis failed', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'The analysis could not be completed.' });
  }
});

app.post('/api/retry-connector', async (req, res) => {
  try {
    const analysis = req.body?.analysis as OpportunityAnalysis | undefined;
    const source = req.body?.source as ConnectorStatus['name'] | undefined;
    if (!analysis?.deal || !sourceNames.includes(source as ConnectorStatus['name'])) {
      return res.status(400).json({ error: 'A valid analysis and connector name are required.' });
    }
    const [result] = await runConnectorSet(analysis.deal, source, true);
    const sourceLabels: Record<ConnectorStatus['name'], string[]> = {
      'SAM.gov': ['SAM.gov Opportunities API'], USAspending: ['USAspending.gov API'],
      'GSA CALC+': ['GSA CALC+ API'], BLS: ['BLS Public Data API'],
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
    if (result.recordsFound > 0) {
      try {
        await synthesizeOfficialEvidence(analysis);
      } catch (error) {
        analysis.meta.warnings.push(`The ${source} evidence refreshed, but the recommendation synthesis did not. ${error instanceof Error ? error.message : ''}`.trim());
      }
    }
    res.json({ data: analysis });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'The connector could not be retried.' });
  }
});

app.post('/api/export-brief', async (req, res) => {
  try {
    const analysis = req.body as OpportunityAnalysis;
    if (!analysis?.deal?.title) return res.status(400).json({ error: 'Analysis payload is required.' });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FedPrice Competitive Intel';
    const summary = workbook.addWorksheet('Market Position');
    summary.columns = [{ header: 'Field', key: 'field', width: 30 }, { header: 'Value', key: 'value', width: 90 }];
    summary.addRows([
      { field: 'Opportunity', value: analysis.deal.title }, { field: 'Agency', value: analysis.deal.agency },
      { field: 'Solicitation', value: analysis.deal.solicitationNumber }, { field: 'Market Low', value: analysis.marketPosition.low || 'Insufficient evidence' },
      { field: 'Market Target', value: analysis.marketPosition.target || 'Insufficient evidence' }, { field: 'Market High', value: analysis.marketPosition.high || 'Insufficient evidence' },
      { field: 'Range Status', value: analysis.marketPosition.rangeStatus }, { field: 'Confidence', value: `${analysis.marketPosition.confidenceScore}%` },
      { field: 'Positioning Guidance', value: analysis.guidance.headline }, { field: 'Rationale', value: analysis.guidance.rationale },
    ]);
    const evidence = workbook.addWorksheet('Evidence Ledger');
    evidence.columns = [
      { header: 'ID', key: 'id', width: 14 }, { header: 'Type', key: 'type', width: 22 }, { header: 'Source', key: 'sourceLabel', width: 35 },
      { header: 'Section', key: 'section', width: 20 }, { header: 'Claim', key: 'claim', width: 80 }, { header: 'Confidence', key: 'confidence', width: 14 },
    ];
    evidence.addRows(analysis.evidence);
    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10243E' } };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const safeName = analysis.deal.solicitationNumber.replace(/[^a-z0-9-]/gi, '_') || 'market-position';
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
  app.listen(port, '0.0.0.0', () => console.log(`FedPrice Competitive Intel running on http://localhost:${port}`));
}

start();
