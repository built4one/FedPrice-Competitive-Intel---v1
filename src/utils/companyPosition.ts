import type { CompanyContext, CompanyPosition, MarketPosition } from '../types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function calculateCompanyPosition(market: MarketPosition, context: CompanyContext): CompanyPosition {
  const margin = context.targetMarginPct ?? 0;
  const calculatedPrice = context.costBaseline && margin < 100
    ? context.costBaseline / (1 - margin / 100) : undefined;
  const effectivePrice = context.estimatedPrice || calculatedPrice;
  if (!effectivePrice) return {
    bandPosition: 'UNPRICED', fitScore: 0,
    assessment: 'Add an estimated price or cost baseline to compare the company position with the market.',
    recommendedAction: 'Complete the internal cost and price inputs before making a company-specific decision.',
  };
  const impliedMarginPct = context.costBaseline ? ((effectivePrice - context.costBaseline) / effectivePrice) * 100 : undefined;
  if (!market.target || !market.low || !market.high) return {
    effectivePrice, impliedMarginPct, bandPosition: 'MARKET_RANGE_UNAVAILABLE', fitScore: 35,
    assessment: 'The company price is calculated, but the evidence does not yet support a defensible market range.',
    recommendedAction: 'Resolve the highest-impact market data gaps before approving a bid position.',
  };
  const deltaToMarketPct = ((effectivePrice - market.target) / market.target) * 100;
  const bandPosition = effectivePrice < market.low ? 'BELOW_MARKET' : effectivePrice > market.high ? 'ABOVE_MARKET' : 'IN_MARKET_BAND';
  const fitScore = clamp(Math.round(100 - Math.abs(deltaToMarketPct) * 2.5), 0, 100);
  const assessment = bandPosition === 'IN_MARKET_BAND'
    ? `The company position is ${Math.abs(deltaToMarketPct).toFixed(1)}% ${deltaToMarketPct >= 0 ? 'above' : 'below'} the market target and remains inside the recommended band.`
    : bandPosition === 'BELOW_MARKET'
      ? 'The company position is below the market band, which may improve competitiveness but raises execution and realism risk.'
      : 'The company position is above the market band and needs a clearly evaluated value advantage.';
  const recommendedAction = bandPosition === 'IN_MARKET_BAND'
    ? 'Protect the current price while strengthening the evidence behind the highest-weight recommendation drivers.'
    : bandPosition === 'BELOW_MARKET'
      ? 'Validate labor, transition, and delivery assumptions before adopting the lower position.'
      : 'Reduce cost or price, or document a value case strong enough to justify the premium.';
  return { effectivePrice, impliedMarginPct, deltaToMarketPct, bandPosition, fitScore, assessment, recommendedAction };
}

