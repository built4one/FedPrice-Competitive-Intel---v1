import type { DealProfile } from '../../types';

export interface BidTransform {
  discountPct: number;
  rationale: string;
}

export function determineBidTransform(_deal: DealProfile): BidTransform {
  // An evaluation method is not evidence of a ceiling-to-offer discount.
  // Explicit analyst offered rates remain available through Price Scenarios.
  return {
    discountPct: 0,
    rationale: 'Public ceiling rates are planning proxies, not observed bids. No ceiling-to-offer discount is inferred from evaluation method; enter supported offered rates in Price Scenarios.'
  };
}

export function applyBidTransform(rate: number, transform: BidTransform): number {
  return rate * (1 - transform.discountPct / 100);
}
