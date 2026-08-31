import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSamPostedDateWindows, parseSamOpportunityReference } from './sam';

test('parses a solicitation number as the primary SAM lookup key', () => {
  assert.deepEqual(parseSamOpportunityReference('80TECH24R0001'), { solicitationNumber: '80TECH24R0001' });
});

test('parses a canonical SAM opportunity URL', () => {
  assert.deepEqual(
    parseSamOpportunityReference('https://sam.gov/opp/d3567052dd7e4bbe89ed72d2feefdd7c/view'),
    { noticeId: 'd3567052dd7e4bbe89ed72d2feefdd7c' },
  );
});

test('parses a SAM workspace opportunity URL', () => {
  assert.deepEqual(
    parseSamOpportunityReference('https://sam.gov/workspace/contract/opp/d3567052dd7e4bbe89ed72d2feefdd7c/view'),
    { noticeId: 'd3567052dd7e4bbe89ed72d2feefdd7c' },
  );
});

test('SAM posted-date windows remain below the one-year API limit across leap years', () => {
  const windows = buildSamPostedDateWindows(new Date('2024-08-30T12:00:00Z'), 6);
  assert.equal(windows.length, 6);
  for (const window of windows) {
    const [fromMonth, fromDay, fromYear] = window.postedFrom.split('/').map(Number);
    const [toMonth, toDay, toYear] = window.postedTo.split('/').map(Number);
    const from = Date.UTC(fromYear, fromMonth - 1, fromDay);
    const to = Date.UTC(toYear, toMonth - 1, toDay);
    assert.ok((to - from) / (24 * 60 * 60 * 1000) <= 364);
  }
});
