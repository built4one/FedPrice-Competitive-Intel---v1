import type { OpportunityAnalysis, MarketPosition } from '../../types';

export interface Scenario {
  name: 'Aggressive' | 'Expected' | 'Conservative';
  value: number | null;
  basis: string;
}

export function calculateDeterministicScenarios(analysis: Omit<OpportunityAnalysis, 'id' | 'meta'>): { low: number | null, target: number | null, high: number | null, status: MarketPosition['rangeStatus'] } {
  // A simple deterministic engine for Phase 1 that uses evidence values
  const numericEvidence = analysis.evidence.filter(e => e.value !== undefined && e.value > 0);
  
  if (numericEvidence.length === 0) {
    // Try to find any dollar values in facts
    const dollarFacts = analysis.deal.facts.filter(f => f.value.includes('$'));
    // For this simple mock engine, we just assign some defaults if absolutely nothing is found,
    // but the rules say "Permit value: null and INSUFFICIENT_EVIDENCE; never manufacture a range."
    return { low: null, target: null, high: null, status: 'INSUFFICIENT' };
  }

  // Very basic deterministic approach: average the numeric evidence
  const values = numericEvidence.map(e => e.value as number).sort((a, b) => a - b);
  if (values.length === 1) {
    const val = values[0];
    return { low: val * 0.9, target: val, high: val * 1.1, status: 'DIRECTIONAL' };
  }

  const low = values[0];
  const high = values[values.length - 1];
  const target = values.reduce((sum, v) => sum + v, 0) / values.length;

  return { low, target, high, status: 'SUPPORTED' };
}
