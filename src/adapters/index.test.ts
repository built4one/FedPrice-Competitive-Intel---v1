import test from 'node:test';
import assert from 'node:assert';
import { querySamGov } from './sam.js';
import { queryUSASpending } from './usaspending.js';
import { queryGsaCalc } from './gsa.js';
import { queryBls } from './bls.js';
import type { DealProfile, LaborSignal } from '../types.js';

// Mock deal data
const mockDeal: DealProfile = {
  title: 'Test Opportunity',
  agency: 'Department of Defense',
  solicitationNumber: 'W9128F21R0001',
  contractType: 'CPAF',
  dueDate: '2023-12-01',
  periodOfPerformance: '5 years',
  naics: '541512',
  awardStructure: 'Single Award',
  evaluationMethod: 'Best Value',
  scopeSummary: 'Test scope',
  facts: [],
  requirements: [],
  laborSignals: [{ title: 'Software Engineer' } as LaborSignal],
  pricingSignals: []
};

test('querySamGov adapter handles missing key gracefully', async () => {
  const originalKey = process.env.SAM_API_KEY;
  delete process.env.SAM_API_KEY;

  const result = await querySamGov(mockDeal);
  assert.strictEqual(result.name, 'SAM.gov');
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.message, 'API key not configured');

  if (originalKey) process.env.SAM_API_KEY = originalKey;
});

test('queryGsaCalc adapter gracefully handles no labor categories', async () => {
  const result = await queryGsaCalc([]);
  assert.strictEqual(result.name, 'GSA CALC+');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.recordsFound, 0);
  assert.strictEqual(result.message, 'No labor categories to search.');
});

// Using a mocked fetch to prevent real API calls in tests
test('queryUSASpending handles fetch error gracefully', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Network error'); };

  const result = await queryUSASpending(mockDeal);
  assert.strictEqual(result.name, 'USAspending');
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.message, 'Network error');

  global.fetch = originalFetch;
});

test('queryBls handles fetch error gracefully', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Network error'); };

  const result = await queryBls();
  assert.strictEqual(result.name, 'BLS');
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.message, 'Network error');

  global.fetch = originalFetch;
});
