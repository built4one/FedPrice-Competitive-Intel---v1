import { z } from 'zod';

const text = z.string().trim().min(1).max(1600);
export const statementSchema = z.object({
  text,
  kind: z.enum(['FACT', 'INFERENCE', 'ASSUMPTION']),
  evidenceIds: z.array(z.string().min(1)).max(12),
  validationAction: z.string().max(600),
}).strict();

// Prices are deliberately absent. A strategy must earn a price through an
// explicit, approved scenario model; a benchmark midpoint is not that model.
export const strategySchema = z.object({
  buyingDecision: z.object({
    evaluationMethod: statementSchema,
    priceTradeoff: statementSchema,
    complianceGates: z.array(statementSchema).max(12),
  }).strict(),
  competitors: z.array(z.object({
    name: text,
    bidIntent: z.enum(['CONFIRMED', 'POSSIBLE', 'UNKNOWN']),
    intentBasis: statementSchema,
    likelyApproach: statementSchema,
    threat: statementSchema,
  }).strict()).max(12),
  options: z.array(z.object({
    id: z.string().regex(/^[a-z0-9_-]{1,60}$/),
    name: text,
    winLogic: statementSchema,
    evaluationAdvantage: statementSchema,
    deliveryChanges: z.array(statementSchema).min(1).max(6),
    pricingLevers: z.array(statementSchema).min(1).max(6),
    likelyRivalResponse: statementSchema,
    principalRisk: statementSchema,
  }).strict()).min(2).max(4),
  recommendation: z.object({
    selectedOptionId: z.string(),
    rationale: statementSchema,
    alternatives: z.array(z.object({optionId: z.string(), reason: statementSchema}).strict()).min(1).max(3),
    changeTriggers: z.array(statementSchema).min(1).max(6),
    nextActions: z.array(statementSchema).min(1).max(8),
  }).strict(),
  missingInputs: z.array(text).max(12),
}).strict();

export type StrategyStatement = z.infer<typeof statementSchema>;
export type PtwStrategy = z.infer<typeof strategySchema>;
export type PtwStrategyResult =
  | { status: 'DRAFT'; version: string; inputHash: string; generatedAt: string; reviewStatus: 'UNREVIEWED'; strategy: PtwStrategy }
  | { status: 'UNAVAILABLE'; version: string; reason: string };

export function strategyStatements(strategy: PtwStrategy): Array<{ section: string; statement: StrategyStatement }> {
  const rows: Array<{section: string; statement: StrategyStatement}> = [];
  const add = (section: string, ...statements: StrategyStatement[]) => statements.forEach(statement => rows.push({section, statement}));
  add('Evaluation method', strategy.buyingDecision.evaluationMethod);
  add('Price versus non-price tradeoff', strategy.buyingDecision.priceTradeoff);
  add('Compliance gates', ...strategy.buyingDecision.complianceGates);
  strategy.competitors.forEach(c => {
    add(`${c.name} - bid intent: ${c.bidIntent}`, c.intentBasis);
    add(`${c.name} - likely approach`, c.likelyApproach);
    add(`${c.name} - threat`, c.threat);
  });
  strategy.options.forEach(o => {
    add(`${o.name} - why it could win`, o.winLogic);
    add(`${o.name} - evaluation benefit`, o.evaluationAdvantage);
    add(`${o.name} - delivery changes`, ...o.deliveryChanges);
    add(`${o.name} - pricing levers`, ...o.pricingLevers);
    add(`${o.name} - rival response`, o.likelyRivalResponse);
    add(`${o.name} - main risk`, o.principalRisk);
  });
  add('Recommendation', strategy.recommendation.rationale);
  strategy.recommendation.alternatives.forEach(a => add(`Alternative: ${a.optionId}`, a.reason));
  add('What changes the recommendation', ...strategy.recommendation.changeTriggers);
  add('Validation actions', ...strategy.recommendation.nextActions);
  return rows;
}
