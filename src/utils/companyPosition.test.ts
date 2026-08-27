import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCompanyPosition } from './companyPosition';
import type { MarketPosition } from '../types';
const market: MarketPosition = { currency: 'USD', low: 90, target: 100, high: 110, rangeStatus: 'SUPPORTED', posture: 'MARKET_ALIGNED', summary: '', confidence: 'HIGH', confidenceScore: 85, attractivenessScore: 70, basis: [], drivers: [] };
test('positions a company price inside the market band', () => {
  const result = calculateCompanyPosition(market, { companyName: 'Example', estimatedPrice: 105, riskPosture: 'BALANCED', differentiators: '', constraints: '' });
  assert.equal(result.bandPosition, 'IN_MARKET_BAND'); assert.equal(result.deltaToMarketPct, 5);
});
test('derives price from cost and target margin', () => {
  const result = calculateCompanyPosition(market, { companyName: 'Example', costBaseline: 80, targetMarginPct: 20, riskPosture: 'BALANCED', differentiators: '', constraints: '' });
  assert.equal(result.effectivePrice, 100); assert.equal(result.impliedMarginPct, 20);
});

