import type { LegacySchema } from './openaiIntelligence';

const string: LegacySchema = { type: 'STRING' };
const array = (items: LegacySchema): LegacySchema => ({ type: 'ARRAY', items });
const object = (properties: Record<string, LegacySchema>): LegacySchema => ({ type: 'OBJECT', properties, required: Object.keys(properties) });
const statement = object({ text: string, kind: { type: 'STRING', enum: ['FACT', 'INFERENCE', 'ASSUMPTION'] }, evidenceIds: array(string), validationAction: string });
export const strategyResponseSchema = object({
  buyingDecision: object({ evaluationMethod: statement, priceTradeoff: statement, complianceGates: array(statement) }),
  competitors: array(object({ name: string, bidIntent: { type: 'STRING', enum: ['CONFIRMED', 'POSSIBLE', 'UNKNOWN'] }, intentBasis: statement, likelyApproach: statement, threat: statement })),
  options: array(object({ id: string, name: string, winLogic: statement, evaluationAdvantage: statement, deliveryChanges: array(statement), pricingLevers: array(statement), likelyRivalResponse: statement, principalRisk: statement })),
  recommendation: object({ selectedOptionId: string, rationale: statement, alternatives: array(object({ optionId: string, reason: statement })), changeTriggers: array(statement), nextActions: array(statement) }),
  missingInputs: array(string),
});
