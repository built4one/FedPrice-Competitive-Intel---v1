import assert from 'node:assert/strict';
import test from 'node:test';
import type { EvidenceItem } from '../../types';
import { classifyNumericEvidence } from './evidenceClassification';

function item(id: string, claim: string, value: number, valueType: 'ESTIMATED_VALUE' | 'CONTRACT_CEILING' = 'ESTIMATED_VALUE'): EvidenceItem {
  return {
    id,
    type: 'SOLICITATION_FACT',
    sourceLabel: 'Solicitation',
    section: 'Award Information',
    claim,
    confidence: 99,
    numeric: { originalValue: value, valueType, currency: 'USD', units: 'TOTAL_USD', opportunitySpecific: true },
  };
}

test('classifies program funding separately from an individual-award range', () => {
  const evidence = [
    item('PROGRAM', 'The total estimated funding for the CORTEX ARA is approximately $460M.', 460_000_000),
    item('LOW', 'Individual awards will normally range from $10M to $50M.', 10_000_000),
    item('HIGH', 'Individual awards will normally range from $10M to $50M.', 50_000_000),
    item('CEILING', 'There is potential to award individual contracts up to $99M.', 99_000_000, 'CONTRACT_CEILING'),
  ];
  classifyNumericEvidence(evidence);
  assert.equal(evidence[0].numeric?.valueBasis, 'PROGRAM_TOTAL');
  assert.equal(evidence[1].numeric?.valueBasis, 'INDIVIDUAL_AWARD');
  assert.equal(evidence[1].numeric?.rangeBound, 'LOW');
  assert.equal(evidence[2].numeric?.rangeBound, 'HIGH');
  assert.equal(evidence[1].numeric?.rangeId, evidence[2].numeric?.rangeId);
  assert.equal(evidence[3].numeric?.valueBasis, 'INDIVIDUAL_AWARD');
});

test('classifies order limits and past-performance thresholds as non-price bases', () => {
  const evidence = [
    item('ORDER', 'The maximum order for a combination of items is $25,000,000.', 25_000_000, 'CONTRACT_CEILING'),
    item('PAST', 'At least one past performance project must have a minimum value of $1,000,000.', 1_000_000),
  ];
  classifyNumericEvidence(evidence);
  assert.equal(evidence[0].numeric?.valueBasis, 'ORDER_LIMIT');
  assert.equal(evidence[1].numeric?.valueBasis, 'PAST_PERFORMANCE_THRESHOLD');
});
