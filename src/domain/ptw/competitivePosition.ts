import type { ConfidenceLevel, EvaluatedPriceComponent, OpportunityAnalysis } from '../../types';
import { buildLaborModel, dollars, laborTotal, type LaborCalculationRow, type LaborQuantityRow } from './laborModel';
import { sourceConflictStatus } from '../sourceConsistency';

export const COMPETITIVE_POSITION_VERSION = 'competitive-position-1.1.0';
export interface CompetitiveScenario {
  id: 'AGGRESSIVE' | 'RECOMMENDED' | 'DEFENSIVE'; label: string; labor: number; nonLabor: number;
  total: number; selected: boolean; rationale: string; condition: string; basis: 'PARTIAL_SUBTOTAL' | 'MODELED_BASKET';
}
export interface PricedLaborRow extends LaborCalculationRow {
  recommendedRate: number; protectionReason: string; low: number; target: number; high: number;
}
export interface PricedComponent extends EvaluatedPriceComponent { includedAmount: number; assumption: string; }
export interface DecisionAction { owner: string; action: string; consequence: string; }
export interface PriceSensitivity { label: string; change: string; delta: number; rationale: string; }
export interface CompetitivePosition {
  version: string; status: 'PROVISIONAL' | 'PARTIAL_MODEL' | 'NOT_SUPPORTED';
  priceOrderFirst: boolean; evaluationComplete: boolean; target: number | null;
  rangeLow: number | null; rangeHigh: number | null; rangeMeaning: string;
  rationale: string; decisionRequest: string; rows: PricedLaborRow[]; components: PricedComponent[];
  scenarios: CompetitiveScenario[]; missing: string[]; assumptions: string[];
  confidence: {quantities:ConfidenceLevel;rateRelevance:ConfidenceLevel;competition:ConfidenceLevel;execution:'NOT_ASSESSED';overall:ConfidenceLevel};
  sensitivities: PriceSensitivity[]; actions: DecisionAction[]; ceilingExplanation: string;
  unpricedRows: LaborQuantityRow[]; totalHours: number; pricedHours: number; quantityComplete: boolean;
}

function isPriceOrdered(analysis: Pick<OpportunityAnalysis,'deal'|'evidence'>) {
  const evaluationText = [analysis.deal.evaluationMethod,
    ...analysis.deal.requirements.filter(r=>r.category === 'EVALUATION').map(r=>r.detail),
    ...analysis.evidence.filter(e=>e.type === 'SOLICITATION_FACT' && /evaluat|section m/i.test(`${e.claim} ${e.section}`)).map(e=>`${e.claim} ${e.excerpt || ''}`)].join(' ');
  const affirmativeText=evaluationText.replace(/\b(?:not|non)[\s-]+LPTA\b/gi,'');
  return /\bLPTA\b|lowest.price technically acceptable|rank(?:ed|ing)?[^.]{0,80}(?:price|lowest)|price.ordered|lowest.price first|price ranking.*first/i.test(affirmativeText);
}

function protectRole(analysis: Pick<OpportunityAnalysis,'deal'|'evidence'>, row: LaborCalculationRow) {
  const s = analysis.deal.laborSignals.find(s=>s.title === row.title)!;
  const specialization = [s.pwsTitle || s.title, s.duties || '', s.certifications?.join(' ') || ''].join(' ');
  if (s.titleConflict) return 'Protect median economics while the source-role conflict is resolved; test alternative mappings.';
  if ((s.minExperienceYears ?? 0) >= 5 || /\bsenior\b|\bprincipal\b|\blead\b|project manager|program manager|architect|e.discovery|conditional access|information assurance|cloud application|configuration manager|network (?:engineer|analyst)|virtual desktop/i.test(specialization))
    return 'Protect the public median as a planning assumption for documented seniority, specialist responsibilities or operational bottlenecks; recruiting economics remain unvalidated.';
  if (row.proxy || row.sampleSize < 5) return 'Protect median economics because the proxy mapping or small sample is weak; do not presume the lowest public rates are executable.';
  return '';
}

export function calculateCompetitivePosition(analysis: Pick<OpportunityAnalysis,'deal'|'evidence'>): CompetitivePosition {
  const model = buildLaborModel(analysis.deal, analysis.evidence);
  const priceOrderFirst = isPriceOrdered(analysis);
  const missing = [...model.missing];
  if(model.rows.some(r=>r.assumedHours)) missing.push('Replace assumed annual hours with the specified evaluated hours before treating this as a complete evaluated-price model.');
  analysis.deal.sourceConflicts?.filter(c=>sourceConflictStatus(c,analysis.deal)==='OPEN').forEach(c=>missing.push(`Resolve ${c.topic}: ${c.descriptions.join(' versus ')}. ${c.resolution}`));
  const assumptions = [...model.assumptions,
    'All role percentiles and protections are analyst planning assumptions. Public fully burdened ceiling rates include embedded burdens/fee; do not add them again.',
    'No public lower-quartile rate establishes an executable staffing floor or a competitor bid.',
    'No dollar premium, productivity saving, teaming saving or probability of win is inferred from qualitative strategy prose.'];
  const pricing = analysis.deal.evaluationPricing;
  if (!pricing) missing.push('Re-extract the complete evaluated-price basket, travel/ODCs and extension instructions from the source package.');
  else if (pricing.completeness !== 'COMPLETE') missing.push('Confirm every evaluated non-labor line and period; the extracted evaluation basket is partial.');
  if (pricing?.extensionRateRule==='UNKNOWN' && model.rows.some(r=>/extension|52\.217.?8|six.month|6.month/i.test(r.period)))
    missing.push('Confirm the extension-rate clause; the provisional model continues annual escalation until final-option rate treatment is established.');
  const components: PricedComponent[] = [];
  const componentIds = new Set<string>();
  for (const c of pricing?.components || []) {
    if (componentIds.has(c.id)) {missing.push(`Duplicate evaluated component ${c.id}; confirm whether totals overlap.`);continue;}
    componentIds.add(c.id);
    const idsKnown = c.evidenceIds.length && c.evidenceIds.every(id=>analysis.evidence.some(e=>e.id===id && e.type==='SOLICITATION_FACT' && Boolean(e.section)));
    if (c.amount == null || !Number.isFinite(c.amount) || c.amount < 0 || !c.source.trim() || !idsKnown) {
      missing.push(`${c.label}: confirm the specified amount with a solicitation evidence ID and locator.`);continue;
    }
    let indirect = 0, assumption = '';
    if (c.indirectTreatment === 'KNOWN' && c.indirectPct != null && Number.isFinite(c.indirectPct) && c.indirectPct >= 0 && c.indirectPct <= 100) indirect = c.indirectPct;
    else if (c.indirectTreatment !== 'NOT_ALLOWED') {
      assumption = `${c.label}: applicable indirect costs are unknown; assume zero solely for provisional market planning.`;
      assumptions.push(assumption);missing.push(`${c.label}: validate applicable indirect costs; the total currently assumes zero.`);
    }
    if (c.feeAllowed) {
      assumption += `${assumption ? ' ' : ''}No additional fee assumed; validate the offered component price.`;
      assumptions.push(`${c.label}: no additional component fee is assumed; validate any allowed fee.`);
    }
    components.push({...c,includedAmount:dollars(c.amount*(1+indirect/100)),assumption});
  }
  const rows: PricedLaborRow[] = model.rows.map(r=>{
    const protectionReason = priceOrderFirst ? protectRole(analysis,r) : 'Use the median public rate provisionally; no quantified evaluated advantage establishes a premium or a lower competitive position.';
    const recommendedRate = protectionReason ? r.medianRate : r.lowRate;
    return {...r,recommendedRate,protectionReason:protectionReason || 'Apply lower-quartile public-rate economics as a price-led planning assumption; validate duties, qualifications and cleared labor availability.',
      low:dollars(r.hours*r.lowRate*r.factor),target:dollars(r.hours*recommendedRate*r.factor),high:dollars(r.hours*r.highRate*r.factor)};
  });
  const nonLabor = dollars(components.reduce((a,c)=>a+c.includedAmount,0));
  const aggressive = laborTotal(rows,'lowRate'), defensive = laborTotal(rows,'highRate');
  const central = dollars(rows.reduce((a,r)=>a+r.hours*r.recommendedRate*r.factor,0));
  const hasBasis = model.complete;
  const lowerRoles = new Set(rows.filter(r=>r.recommendedRate!==r.medianRate).map(r=>r.title));
  const medianRoles = new Set(rows.filter(r=>r.recommendedRate===r.medianRate).map(r=>r.title));
  const selectionRationale = lowerRoles.size
    ? `Apply lower-quartile rates to ${lowerRoles.size} role(s) and median rates to ${medianRoles.size} role(s), based on the documented protection choices.`
    : `Every priced role uses its public median. No lower-quartile reduction is applied${priceOrderFirst ? ' because each role currently requires rate protection' : ''}.`;
  const basis = hasBasis ? 'MODELED_BASKET' as const : 'PARTIAL_SUBTOTAL' as const;
  const evaluationComplete = hasBasis && pricing?.completeness === 'COMPLETE' && !missing.length;
  const target = hasBasis ? dollars(central+nonLabor) : null;
  const scenarios: CompetitiveScenario[] = rows.length ? [
    {id:'AGGRESSIVE',label:'Aggressive',labor:aggressive,nonLabor,total:dollars(aggressive+nonLabor),selected:false,basis,rationale:'Lower-quartile role rates test the lowest public-rate planning posture.',condition:'Requires validated recruitment/retention economics and mandatory qualifications; it is not a cost floor.'},
    {id:'RECOMMENDED',label:hasBasis?'Recommended':'Working median / protected case',labor:central,nonLabor,total:dollars(central+nonLabor),selected:hasBasis,basis,rationale:selectionRationale,condition:'Validate influential mappings, all evaluated components and eligible competitive pressure before adopting the target.'},
    {id:'DEFENSIVE',label:'Defensive stress case',labor:defensive,nonLabor,total:dollars(defensive+nonLabor),selected:false,basis,rationale:'Upper-quartile role rates test higher labor-price exposure.',condition:priceOrderFirst ? 'Greater risk of being outside the price-ranked evaluation cohort; higher rates do not earn evaluation credit by themselves.' : 'A higher price requires an evidenced benefit under scored factors; internal cost increases do not establish willingness to pay.'},
  ] : [];
  const shift = dollars(rows.reduce((a,r)=>a+r.hours*r.factor,0));
  const byRole = [...new Set(rows.map(r=>r.title))].map(title=>({title,delta:dollars(rows.filter(r=>r.title===title).reduce((a,r)=>a+r.hours*r.factor*10,0))})).sort((a,b)=>b.delta-a.delta);
  const escalationUp = dollars(rows.reduce((a,r)=>a+r.hours*r.recommendedRate*(r.rateYearWeights.reduce((sum,w)=>sum+w.weight*(1+(model.escalationPct+1)/100)**w.year,0)-r.factor),0));
  const sensitivities: PriceSensitivity[] = rows.length ? [
    {label:'All starting labor rates',change:'+$1/hour',delta:shift,rationale:'Sum of evaluated hours times the documented escalation factors; fixed components remain unchanged.'},
    ...byRole.slice(0,3).map(r=>({label:r.title,change:'+$10/hour',delta:r.delta,rationale:'Isolated role-rate change; no change to staffing quantities or other roles.'})),
    {label:'Annual escalation',change:'+1 percentage point',delta:escalationUp,rationale:'Planning sensitivity; preserve the extension convention and compare annual rate assumptions.'},
    {label:'Recommended labor economics',change:'+5% loaded labor rates',delta:dollars(central*.05),rationale:'No additional burden or profit is added to the loaded proxies.'},
    {label:'Role protection choices',change:'Protect every role at the median',delta:dollars(laborTotal(rows,'medianRate')-central),rationale:'Tests the effect of the selected role-level percentile assumptions.'},
  ] : [];
  const ceiling = analysis.evidence.find(e=>e.type==='SOLICITATION_FACT' && e.numeric?.valueType==='CONTRACT_CEILING');
  const ceilingExplanation = ceiling ? `The ${ceiling.id} contract/program ceiling is a spending constraint, not the evaluated labor-and-other-component basket. It does not set PTW or justify clipping the recommendation. Validate the solicitation's distinct ceiling and evaluation language (${ceiling.section || 'locator needed'}).` : 'No program ceiling is used to set the PTW target.';
  const actions: DecisionAction[] = [
    {owner:'Pricing analyst',action:'Validate the highest-dollar role mappings against duties, seniority, certifications, clearance and worksite.',consequence:'Replace unsuitable proxies and recalculate all three strategies.'},
    {owner:'Contracts / pricing',action:missing.length ? missing.slice(0,4).join(' ') : 'Confirm the complete evaluated basket, travel indirect costs, option periods and extension-rate language.',consequence:'Resolve total-price completeness before bid use.'},
    {owner:'Capture lead',action:'Establish an eligible pursuit-specific competitor field and the scored clearance/past-performance thresholds.',consequence:'Reassess competitive pressure; do not assume staffing readiness earns separate evaluation credit.'},
    {owner:'Pricing director',action:'Review the provisional target and its assumptions; validate company execution economics separately in Phase 2.',consequence:'Authorize a market planning position; company bid approval remains a separate decision.'},
  ];
  return {version:COMPETITIVE_POSITION_VERSION,status:hasBasis ? 'PROVISIONAL' : rows.length ? 'PARTIAL_MODEL' : 'NOT_SUPPORTED',priceOrderFirst,evaluationComplete,target,
    rangeLow:hasBasis ? dollars(aggressive+nonLabor) : null,rangeHigh:hasBasis ? dollars(defensive+nonLabor) : null,
    rangeMeaning:'Planning scenario envelope, not a statistical confidence interval, verified competitor-price corridor or approved offer band. Unresolved mapping and component risks may extend beyond these endpoints.',
    rationale:priceOrderFirst ? 'Recommend a price-led market planning position with explicit role protection. Keep required clearance and past performance gates intact; higher delivery spend alone does not establish an evaluated advantage.' : 'Recommend a provisional market-aligned position. Quantify any proposed evaluated advantage before moving above neutral public-rate economics.',
    decisionRequest:target == null ? 'Resolve the missing quantity/rate basis; use the priced rows as partial working material.' : 'Adopt the selected provisional market planning target, subject to the listed validation actions. This is not company bid approval or a prediction of the winning price.',
    rows,components,scenarios,missing:[...new Set(missing)],assumptions:[...new Set(assumptions)],
    unpricedRows:model.quantityRows.filter(r=>!rows.some(priced=>priced.id===r.id)),totalHours:model.totalHours,pricedHours:model.pricedHours,quantityComplete:model.quantityComplete,
    confidence:{quantities:model.quantityComplete && model.quantityRows.every(r=>!r.source.includes('needs validation')) ? 'HIGH' : 'LOW',rateRelevance:!hasBasis || rows.some(r=>r.proxy || r.sampleSize<5 || !r.qualification || r.evidenceIds.some(id=>analysis.evidence.find(e=>e.id===id)?.numeric?.qualificationFit==='UNVALIDATED')) ? 'LOW' : 'MEDIUM',competition:'LOW',execution:'NOT_ASSESSED',overall:'LOW'},
    sensitivities,actions,ceilingExplanation};
}
