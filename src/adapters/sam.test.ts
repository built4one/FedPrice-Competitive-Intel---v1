import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSamOpportunityReference } from './sam';

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
