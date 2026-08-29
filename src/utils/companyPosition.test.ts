import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCompanyPosition } from './companyPosition';
import type { MarketPosition } from '../types';
const market: MarketPosition = {
  currency: 'USD', aggressive: 90, expected: 100, conservative: 110, rangeStatus: 'SUPPORTED',
  posture: 'MARKET_ALIGNED', summary: '', formulaVersion: 'test', basis: [], drivers: [], anchors: [],
  evidenceReadiness: { score: 85, comparability: 90, evidenceQuality: 90, normalizationConfidence: 90, effectiveQuantity: 70, sourceDiversity: 60, consistency: 95, gapResolution: 80 },
  effectiveSampleSize: 2, dispersionPct: 5, rangeWidthPct: 10, constraints: [], rangeFactors: [], assumptions: [],
};
test('positions a company price inside the market band', () => {
  const result = calculateCompanyPosition(market, { companyName: 'Example', estimatedPrice: 105, riskPosture: 'BALANCED', differentiators: '', constraints: '' });
  assert.equal(result.bandPosition, 'IN_MARKET_BAND'); assert.equal(result.deltaToMarketPct, 5);
});
test('derives price from cost and target margin', () => {
  const result = calculateCompanyPosition(market, { companyName: 'Example', costBaseline: 80, targetMarginPct: 20, riskPosture: 'BALANCED', differentiators: '', constraints: '' });
  assert.equal(result.effectivePrice, 100); assert.equal(result.impliedMarginPct, 20);
});
