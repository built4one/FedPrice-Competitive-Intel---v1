import type { ConfidenceLevel, EvaluatedPriceComponent, OpportunityAnalysis } from '../../types';
import { buildLaborModel, dollars, laborTotal, type LaborCalculationRow, type LaborQuantityRow } from './laborModel';
import { sourceConflictStatus } from '../sourceConsistency';
import { determineBidTransform, applyBidTransform } from './bidTransform';

export const COMPETITIVE_POSITION_VERSION = 'competitive-position-1.3.0';
export interface CompetitiveScenario {
  id: 'AGGRESSIVE' | 'RECOMMENDED' | 'DEFENSIVE'; label: string; labor: number; nonLabor: number;
  total: number; selected: boolean; rationale: string; condition: string; basis: 'PARTIAL_SUBTOTAL' | 'MODELED_BASKET';
}
export interface PricedLaborRow extends LaborCalculationRow {
  recommendedRate: number; protectionReason: string; low: number; target: number; high: number;
  bidTransformAssumption: string;
}
export interface PricedComponent extends EvaluatedPriceComponent { includedAmount: number; assumption: string; }
export interface DecisionAction { owner: string; action: string; consequence: string; }
export interface PriceSensitivity { label: string; change: string; delta: number; rationale: string; }
export interface CompetitivePosition {
  version: string; status: 'FULL' | 'CONDITIONAL' | 'PARTIAL' | 'NOT_SUPPORTABLE';
  priceOrderFirst: boolean; evaluationComplete: boolean; target: number | null;
  rangeLow: number | null; rangeHigh: number | null; rangeMeaning: string;
  rationale: string; decisionRequest: string; rows: PricedLaborRow[]; components: PricedComponent[];
  scenarios: CompetitiveScenario[]; missing: string[]; assumptions: string[];
  confidence: {quantities:ConfidenceLevel;rateRelevance:ConfidenceLevel;competition:ConfidenceLevel;execution:'NOT_ASSESSED';overall:ConfidenceLevel};
  sensitivities: PriceSensitivity[]; actions: DecisionAction[]; ceilingExplanation: string;
  unpricedRows: LaborQuantityRow[]; totalHours: number; pricedHours: number; quantityComplete: boolean;
}

function protectRole(analysis: Pick<OpportunityAnalysis,'deal'|'evidence'>, row: LaborCalculationRow) {
  const s = analysis.deal.laborSignals.find(s=>s.title === row.title)!;
  const specialization = [s.pwsTitle || s.title, s.duties || '', s.certifications?.join(' ') || ''].join(' ');
  if (s.titleConflict) return 'Protect expected market economics while the source-role conflict is resolved; test alternative mappings.';
  if ((s.minExperienceYears ?? 0) >= 5 || /\bsenior\b|\bprincipal\b|\blead\b|manager|director|architect|expert|specialist/i.test(specialization))
    return 'Protect the expected rate as a planning assumption for documented seniority, specialist responsibilities or operational bottlenecks.';
  if (row.proxy || row.sampleSize < 5) return 'Protect expected market economics because the proxy mapping or small sample is weak; do not presume aggressive low rates are executable.';
  if (s.clearance && !/unclassified|none/i.test(s.clearance)) return 'Protect the expected rate because cleared labor commands a market premium and introduces retention risk.';
  return '';
}

export function calculateCompetitivePosition(analysis: Pick<OpportunityAnalysis,'deal'|'evidence'>): CompetitivePosition {
  const model = buildLaborModel(analysis.deal, analysis.evidence);
  const scheme = analysis.deal.evaluationScheme;
  const missing = [...model.missing];
  if (!scheme || scheme.method === 'UNKNOWN' || !scheme.sourceRefs.some(ref=>ref.trim()))
    missing.push('Confirm the source-selection method with a solicitation locator before treating the evaluated-price model as complete.');
  if(model.rows.some(r=>r.assumedHours)) missing.push('Replace assumed annual hours with the specified evaluated hours before treating this as a complete evaluated-price model.');
  analysis.deal.sourceConflicts?.filter(c=>sourceConflictStatus(c,analysis.deal)==='OPEN').forEach(c=>missing.push(`Resolve ${c.topic}: ${c.descriptions.join(' versus ')}. ${c.resolution}`));
  
  const bidTransform = determineBidTransform(analysis.deal);
  const assumptions = [...model.assumptions,
    'All role percentiles and protections are analyst planning assumptions. Public fully burdened ceiling rates include embedded burdens/fee; do not add them again.',
    'No dollar premium, productivity saving, teaming saving or probability of win is inferred from qualitative strategy prose.',
    bidTransform.rationale,
    'Competitive PTW confidence remains low: public-rate arithmetic does not validate rival bidding behavior or company execution feasibility.'];

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
  
  const priceOrderFirst = scheme?.method === 'LPTA' || scheme?.priceWeight === 'DOMINANT';
  
  const rows: PricedLaborRow[] = model.rows.map(r=>{
    const protectionReason = priceOrderFirst ? protectRole(analysis,r)
      : 'Use median public-rate economics for tradeoff or unknown evaluation; no quantified evaluated advantage supports a premium or reduction.';
    // Base market rate choice
    const marketExpected = r.medianRate;
    const marketAggressive = r.lowRate;
    const marketDefensive = r.highRate;

    // Apply the bid discount logic to public ceiling rates
    const transformedExpected = applyBidTransform(marketExpected, bidTransform);
    const transformedAggressive = applyBidTransform(marketAggressive, bidTransform);
    const transformedDefensive = applyBidTransform(marketDefensive, bidTransform);

    // Recommended rate uses the expected (protected) or aggressive (unprotected)
    const recommendedRate = protectionReason ? transformedExpected : transformedAggressive;
    
    return {...r,
      recommendedRate,
      protectionReason: protectionReason || 'Role is unprotected; assume aggressive market posture.',
      bidTransformAssumption: bidTransform.rationale,
      low:dollars(r.hours*transformedAggressive*r.factor),
      target:dollars(r.hours*recommendedRate*r.factor),
      high:dollars(r.hours*transformedDefensive*r.factor)};
  });
  
  const nonLabor = dollars(components.reduce((a,c)=>a+c.includedAmount,0));
  const aggressive = dollars(rows.reduce((a,r)=>a+r.low,0));
  const central = dollars(rows.reduce((a,r)=>a+r.target,0));
  const defensive = dollars(rows.reduce((a,r)=>a+r.high,0));
  
  const hasBasis = model.complete;
  const lowerRoles = new Set(rows.filter(r=>r.protectionReason === 'Role is unprotected; assume aggressive market posture.').map(r=>r.title));
  const medianRoles = new Set(rows.filter(r=>r.protectionReason !== 'Role is unprotected; assume aggressive market posture.').map(r=>r.title));
  
  const selectionRationale = lowerRoles.size
    ? `Apply aggressive market posture to ${lowerRoles.size} role(s) and expected market posture to ${medianRoles.size} role(s), based on the documented protection choices.`
    : `Every priced role uses its expected market posture. No aggressive reduction is applied.`;
  
  const basis = hasBasis ? 'MODELED_BASKET' as const : 'PARTIAL_SUBTOTAL' as const;
  const evaluationComplete = hasBasis && pricing?.completeness === 'COMPLETE' && !missing.length;
  // Rule 4: Handle incomplete evidence by materiality (FULL, CONDITIONAL, PARTIAL, NOT SUPPORTABLE).
  const target = hasBasis ? dollars(central+nonLabor) : null;
  
  const scenarios: CompetitiveScenario[] = rows.length ? [
    {id:'AGGRESSIVE',label:'Aggressive',labor:aggressive,nonLabor,total:dollars(aggressive+nonLabor),selected:false,basis,rationale:'Aggressive transformed rates test the lowest public-rate planning posture.',condition:'Requires validated recruitment/retention economics and mandatory qualifications; it is not a cost floor.'},
    {id:'RECOMMENDED',label:hasBasis?'Recommended':'Working median / protected case',labor:central,nonLabor,total:dollars(central+nonLabor),selected:hasBasis,basis,rationale:selectionRationale,condition:'Validate influential mappings, all evaluated components and eligible competitive pressure before adopting the target.'},
    {id:'DEFENSIVE',label:'Defensive stress case',labor:defensive,nonLabor,total:dollars(defensive+nonLabor),selected:false,basis,rationale:'Higher transformed rates test higher labor-price exposure.',condition:'A higher price requires an evidenced benefit under scored factors; internal cost increases do not establish willingness to pay.'},
  ] : [];
  
  const shift = dollars(rows.reduce((a,r)=>a+r.hours*r.factor,0));
  const byRole = [...new Set(rows.map(r=>r.title))].map(title=>({title,delta:dollars(rows.filter(r=>r.title===title).reduce((a,r)=>a+r.hours*r.factor*10,0))})).sort((a,b)=>b.delta-a.delta);
  const escalationUp = dollars(rows.reduce((a,r)=>a+r.hours*r.recommendedRate*(r.rateYearWeights.reduce((sum,w)=>sum+w.weight*(1+(model.escalationPct+1)/100)**w.year,0)-r.factor),0));
  const sensitivities: PriceSensitivity[] = rows.length ? [
    {label:'All starting labor rates',change:'+$1/hour',delta:shift,rationale:'Sum of evaluated hours times the documented escalation factors; fixed components remain unchanged.'},
    ...byRole.slice(0,3).map(r=>({label:r.title,change:'+$10/hour',delta:r.delta,rationale:'Isolated role-rate change; no change to staffing quantities or other roles.'})),
    {label:'Annual escalation',change:'+1 percentage point',delta:escalationUp,rationale:'Planning sensitivity; preserve the extension convention and compare annual rate assumptions.'},
    {label:'Recommended labor economics',change:'+5% loaded labor rates',delta:dollars(central*.05),rationale:'No additional burden or profit is added to the loaded proxies.'},
  ] : [];
  
  const ceiling = analysis.evidence.find(e=>e.type==='SOLICITATION_FACT' && e.numeric?.valueType==='CONTRACT_CEILING');
  const ceilingExplanation = ceiling ? `The ${ceiling.id} contract/program ceiling is a spending constraint, not the evaluated labor-and-other-component basket. It does not set PTW or justify clipping the recommendation. Validate the solicitation's distinct ceiling and evaluation language (${ceiling.section || 'locator needed'}).` : 'No program ceiling is used to set the PTW target.';
  const actions: DecisionAction[] = [
    {owner:'Pricing analyst',action:'Validate the highest-dollar role mappings against duties, seniority, certifications, clearance and worksite.',consequence:'Replace unsuitable proxies and recalculate all three strategies.'},
    {owner:'Contracts / pricing',action:missing.length ? missing.slice(0,4).join(' ') : 'Confirm the complete evaluated basket, travel indirect costs, option periods and extension-rate language.',consequence:'Resolve total-price completeness before bid use.'},
    {owner:'Capture lead',action:'Establish an eligible pursuit-specific competitor field and the scored clearance/past-performance thresholds.',consequence:'Reassess competitive pressure; do not assume staffing readiness earns separate evaluation credit.'},
    {owner:'Pricing director',action:'Review the provisional target and its assumptions; validate company execution economics separately in Phase 2.',consequence:'Authorize a market planning position; company bid approval remains a separate decision.'},
  ];

  // Overall PTW confidence cannot exceed competition confidence, which remains
  // LOW until pursuit-specific rival pricing and execution economics are earned.
  const overallConfidence = 'LOW';
  const newStatus = hasBasis && !missing.length ? 'FULL' : hasBasis ? 'CONDITIONAL' : rows.length ? 'PARTIAL' : 'NOT_SUPPORTABLE';

  return {version:COMPETITIVE_POSITION_VERSION,status:newStatus,priceOrderFirst,evaluationComplete,target,
    rangeLow:hasBasis ? dollars(aggressive+nonLabor) : null,rangeHigh:hasBasis ? dollars(defensive+nonLabor) : null,
    rangeMeaning:'Public-rate planning scenario envelope, not observed competitor bids or a statistical confidence interval. No automatic ceiling-to-offer discount is applied. Unresolved mapping and component risks may extend beyond these endpoints.',
    rationale:priceOrderFirst ? 'Recommend a price-led market planning position with explicit role protection. Keep required clearance and past performance gates intact; higher delivery spend alone does not establish an evaluated advantage.' : 'Recommend a provisional market-aligned position based on the evaluation scheme. Quantify any proposed evaluated advantage before moving above neutral public-rate economics.',
    decisionRequest:target == null ? 'Resolve the missing quantity/rate basis; use the priced rows as partial working material.' : 'Adopt the selected provisional market planning target, subject to the listed validation actions. This is not company bid approval or a prediction of the winning price.',
    rows,components,scenarios,missing:[...new Set(missing)],assumptions:[...new Set(assumptions)],
    unpricedRows:model.quantityRows.filter(r=>!rows.some(priced=>priced.id===r.id)),totalHours:model.totalHours,pricedHours:model.pricedHours,quantityComplete:model.quantityComplete,
    confidence:{quantities:model.quantityComplete && model.quantityRows.every(r=>!r.source.includes('needs validation')) ? 'HIGH' : 'LOW',rateRelevance:!hasBasis || rows.some(r=>r.proxy || r.sampleSize<5 || !r.qualification || r.evidenceIds.some(id=>analysis.evidence.find(e=>e.id===id)?.numeric?.qualificationFit==='UNVALIDATED')) ? 'LOW' : 'MEDIUM',competition:'LOW',execution:'NOT_ASSESSED',overall:overallConfidence},
    sensitivities,actions,ceilingExplanation};
}
