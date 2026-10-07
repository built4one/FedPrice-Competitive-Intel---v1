import type { DealProfile, EvidenceItem, LaborPeriod } from '../../types';
import { laborCoverage } from '../laborCoverage';
import { extractPeriodMonths } from '../marketPosition/valueNormalization';

export interface LaborQuantityRow {
  id: string; title: string; period: string; hours: number; fte: number; months: number;
  exponent: number; factor: number; source: string; assumedHours: boolean;
  rateYearWeights: Array<{year:number;weight:number}>;
}
export interface LaborCalculationRow extends LaborQuantityRow {
  lowRate: number; medianRate: number; highRate: number; evidenceIds: string[]; proxy: boolean;
  qualification: string; rateLimitation: string; sampleSize: number;
  assumedRate?: boolean; assumptionBasis?: string;
}
export interface LaborModel {
  rows: LaborCalculationRow[]; quantityRows: LaborQuantityRow[]; missing: string[]; assumptions: string[];
  escalationPct: number; escalationEvidenceId?: string; totalHours: number; pricedHours: number; quantityComplete: boolean; complete: boolean;
}

export const dollars = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function buildLaborModel(deal: DealProfile, evidence: EvidenceItem[]): LaborModel {
  const rows: LaborCalculationRow[] = [], quantityRows: LaborQuantityRow[] = [], missing: string[] = [], assumptions: string[] = [];
  let quantityValid = true;
  const quantityGap = (message:string) => {missing.push(message);quantityValid=false;};
  const months = deal.performanceMonths || extractPeriodMonths(deal.periodOfPerformance);
  const escalationSource = evidence.find(e => e.numeric?.valueType === 'ESCALATION_RATE' && e.numeric.units === 'PERCENT'
    && Number.isFinite(e.numeric.originalValue) && e.numeric.originalValue >= 0 && e.numeric.originalValue < 20);
  const escalationPct = escalationSource?.numeric?.originalValue || 0;
  const startFacts=deal.facts.filter(f=>/ordering period|performance (?:start|period)|start date/i.test(f.label)).map(f=>f.value).join(' ');
  const openingYear=Number((startFacts || deal.periodOfPerformance).match(/\b20\d{2}\b/)?.[0]);
  const baseYear=deal.evaluationPricing?.rateBaseYear;
  // Contract Year 1 is an ordinal, never the calendar year AD 1.
  const calendarBase = baseYear != null && Number.isInteger(baseYear) && baseYear >= 1900 && baseYear <= 2200;
  const openingExponent = calendarBase && openingYear >= 1900 && openingYear <= 2200 && Math.abs(openingYear-baseYear!) <= 15
    ? Math.max(0,openingYear-baseYear!) : 0;
  if (baseYear != null && !calendarBase) assumptions.push(`Rate base "${baseYear}" is a contract-year label; treat it as opening-period rates, with zero historical escalation.`);
  if (calendarBase && openingYear && Math.abs(openingYear-baseYear!) > 15) missing.push('Rate calendar years are more than 15 years apart; use opening-period rates provisionally and verify the rate date.');
  if(baseYear!=null && !openingYear) missing.push('Confirm the opening performance year to reconcile the explicit labor rate base year.');
  if(openingExponent) assumptions.push(`The opening performance year ${openingYear} follows the stated rate base year ${baseYear}; apply ${openingExponent} opening-year escalation step(s).`);
  if (!months || !positive(months)) quantityGap('Confirm the complete evaluated performance period.');
  if (!deal.laborSignals?.length) quantityGap('No quantified labor schedule is available.');
  if (deal.laborModelComplete === false) quantityGap(deal.laborModelSource || 'The extracted labor schedule is incomplete.');
  const rateBase = 'Retrieved public rates are treated as opening-period planning proxies, unless the schedule explicitly identifies a different rate basis. Historical escalation is a forward planning assumption, not a forecast.';
  assumptions.push(rateBase);
  assumptions.push(escalationSource ? `Apply ${escalationPct}% annual planning escalation from ${escalationSource.id}; validate its relevance and future application.` : 'Use zero escalation provisionally because no cited escalation series is available.');
  for (const coverage of laborCoverage(deal, evidence)) {
    const s = coverage.signal;
    const ratesValid = positive(coverage.medianRate) && positive(coverage.lowerRate) && positive(coverage.upperRate)
      && coverage.lowerRate <= coverage.medianRate && coverage.medianRate <= coverage.upperRate;
    if (!ratesValid) missing.push(`${s.title}: ${coverage.limitation}`);
    const periods: LaborPeriod[] = s.periods?.length ? [...s.periods].sort((a,b)=>a.startMonth-b.startMonth)
      : months && positive(s.quantity) ? [{label:'Full performance period',startMonth:0,months,quantity:s.quantity,annualHours:s.annualHours,section:s.section}] : [];
    if (!periods.length) {quantityGap(`${s.title}: no documented quantity/period basis.`);continue;}
    let end = 0;
    for (const [index,p] of periods.entries()) {
      if (!Number.isFinite(p.startMonth) || p.startMonth < 0 || Math.abs(p.startMonth-end) > .01 || !positive(p.months) || p.months > 600
        || !Number.isFinite(p.quantity) || p.quantity < 0 || (months && p.startMonth+p.months > months+.01)) {
        quantityGap(`${s.title} / ${p.label}: period coverage or quantity is invalid.`);continue;
      }
      end = p.startMonth+p.months;
      const annualHours = p.annualHours || s.annualHours;
      const assumedHours = p.totalHours == null && !positive(annualHours);
      const hours = p.totalHours ?? p.quantity*(annualHours || 2080)*p.months/12;
      if (!Number.isFinite(hours) || hours < 0 || (p.quantity > 0 && hours === 0) || (annualHours != null && annualHours > 8784)) {
        quantityGap(`${s.title} / ${p.label}: invalid evaluated hours.`); continue;
      }
      // Keep aggregate row hours intact; never multiply documented totals by FTE or duration again.
      const extension = /extension|52\.217.?8|six.month|6.month/i.test(p.label);
      const finalOption = extension && deal.evaluationPricing?.extensionRateRule === 'FINAL_OPTION_RATES';
      const rateStart = finalOption ? Math.max(0,p.startMonth-1) : p.startMonth;
      let factor = 0;
      const weights = new Map<number,number>();
      for (let offset=0;offset<p.months;offset++) {
        const exponent = openingExponent+Math.floor((finalOption ? rateStart : p.startMonth+offset)/12);
        const weight = Math.min(1,p.months-offset)/p.months;
        factor += weight*(1+escalationPct/100)**exponent;
        weights.set(exponent,(weights.get(exponent)||0)+weight);
      }
      if (extension && (!deal.evaluationPricing || deal.evaluationPricing.extensionRateRule === 'UNKNOWN'))
        assumptions.push('Extension rate language remains unconfirmed: the planning case continues annual escalation; compare with final-option rates before relying on total evaluated price.');
      if (finalOption) assumptions.push(`Extension uses final-option rates without another annual uplift. Source: ${deal.evaluationPricing?.extensionSource || deal.evaluationPricing?.source}.`);
      if (!Number.isFinite(factor) || factor <= 0 || factor > 20) {
        quantityGap(`${s.title} / ${p.label}: escalation is outside the valid planning domain.`); continue;
      }
      const quantityRow: LaborQuantityRow = {id:`LAB-${quantityRows.length+1}`,title:s.title,period:p.label,hours,fte:p.quantity,months:p.months,
        exponent:openingExponent+Math.floor(rateStart/12),factor,source:p.section || s.section || 'Extracted schedule; locator needs validation',
        assumedHours,rateYearWeights:[...weights].map(([year,weight])=>({year,weight}))};
      quantityRows.push(quantityRow);
      if (ratesValid) rows.push({...quantityRow,
        lowRate:coverage.lowerRate!,medianRate:coverage.medianRate!,highRate:coverage.upperRate!,
        evidenceIds:coverage.evidenceIds,assumedHours,proxy:coverage.proxyMapped,
        qualification:[s.duties,s.minExperienceYears != null ? `${s.minExperienceYears} years minimum experience` : '',s.education,s.certifications?.join(', '),s.clearance,s.location,s.titleConflict].filter(Boolean).join('; '),
        rateLimitation:coverage.limitation,sampleSize:coverage.sampleSize,rateYearWeights:[...weights].map(([year,weight])=>({year,weight}))});
      if (assumedHours) assumptions.push(`${s.title} / ${p.label}: use 2,080 hours per FTE-year as a provisional assumption.`);
    }
    if (months && Math.abs(end-months) > .01) quantityGap(`${s.title}: the schedule does not cover all ${months} evaluated months.`);
  }
  return {rows,quantityRows,missing:[...new Set(missing)],assumptions:[...new Set(assumptions)],escalationPct,
    escalationEvidenceId:escalationSource?.id,totalHours:quantityRows.reduce((a,r)=>a+r.hours,0),pricedHours:rows.reduce((a,r)=>a+r.hours,0),
    quantityComplete:quantityRows.length>0 && quantityValid && quantityRows.every(r=>!r.assumedHours),complete:rows.length>0 && !missing.length};
}

export function laborTotal(rows: LaborCalculationRow[], basis: 'lowRate' | 'medianRate' | 'highRate') {
  return dollars(rows.reduce((a,r)=>a+r.hours*r[basis]*r.factor,0));
}
