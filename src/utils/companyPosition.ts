import type { MarketPosition } from '../types';

export interface CompanyContext {
  companyName: string; estimatedPrice?: number; costBaseline?: number; targetMarginPct?: number;
  riskPosture: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE'; differentiators: string; constraints: string;
}

export interface CompanyPosition {
  effectivePrice?: number; impliedMarginPct?: number; deltaToMarketPct?: number;
  bandPosition: 'BELOW_MARKET' | 'IN_MARKET_BAND' | 'ABOVE_MARKET' | 'UNPRICED' | 'MARKET_RANGE_UNAVAILABLE';
  fitScore: number; assessment: string; recommendedAction: string;
}

export function calculateCompanyPosition(market: MarketPosition, company: CompanyContext): CompanyPosition {
  const price = company.estimatedPrice || (company.costBaseline && company.targetMarginPct !== undefined ? company.costBaseline / (1 - company.targetMarginPct / 100) : undefined);
  if (!price) return { bandPosition: 'UNPRICED', fitScore: 0, assessment: 'Insufficient company inputs.', recommendedAction: 'Provide estimated price or cost/margin.' };
  if (market.aggressive === null || market.conservative === null || market.expected === null) return { effectivePrice: price, impliedMarginPct: company.costBaseline ? ((price - company.costBaseline) / price) * 100 : undefined, bandPosition: 'MARKET_RANGE_UNAVAILABLE', fitScore: 0, assessment: 'Market position is not numerically supportable.', recommendedAction: 'Focus on non-price factors.' };
  
  const deltaToMarketPct = ((price - market.expected) / market.expected) * 100;
  const impliedMarginPct = company.costBaseline ? ((price - company.costBaseline) / price) * 100 : undefined;
  
  let bandPosition: CompanyPosition['bandPosition'];
  if (price < market.aggressive) bandPosition = 'BELOW_MARKET';
  else if (price > market.conservative) bandPosition = 'ABOVE_MARKET';
  else bandPosition = 'IN_MARKET_BAND';
  
  return {
    effectivePrice: price, impliedMarginPct, deltaToMarketPct, bandPosition,
    fitScore: bandPosition === 'IN_MARKET_BAND' ? 90 : bandPosition === 'BELOW_MARKET' ? 70 : 30,
    assessment: `Priced ${bandPosition.replaceAll('_', ' ').toLowerCase()}.`,
    recommendedAction: bandPosition === 'ABOVE_MARKET' ? 'Reduce price.' : 'Hold price.'
  };
}
