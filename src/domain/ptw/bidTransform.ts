import type { DealProfile, EvaluationScheme } from '../../types';

export interface BidTransform {
  discountPct: number;
  rationale: string;
}

export function determineBidTransform(deal: DealProfile): BidTransform {
  const scheme = deal.evaluationScheme;
  if (!scheme) {
    return {
      discountPct: 0,
      rationale: 'No evaluation scheme detected. Using undiscounted public ceiling rates as a conservative baseline.'
    };
  }

  if (scheme.method === 'LPTA' || scheme.priceWeight === 'DOMINANT') {
    return {
      discountPct: 15,
      rationale: 'Price-dominant evaluation (LPTA or dominant weight). Assuming an aggressive 15% competitive discount from public ceiling rates.'
    };
  }

  if (scheme.method === 'TRADE_OFF' && scheme.priceWeight === 'SIGNIFICANT') {
    return {
      discountPct: 10,
      rationale: 'Best-value tradeoff with significant price weight. Assuming a standard 10% competitive discount from public ceiling rates.'
    };
  }

  if (scheme.method === 'HIGHEST_TECH_RATED' || scheme.priceWeight === 'LOW' || scheme.priceWeight === 'NONE') {
    return {
      discountPct: 5,
      rationale: 'Qualifications-led or technical-dominant evaluation. Assuming a minimal 5% discount from public ceiling rates, favoring delivery margin.'
    };
  }

  return {
    discountPct: 8,
    rationale: 'Unknown specific evaluation weighting. Assuming an 8% default competitive discount from public ceiling rates.'
  };
}

export function applyBidTransform(rate: number, transform: BidTransform): number {
  return rate * (1 - transform.discountPct / 100);
}
