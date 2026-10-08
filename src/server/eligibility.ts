import type { DealProfile } from '../types';
export class IneligibleSolicitationError extends Error {}
export function assessEligibility(deal: DealProfile, now = new Date(), options: {historical?:boolean} = {}): string[] {
  const status = deal.documentStatus;
  const cited = Boolean(deal.eligibilitySource?.trim());
  const reasons: Record<string, string> = {
    NON_SOLICITATION: 'This package is not a federal solicitation.',
    NONCOMPETITIVE: 'This notice is explicitly noncompetitive or sole source.',
    PRE_SOLICITATION: 'This is an RFI, sources-sought notice, or draft. A final solicitation and price evaluation basis are needed.',
    EXPIRED: 'The package identifies a closed or superseded solicitation.',
  };
  if (status && reasons[status] && cited && !(options.historical && status === 'EXPIRED')) throw new IneligibleSolicitationError(`${reasons[status]} ${deal.eligibilityReason || ''} Source: ${deal.eligibilitySource} Upload the current competitive solicitation and amendments.`);
  const deadline = deal.dueDate?.trim();
  // Only unambiguous dates are used for the automated deadline check. End of
  // day gives the analyst time to resolve a missing time zone or new amendment.
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(deadline || '')) {
    const date = new Date(`${deadline!.slice(0,10)}T23:59:59.999Z`);
    if (!options.historical && Number.isFinite(date.getTime()) && date < now) throw new IneligibleSolicitationError(`The extracted response deadline (${deadline}) has passed. Upload an amendment with the extended deadline or a current solicitation. Historical analysis is outside this live PTW pilot.`);
  }
  const warnings: string[] = options.historical ? ['Historical practice analysis: not an open bidding opportunity. Research reflects today’s sources, not a backtest of prices available at the original deadline.'] : [];
  if (status !== 'OPEN_COMPETITIVE' || !cited) warnings.push('Solicitation eligibility is unresolved. Confirm that this is the current, competitive package before using the recommendation.');
  if (!deadline || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(deadline)) warnings.push('No unambiguous response deadline was extracted. Confirm the current deadline and latest amendments.');
  return warnings;
}
