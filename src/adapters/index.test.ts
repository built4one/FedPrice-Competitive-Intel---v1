import test from 'node:test';
import assert from 'node:assert/strict';
import { querySamGov } from './sam';
import { queryUSASpending } from './usaspending';
import { queryGsaCalc } from './gsa';
import { queryBls } from './bls';
import type { DealProfile, LaborSignal } from '../types';

const mockDeal: DealProfile = {
  title: 'Enterprise IT Services', agency: 'Department of Defense', solicitationNumber: 'W9128F21R0001',
  contractType: 'CPAF', dueDate: '2026-12-01', periodOfPerformance: '5 years', naics: '541512',
  awardStructure: 'Single Award', evaluationMethod: 'Best Value', scopeSummary: 'Enterprise software services',
  facts: [], requirements: [], laborSignals: [{ title: 'Software Engineer' } as LaborSignal], pricingSignals: [],
};

async function withMockFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = global.fetch;
  global.fetch = mock;
  try { await run(); } finally { global.fetch = original; }
}

test('SAM.gov is optional and reports a missing key without blocking', async () => {
  const originalKey = process.env.SAM_API_KEY;
  delete process.env.SAM_API_KEY;
  try {
    const result = await querySamGov(mockDeal);
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.success, false);
    assert.match(result.message || '', /optional/i);
  } finally {
    if (originalKey) process.env.SAM_API_KEY = originalKey;
  }
});

test('GSA CALC+ treats a missing labor category as a valid zero-result query', async () => {
  const result = await queryGsaCalc([]);
  assert.equal(result.status, 'ZERO_RESULTS');
  assert.equal(result.success, true);
  assert.equal(result.recordsFound, 0);
});

test('USAspending sends required fields and normalizes a successful award', async () => {
  await withMockFetch(async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    assert.ok(payload.fields.includes('Award ID'));
    assert.equal(payload.page, 1);
    assert.equal(payload.subawards, false);
    assert.deepEqual(payload.filters.naics_codes, { require: ['541512'] });
    return new Response(JSON.stringify({
      results: [{
        'Award ID': 'FAKE-TEST-1', 'Recipient Name': 'TEST CONTRACTOR', 'Award Amount': 1250000,
        'Start Date': '2025-01-01', 'End Date': '2026-01-01', 'Awarding Agency': 'Department of Defense',
        'Award Type': 'Definitive Contract', generated_internal_id: 'CONT_AWD_TEST',
      }],
      page_metadata: { page: 1, hasNext: false }, messages: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }, async () => {
    const result = await queryUSASpending(mockDeal);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.recordsFound, 1);
    assert.equal(result.evidence[0].sourceRecordId, 'CONT_AWD_TEST');
    assert.equal(result.evidence[0].numeric?.originalValue, 1250000);
    assert.equal(result.evidence[0].numeric?.valueType, 'CURRENT_AWARD_AMOUNT');
    assert.equal(result.evidence[0].numeric?.units, 'TOTAL_USD');
    assert.match(result.evidence[0].claim, /TEST CONTRACTOR/);
  });
});

test('USAspending classifies HTTP 422 as an invalid query without retrying', async () => {
  let calls = 0;
  await withMockFetch(async () => {
    calls += 1;
    return new Response(JSON.stringify({ detail: 'Invalid filters' }), { status: 422 });
  }, async () => {
    const result = await queryUSASpending({ ...mockDeal, naics: '' });
    assert.equal(result.status, 'INVALID_QUERY');
    assert.equal(result.success, false);
    assert.equal(calls, 1);
  });
});

test('USAspending broadens to NAICS when an agency filter is rejected', async () => {
  let calls = 0;
  await withMockFetch(async (_url, init) => {
    calls += 1;
    const payload = JSON.parse(String(init?.body));
    if (calls === 1) return new Response('{"detail":"unknown agency"}', { status: 422 });
    assert.equal(payload.filters.agencies, undefined);
    return new Response(JSON.stringify({ results: [], page_metadata: { page: 1, hasNext: false }, messages: [] }), { status: 200 });
  }, async () => {
    const result = await queryUSASpending(mockDeal);
    assert.equal(result.status, 'ZERO_RESULTS');
    assert.equal(result.success, true);
    assert.equal(calls, 2);
    assert.match(result.querySummary, /broadened to NAICS/);
  });
});

test('BLS validates and normalizes the latest ECI observation', async () => {
  await withMockFetch(async () => new Response(JSON.stringify({
    status: 'REQUEST_SUCCEEDED', responseTime: 10, message: [], Results: { series: [{
      seriesID: 'CIU1010000000000A', data: [{ year: '2026', period: 'Q02', periodName: '2nd Quarter', value: '3.4' }],
    }] },
  }), { status: 200 }), async () => {
    const result = await queryBls();
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.evidence[0].numeric?.originalValue, 3.4);
    assert.equal(result.evidence[0].numeric?.valueType, 'ESCALATION_RATE');
    assert.equal(result.evidence[0].numeric?.units, 'PERCENT');
  });
});

test('GSA CALC+ reads the official Elasticsearch response shape and filters relevance', async () => {
  await withMockFetch(async (url) => {
    assert.match(String(url), /keyword=Software%20Engineer/);
    return new Response(JSON.stringify({ hits: { total: { value: 1 }, hits: [{ _source: {
      id: 42, labor_category: 'Senior Software Engineer', current_price: 188.5, next_year_price: 192,
      vendor_name: 'EXAMPLE VENDOR', schedule: 'MAS', education_level: 'BA', min_years_experience: 5,
      worksite: 'Customer_Facility', security_clearance: true, idv_piid: '47QTCA00TEST',
    } }] } }), { status: 200 });
  }, async () => {
    const result = await queryGsaCalc(mockDeal.laborSignals);
    assert.equal(result.status, 'SUCCESS');
    assert.equal(result.recordsFound, 1);
    assert.equal(result.evidence[0].numeric?.originalValue, 188.5);
    assert.equal(result.evidence[0].numeric?.valueType, 'HOURLY_CEILING_RATE');
    assert.equal(result.evidence[0].numeric?.units, 'USD_PER_HOUR');
    assert.match(result.evidence[0].claim, /ceiling rate/);
  });
});
