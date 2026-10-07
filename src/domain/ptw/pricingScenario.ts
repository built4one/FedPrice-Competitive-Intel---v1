import Decimal from 'decimal.js';
import { z } from 'zod';
import type { OpportunityAnalysis } from '../../types';
import { calculateCompetitivePosition } from './competitivePosition';

const amount = z.number().finite().nonnegative().max(1e12);
export const pricingInputsSchema = z.object({
  evaluationBasis: z.string().trim().min(10).max(2000),
  basisSource: z.string().trim().min(3).max(1000),
  completenessConfirmed: z.literal(true),
  lines: z.array(z.object({
    label: z.string().trim().min(1).max(200),
    sourceRowId: z.string().min(1).max(100).optional(),
    quantity: z.number().finite().nonnegative().max(1e9),
    lowUnitPrice: amount, targetUnitPrice: amount, highUnitPrice: amount,
    source: z.string().trim().min(3).max(1000),
  }).strict().refine(v => v.lowUnitPrice <= v.targetUnitPrice && v.targetUnitPrice <= v.highUnitPrice, 'Unit prices must be ordered low ≤ target ≤ high.')).min(1).max(400),
}).strict();
export type PricingInputs = z.infer<typeof pricingInputsSchema>;
export interface PricingScenario {
  inputs: PricingInputs;
  low: number; target: number; high: number;
  formula: string;
  status: 'CONDITIONAL';
  scopeReconciled?: boolean;
}
// Offered unit prices include all burdens and fees. Each evaluated period/CLIN
// is entered explicitly; the app never assumes hours, option years or escalation.
export function calculatePricingScenario(raw: unknown): PricingScenario {
  const inputs = pricingInputsSchema.parse(raw);
  if (!inputs.lines.some(r=>r.quantity>0)) throw new Error('At least one evaluated quantity must be positive.');
  const total = (key: 'lowUnitPrice' | 'targetUnitPrice' | 'highUnitPrice') => {
    const value = inputs.lines.reduce((sum, row) => sum.plus(new Decimal(row.quantity).times(row[key])), new Decimal(0));
    if (value.greaterThan(1e15)) throw new Error('Evaluated total exceeds the supported calculation limit.');
    return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  };
  return {inputs, low: total('lowUnitPrice'), target: total('targetUnitPrice'), high: total('highUnitPrice'),
    formula: 'Sum of evaluated quantity × offered unit price for every entered CLIN/period; rounded once to cents.', status: 'CONDITIONAL'};
}

export function pricingDraft(analysis: OpportunityAnalysis) {
  const p=calculateCompetitivePosition(analysis);
  const rows=new Map(p.rows.map(r=>[r.id,r]));
  const quantities=[...p.rows,...p.unpricedRows].sort((a,b)=>Number(a.id.slice(4))-Number(b.id.slice(4)));
  return {
    evaluationBasis:analysis.deal.evaluationPricing?.basis || '',basisSource:analysis.deal.evaluationPricing?.source || '',
    lines:[...quantities.map(r=>{
      const priced=rows.get(r.id);
      return {sourceRowId:r.id,label:`${r.title} / ${r.period}`,quantity:String(r.hours),
        lowUnitPrice:priced ? String(priced.lowRate*r.factor) : '',targetUnitPrice:priced ? String(priced.recommendedRate*r.factor) : '',highUnitPrice:priced ? String(priced.highRate*r.factor) : '',
        source:`${r.source}; ${priced ? `${priced.assumedRate?'Explicit planning assumption':'Public planning proxies'}: ${priced.evidenceIds.join(', ')}; factor ${r.factor}. Validate fully burdened offered rates.` : 'Rate or role mapping unresolved: enter a cited analyst assumption.'}`};
    }),...(analysis.deal.evaluationPricing?.components || []).map(c=>{
      const modeled=p.components.find(v=>v.id===c.id);
      return {sourceRowId:`COMP-${c.id}`,label:c.label,quantity:'1',lowUnitPrice:modeled ? String(modeled.lowAmount??modeled.includedAmount) : '',targetUnitPrice:modeled ? String(modeled.includedAmount) : '',highUnitPrice:modeled ? String(modeled.highAmount??modeled.includedAmount) : '',source:`${c.source}; ${c.evidenceIds.join(', ')}. ${modeled?.assumption || 'Validate all applicable component costs and fees.'}`};
    }),...(analysis.deal.evaluationPricing?.unitLines||[]).map(l=>{
      const input=p.planningRows.find(i=>i.id===l.id);
      return {sourceRowId:`UNIT-${l.id}`,label:l.label,quantity:String(l.quantity),lowUnitPrice:input?String(input.low):'',targetUnitPrice:input?String(input.central):'',highUnitPrice:input?String(input.high):'',source:`${l.source}. ${input?.rationale||'Unit price requires validation.'}`};
    })],
  };
}

export function calculateSourcePricingScenario(raw:unknown, analysis:OpportunityAnalysis) {
  const scenario=calculatePricingScenario(raw);
  const expected=pricingDraft(analysis).lines;
  if (expected.length) {
    if (!calculateCompetitivePosition(analysis).basisReconstructed) throw new Error('Complete the source quantity schedule before saving a full-scope offer scenario.');
    for (const row of expected) {
      const matches=scenario.inputs.lines.filter(r=>r.sourceRowId===row.sourceRowId);
      if (matches.length!==1 || matches[0].quantity!==Number(row.quantity)) throw new Error(`Retain the source quantity row ${row.label}; edit its rates or re-analyze a corrected source schedule.`);
    }
  }
  return {...scenario,scopeReconciled:true};
}
