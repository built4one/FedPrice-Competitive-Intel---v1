import Decimal from 'decimal.js';
import { z } from 'zod';

const amount = z.number().finite().nonnegative().max(1e12);
export const pricingInputsSchema = z.object({
  evaluationBasis: z.string().trim().min(10).max(2000),
  basisSource: z.string().trim().min(3).max(1000),
  completenessConfirmed: z.literal(true),
  lines: z.array(z.object({
    label: z.string().trim().min(1).max(200),
    quantity: z.number().finite().positive().max(1e9),
    lowUnitPrice: amount, targetUnitPrice: amount, highUnitPrice: amount,
    source: z.string().trim().min(3).max(1000),
  }).strict().refine(v => v.lowUnitPrice <= v.targetUnitPrice && v.targetUnitPrice <= v.highUnitPrice, 'Unit prices must be ordered low ≤ target ≤ high.')).min(1).max(40),
}).strict();
export type PricingInputs = z.infer<typeof pricingInputsSchema>;
export interface PricingScenario {
  inputs: PricingInputs;
  low: number; target: number; high: number;
  formula: string;
  status: 'CONDITIONAL';
}
// Offered unit prices include all burdens and fees. Each evaluated period/CLIN
// is entered explicitly; the app never assumes hours, option years or escalation.
export function calculatePricingScenario(raw: unknown): PricingScenario {
  const inputs = pricingInputsSchema.parse(raw);
  const total = (key: 'lowUnitPrice' | 'targetUnitPrice' | 'highUnitPrice') => {
    const value = inputs.lines.reduce((sum, row) => sum.plus(new Decimal(row.quantity).times(row[key])), new Decimal(0));
    if (value.greaterThan(1e15)) throw new Error('Evaluated total exceeds the supported calculation limit.');
    return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  };
  return {inputs, low: total('lowUnitPrice'), target: total('targetUnitPrice'), high: total('highUnitPrice'),
    formula: 'Sum of evaluated quantity × offered unit price for every entered CLIN/period; rounded once to cents.', status: 'CONDITIONAL'};
}
