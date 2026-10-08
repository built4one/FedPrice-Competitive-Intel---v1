import type { ConfidenceLevel, EvaluatedPriceComponent, OpportunityAnalysis } from '../../types';
import { buildLaborModel, dollars, laborTotal, type LaborCalculationRow, type LaborQuantityRow } from './laborModel';
import { sourceConflictStatus } from '../sourceConsistency';
import { laborFamily, benchmarkRole, roleMappingIssue } from '../laborMatching';
import type { PlanningInput } from '../../types';

export const COMPETITIVE_POSITION_VERSION = 'competitive-position-2.0.0';
export interface CompetitiveScenario {
  id: 'AGGRESSIVE' | 'RECOMMENDED' | 'DEFENSIVE'; label: string; labor: number; nonLabor: number;
  total: number; selected: boolean; rationale: string; condition: string; basis: 'PARTIAL_SUBTOTAL' | 'MODELED_BASKET';
}
export interface PricedLaborRow extends LaborCalculationRow {
  recommendedRate: number; protectionReason: string; low: number; target: number; high: number;
  bidTransformAssumption: string;
}
export interface PricedComponent extends EvaluatedPriceComponent { includedAmount: number; lowAmount?:number; highAmount?:number; assumption: string; }
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
  confidenceLabel: 'STRONG' | 'MODERATE' | 'LIMITED'; confidenceReason: string;
  judgment: Array<{factor:string;finding:string;effect:string;evidenceIds:string[]}>;
  planningRows: PlanningInput[]; assumptionShare:number; basisReconstructed:boolean;
  unpricedRows: LaborQuantityRow[]; totalHours: number; pricedHours: number; quantityComplete: boolean;
}

const positive=(v:unknown):v is number=>typeof v==='number' && Number.isFinite(v) && v>0 && v<1e13;
const unique=(v:string[])=>[...new Set(v.filter(Boolean))];
export function validPlanningInput(p:PlanningInput):boolean {
  return Boolean(p.id && p.label && p.quantitySource && p.rationale && p.lowerCondition && p.upperCondition
    && positive(p.quantity) && positive(p.low) && positive(p.central) && positive(p.high)
    && p.low<=p.central && p.central<=p.high && p.high/p.low<=100
    && (p.kind!=='LABOR_RATE' || p.high<=2500));
}

/** Assumptions complete a known basket; they never masquerade as matched evidence. */
export function calculateCompetitivePosition(analysis: Pick<OpportunityAnalysis,'deal'|'evidence'> & Partial<Pick<OpportunityAnalysis,'marketPosition'|'competitors'|'meta'>>): CompetitivePosition {
  const {deal,evidence}=analysis, model=buildLaborModel(deal,evidence), pricing=deal.evaluationPricing, scheme=deal.evaluationScheme;
  const assumptions=[...model.assumptions];
  const missing=[...model.missing];
  const planningRows=(deal.planningInputs||[]).filter(validPlanningInput);
  const priceOrderFirst=scheme?.method==='SEALED_BID' || scheme?.method==='LPTA' || scheme?.priceWeight==='DOMINANT';
  const evaluationKnown=Boolean(scheme && scheme.method!=='UNKNOWN' && scheme.sourceRefs.some(r=>r.trim()));
  if(!evaluationKnown) missing.push('Confirm the source-selection method and its solicitation locator; the recommendation assumes no evaluated premium.');
  const matchingRows=[...model.rows];
  for(const q of model.quantityRows.filter(q=>!matchingRows.some(r=>r.id===q.id))) {
    const signal=deal.laborSignals.find(s=>s.title===q.title)!;
    let input=planningRows.find(p=>p.kind==='LABOR_RATE' && p.label===q.title);
    if(!input) {
      // A rejected benchmark may bound an assumption only if its occupation agrees
      // with the duties/PWS family. It is not reinstated as a validated rate match.
      const family=laborFamily(benchmarkRole(signal));
      const donors=evidence.filter(e=>(!roleMappingIssue(signal) || Boolean(signal.pwsTitle)) && e.numeric?.units==='USD_PER_HOUR' && e.numeric.valueType==='HOURLY_CEILING_RATE'
        && positive(e.numeric.originalValue) && e.numeric.benchmarkFamily===family);
      if(donors.length) {
        const v=donors.map(e=>e.numeric!.originalValue).sort((a,b)=>a-b);
        input={id:`ASSUMED-${q.title}`,label:q.title,kind:'LABOR_RATE',quantity:1,unit:'loaded USD/hour',quantitySource:q.source,
          low:Math.min(...donors.map(e=>e.numeric!.lowerRate||e.numeric!.originalValue)),central:v[Math.floor(v.length/2)],
          high:Math.max(...donors.map(e=>e.numeric!.upperRate||e.numeric!.originalValue)),basis:'ANALOGY',
          rationale:`Use ${family} evidence only as a bounded occupational analogy; exact qualifications, worksite or clearance fit remain unresolved.`,
          evidenceIds:donors.map(e=>e.id),lowerCondition:'The lower observed rates support the required qualifications.',upperCondition:'The upper observed rates are needed to recruit or retain the specified role.'};
        if(validPlanningInput(input))planningRows.push(input);else input=undefined;
      }
    }
    if(input) {
      matchingRows.push({...q,lowRate:input.low,medianRate:input.central,highRate:input.high,evidenceIds:input.evidenceIds,
        proxy:true,qualification:[signal.duties,signal.clearance,signal.titleConflict].filter(Boolean).join('; '),
        rateLimitation:input.rationale,sampleSize:0,assumedRate:true,assumptionBasis:input.basis});
      assumptions.push(`${q.title}: ${input.central}/hour planning assumption, bounded by ${input.low}–${input.high}. ${input.rationale}`);
    }
  }
  matchingRows.sort((a,b)=>Number(a.id.replace('LAB-',''))-Number(b.id.replace('LAB-','')));
  const knownEvidence=new Set(evidence.map(e=>e.id));
  const competitors=(analysis.competitors||[]).filter(c=>c.sourceRefs?.some(ref=>knownEvidence.has(ref) || evidence.some(e=>e.url===ref)));
  const anchors=(analysis.marketPosition?.anchors||[]).filter(a=>a.included && a.units==='TOTAL_USD' && positive(a.normalizedValue)
    && a.role==='CENTRAL_ANCHOR' && !['EVALUATED_COMPONENT','PROGRAM_TOTAL','MULTIPLE_AWARD_POOL','ORDER_LIMIT','BUDGET','PAST_PERFORMANCE_THRESHOLD'].includes(a.valueBasis||''));
  const comparables=anchors.filter(a=>!a.opportunitySpecific && a.comparabilityScore>=.65);
  const selectedReasons=new Map<string,string>();
  const rows:PricedLaborRow[]=matchingRows.map(r=>{
    const signal=deal.laborSignals.find(s=>s.title===r.title)!;
    const specialist=(signal.minExperienceYears||0)>=5 || /senior|principal|lead|architect|expert|manager|specialist/i.test(`${signal.pwsTitle||signal.title} ${signal.duties||''}`);
    const scarce=Boolean(signal.clearance && !/none|unclassified/i.test(signal.clearance)) || Boolean(signal.certifications?.length);
    const qualified=r.sampleSize>=5 && !r.assumedRate && !signal.titleConflict;
    // Select an observed economic posture, not a blanket percentage reduction.
    const efficient=priceOrderFirst && qualified && !specialist && !scarce;
    const recommendedRate=efficient?r.lowRate:r.medianRate;
    const reason=efficient
      ? 'Price-ordered evaluation: select the observed lower-quartile planning rate for this qualified, broadly supplied role. Validate executable staffing economics.'
      : r.assumedRate ? 'Use the central bounded rate assumption; preserve both alternative mapping economics in the corridor.'
      : specialist || scarce ? 'Protect median economics for documented qualifications, clearance or specialist delivery obligations.'
      : !qualified ? 'Retain median economics because the matched sample is thin or qualifications remain unresolved.'
      : 'Tradeoff or unconfirmed evaluation: retain median economics; no quantified scored advantage supports a premium.';
    selectedReasons.set(r.title,reason);
    return {...r,recommendedRate,protectionReason:reason,bidTransformAssumption:'No ceiling-to-offer discount; select within the documented rate evidence or explicit assumption bounds.',
      low:dollars(r.hours*r.lowRate*r.factor),target:dollars(r.hours*recommendedRate*r.factor),high:dollars(r.hours*r.highRate*r.factor)};
  });
  const components:PricedComponent[]=[];
  const ids=new Set<string>();
  for(const c of pricing?.components||[]) {
    if(ids.has(c.id)){missing.push(`Duplicate component ${c.id}; validate overlap.`);continue;} ids.add(c.id);
    if(c.amount==null || !Number.isFinite(c.amount) || c.amount<0){missing.push(`${c.label}: amount is a planning input requiring validation.`);continue;}
    const indirect=c.indirectTreatment==='KNOWN' && c.indirectPct!=null && c.indirectPct>=0 && c.indirectPct<=100?c.indirectPct:0;
    const assumption=(c.indirectTreatment==='UNKNOWN' || c.indirectTreatment==='KNOWN' && !(c.indirectPct!=null && c.indirectPct>=0 && c.indirectPct<=100))?`${c.label}: zero additional indirect costs in the central case; validate the applicable pool and allocation base.`:'';
    if(assumption){assumptions.push(assumption);missing.push(assumption);}
    if(!c.evidenceIds.some(id=>knownEvidence.has(id)) || !c.source)missing.push(`${c.label}: confirm the amount's controlling source.`);
    components.push({...c,includedAmount:dollars(c.amount*(1+indirect/100)),assumption});
  }
  // Non-labor priced lines use documented evaluated quantities, never labor FTEs.
  for(const p of planningRows.filter(p=>p.kind!=='LABOR_RATE')) {
    const line=pricing?.unitLines?.find(l=>l.id===p.id);
    const component=pricing?.components.find(c=>c.id===p.id && c.amount==null);
    if(!line && !component)continue; // total-value assumptions cannot silently replace or duplicate the basket
    const qty=line?.quantity||1;
    if(!positive(qty) || (line && Math.abs(qty-p.quantity)>.001)) {missing.push(`${p.label}: planning quantity differs from the extracted schedule.`);continue;}
    components.push({id:p.id,label:p.label,category:'OTHER',amount:dollars(qty*p.central),includedAmount:dollars(qty*p.central),lowAmount:dollars(qty*p.low),highAmount:dollars(qty*p.high),
      source:line?.source||component!.source,evidenceIds:p.evidenceIds,indirectTreatment:'NOT_ALLOWED',feeAllowed:false,
      assumption:`${p.basis}: ${qty} ${p.unit} × ${p.central}. ${p.rationale} Lower: ${p.lowerCondition} Upper: ${p.upperCondition}`});
    if(p.basis!=='DOCUMENTED') assumptions.push(components[components.length-1].assumption);
  }
  const unpricedRows=model.quantityRows.filter(q=>!rows.some(r=>r.id===q.id));
  const uncoveredUnits=(pricing?.unitLines||[]).filter(l=>!components.some(c=>c.id===l.id));
  const uncoveredComponents=(pricing?.components||[]).filter(c=>!components.some(p=>p.id===c.id));
  const hasLabor=deal.laborSignals.length>0;
  const hasUnits=Boolean(pricing?.unitLines?.length || pricing?.components.length);
  const quantityReconstructed=hasLabor?model.quantityComplete || (model.quantityRows.length>0 && !model.missing.some(m=>/period coverage|no documented quantity|no quantified|incomplete|does not cover/i.test(m))):hasUnits;
  const wholeAnchor=!hasLabor && !hasUnits && anchors.length>0 && Boolean(pricing?.basis && pricing?.source);
  const basisReconstructed=Boolean(quantityReconstructed || wholeAnchor);
  const allPriced=Boolean((rows.length || components.length) && !unpricedRows.length && !uncoveredUnits.length && !uncoveredComponents.length && quantityReconstructed);
  uncoveredUnits.forEach(l=>missing.push(`${l.label}: a bounded unit-price assumption is still needed.`));
  const lowLabor=dollars(rows.reduce((s,r)=>s+r.low,0)),centralLabor=dollars(rows.reduce((s,r)=>s+r.target,0)),highLabor=dollars(rows.reduce((s,r)=>s+r.high,0));
  let low=dollars(lowLabor+components.reduce((s,c)=>s+(c.lowAmount??c.includedAmount),0));
  let central=dollars(centralLabor+components.reduce((s,c)=>s+c.includedAmount,0));
  let high=dollars(highLabor+components.reduce((s,c)=>s+(c.highAmount??c.includedAmount),0));
  if(wholeAnchor){
    const sorted=anchors.map(a=>a.normalizedValue!).sort((a,b)=>a-b);
    low=sorted[0];high=sorted[sorted.length-1];
    // Preserve opportunity-specific magnitude bounds; their midpoint is explicitly a planning hypothesis.
    central=dollars(sorted.reduce((s,v)=>s+v,0)/sorted.length);
    assumptions.push('Whole-basket reference case uses the center of qualified normalized total-value evidence. The endpoints are evidence bounds, not predicted winning bids.');
  }
  const hasTarget=(allPriced || wholeAnchor) && positive(central) && low<=central && central<=high;
  const assumedAmount=rows.filter(r=>r.assumedRate).reduce((s,r)=>s+r.target,0)+components.filter(c=>c.assumption).reduce((s,c)=>s+c.includedAmount,0);
  const assumptionShare=central>0?Math.min(1,assumedAmount/central):1;
  const quantityConfidence=model.quantityComplete || !hasLabor && pricing?.completeness==='COMPLETE'?'HIGH':'LOW';
  const rateConfidence=assumptionShare>.2 || unpricedRows.length || rows.some(r=>r.sampleSize<5)?'LOW':rows.some(r=>r.proxy || r.evidenceIds.some(id=>evidence.find(e=>e.id===id)?.numeric?.qualificationFit==='UNVALIDATED'))?'MEDIUM':rows.length?'HIGH':planningRows.some(p=>p.basis==='PLANNING_ASSUMPTION')?'LOW':'MEDIUM';
  const competitionConfidence=competitors.length>=2 && comparables.length>=2?'HIGH':comparables.length || competitors.length>=2?'MEDIUM':'LOW';
  const divergence=comparables.length && central>0 ? Math.max(...comparables.map(a=>Math.abs(a.normalizedValue!-central)/central)):0;
  const packageGaps=analysis.meta?.packageCoverage?.documents.filter(d=>['UNREADABLE','UNSUPPORTED','EXCERPTS'].includes(d.status))||[];
  const overall:ConfidenceLevel=packageGaps.length>0 || !hasTarget || !evaluationKnown || rateConfidence==='LOW' || divergence>.4 || assumptionShare>.2?'LOW':quantityConfidence==='HIGH' && rateConfidence==='HIGH' && competitionConfidence==='HIGH'?'HIGH':'MEDIUM';
  const confidenceLabel=overall==='HIGH'?'STRONG':overall==='MEDIUM'?'MODERATE':'LIMITED';
  const confidenceReason=overall==='LOW'
    ? `Use as a provisional planning position. ${packageGaps.length?`${packageGaps.length} package documents need review; omitted requirements could change price. `:''}${!evaluationKnown?'Evaluation posture needs confirmation. ':''}${assumptionShare>0?`${Math.round(assumptionShare*100)}% of modeled price depends on explicit pricing assumptions. `:''}${divergence>.4?'Comparable evidence materially disagrees with the model. ':''}Validate the largest price driver before adopting the target.`
    : overall==='MEDIUM'?'Use to frame the pricing decision. The evaluated basket and rate evidence support this position; competing bids and the most influential mapping judgments still need validation.'
    : 'Use as a well-supported market position. The evaluated basket, qualified rates and independent comparable/competitive evidence converge. This is not a probability of winning.';
  const judgment:CompetitivePosition['judgment']=[
    {factor:'Government evaluation',finding:deal.evaluationMethod||'Selection method unconfirmed',effect:priceOrderFirst?'Select supported efficient economics where qualifications permit; protect mandatory gates.':'No premium is added without a quantified advantage under the scored factors.',evidenceIds:scheme?.sourceRefs||[]},
    {factor:'Opportunity economics',finding:`${rows.length} labor rows and ${components.length} evaluated non-labor components form the price.`,effect:'Preserve required scope, options and fixed components. Program ceilings are not divided among awardees.',evidenceIds:components.flatMap(c=>c.evidenceIds)},
    {factor:'Labor and unit-price evidence',finding:`${new Set(rows.filter(r=>r.recommendedRate===r.lowRate && r.lowRate<r.medianRate).map(r=>r.title)).size} roles use efficient rates; ${new Set(rows.filter(r=>r.recommendedRate===r.medianRate).map(r=>r.title)).size} retain central economics.`,effect:'Each rate choice has a specific qualification, evidence or evaluation reason; no universal discount.',evidenceIds:unique(rows.flatMap(r=>r.evidenceIds))},
    {factor:'Predecessor / comparables',finding:comparables.length?`${comparables.length} comparable normalized totals available${divergence>.4?'; material divergence needs reconciliation':''}.`:'No sufficiently comparable whole-contract award baseline established.',effect:comparables.length?'Use as an independent reasonableness challenge; do not average mismatched awards into the basket.':'Retain the bottom-up recommendation and reduce confidence; no fabricated award anchor.',evidenceIds:comparables.map(a=>a.evidenceId)},
    {factor:'Competitive conditions',finding:competitors.length?`${competitors.length} source-linked potential competitors; participation and bids are not confirmed.`:'Pursuit-specific rival field remains unconfirmed.',effect:'Evaluation pressure shapes the posture; competitor names alone do not earn a dollar adjustment.',evidenceIds:unique(competitors.flatMap(c=>c.sourceRefs))},
    {factor:'Bounded assumptions',finding:`${Math.round(assumptionShare*100)}% of modeled dollars use explicit pricing assumptions.`,effect:'The corridor includes their lower and upper economic cases; validate the highest-impact assumption first.',evidenceIds:unique(planningRows.flatMap(p=>p.evidenceIds))},
  ];
  const rationale=priceOrderFirst?'Price for the qualifying competitive cohort: use evidenced efficiencies where supply is credible, while protecting required qualifications and delivery obligations.':'Price to the evaluated scope and supported delivery economics. A tradeoff permits a premium only when a scored, evidenced advantage justifies it.';
  const basis=hasTarget?'MODELED_BASKET' as const:'PARTIAL_SUBTOTAL' as const;
  const scenarios:CompetitiveScenario[]=central>0?[
    {id:'AGGRESSIVE',label:'Competitive lower',labor:wholeAnchor?0:lowLabor,nonLabor:wholeAnchor?low:dollars(low-lowLabor),total:low,selected:false,basis,rationale:'Lower supported rates and lower bounded component assumptions.',condition:'Validate that required scope and qualifications can be delivered at these economics.'},
    {id:'RECOMMENDED',label:hasTarget?'Recommended PTW':'Known-scope subtotal',labor:wholeAnchor?0:centralLabor,nonLabor:wholeAnchor?central:dollars(central-centralLabor),total:central,selected:hasTarget,basis,rationale:[...new Set(selectedReasons.values())].join(' ') || 'Center the qualified whole-basket evidence or explicit unit-price model.',condition:'Adopt with the stated assumptions and source-selection rules; company bid approval is separate.'},
    {id:'DEFENSIVE',label:'Competitive upper',labor:wholeAnchor?0:highLabor,nonLabor:wholeAnchor?high:dollars(high-highLabor),total:high,selected:false,basis,rationale:'Upper observed rate and bounded component exposure.',condition:'Higher execution spend does not imply the Government will pay a premium.'}]:[];
  const sensitivities:PriceSensitivity[]=[];
  if(rows.length){
    sensitivities.push({label:'All starting labor rates',change:'+$1/hour',delta:dollars(rows.reduce((s,r)=>s+r.hours*r.factor,0)),rationale:'Exact evaluated hours × period factors; fixed components unchanged.'});
    const roles=[...new Set(rows.map(r=>r.title))].map(title=>({title,delta:dollars(rows.filter(r=>r.title===title).reduce((s,r)=>s+10*r.hours*r.factor,0))})).sort((a,b)=>b.delta-a.delta);
    roles.slice(0,3).forEach(r=>sensitivities.push({label:r.title,change:'+$10/hour',delta:r.delta,rationale:'Isolated rate change for this role across all evaluated periods.'}));
    sensitivities.push({label:'Annual escalation',change:'+1 percentage point',delta:dollars(rows.reduce((s,r)=>s+r.hours*r.recommendedRate*(r.rateYearWeights.reduce((v,w)=>v+w.weight*(1+(model.escalationPct+1)/100)**w.year,0)-r.factor),0)),rationale:'Same hours and extension convention; only escalation changes.'});
  }
  components.filter(c=>c.highAmount!=null).sort((a,b)=>(b.highAmount!-b.includedAmount)-(a.highAmount!-a.includedAmount)).slice(0,3).forEach(c=>sensitivities.push({label:c.label,change:'Upper planning assumption',delta:dollars(c.highAmount!-c.includedAmount),rationale:c.assumption}));
  if(components.some(c=>c.indirectTreatment==='UNKNOWN'))sensitivities.push({label:'Permitted component indirects',change:'+1 percentage point',delta:dollars(components.filter(c=>c.indirectTreatment==='UNKNOWN').reduce((s,c)=>s+(c.amount||0)*.01,0)),rationale:'Only on components allowing indirect recovery; no labor burden or travel fee is added.'});
  const highest=[...rows].sort((a,b)=>b.target-a.target)[0];
  const actions:DecisionAction[]=[
    {owner:'Pricing lead',action:assumptionShare>0?'Validate the largest assumed rate or unit price against an executable quote and update its bounds.':`Validate ${highest?.title||'the largest evaluated component'} and its price basis.`,consequence:'Recalculate the target and corridor from that input.'},
    {owner:'Capture lead',action:competitionConfidence==='LOW'?'Verify the eligible bidder field and predecessor scope; document facts that change competitive pressure.':'Reconcile the model with the strongest normalized comparable and verify pursuit participation.',consequence:'Strengthen recommendation confidence without inventing rival bids.'},
    {owner:'Contracts / pricing',action:evaluationKnown?'Confirm latest amendments, all evaluated periods and the stated selection sequence.':'Confirm the selection method and evaluated-price formula.',consequence:'Preserve compliance while selecting a market position.'},
  ];
  deal.sourceConflicts?.filter(c=>sourceConflictStatus(c,deal)==='OPEN').forEach(c=>missing.push(`${c.topic}: ${c.resolution}`));
  const evaluationComplete=Boolean(hasTarget && pricing?.completeness==='COMPLETE' && evaluationKnown && !unpricedRows.length && !assumptionShare && !missing.length);
  const status:CompetitivePosition['status']=hasTarget?(evaluationComplete?'FULL':'CONDITIONAL'):central>0?'PARTIAL':'NOT_SUPPORTABLE';
  assumptions.push('Public loaded rates are price proxies, not company cost. No second labor burden, profit or universal ceiling-to-offer discount is applied.',
    'Corridor endpoints are conditional economic cases, not observed competitor bids, a statistical interval or a win probability.');
  return {version:COMPETITIVE_POSITION_VERSION,status,priceOrderFirst,evaluationComplete,target:hasTarget?central:null,rangeLow:hasTarget?low:null,rangeHigh:hasTarget?high:null,
    rangeMeaning:'Competitive corridor from the evaluated basket, observed rate variation and explicit lower/upper pricing assumptions. It is a decision range, not a confidence interval.',
    rationale,decisionRequest:hasTarget?'Use the Recommended PTW as the working competitive position; validate the highest-impact assumption before committing an offer.':'Reconstruct the missing evaluated quantity or component basis shown below; the known-scope subtotal is retained.',
    rows,components,scenarios,missing:unique(missing),assumptions:unique(assumptions),
    confidence:{quantities:quantityConfidence,rateRelevance:rateConfidence,competition:competitionConfidence,execution:'NOT_ASSESSED',overall},
    confidenceLabel,confidenceReason,judgment,planningRows,assumptionShare,basisReconstructed,sensitivities,actions,
    ceilingExplanation:'A program ceiling does not set PTW and is never divided among awardees. The Government’s evaluated basket controls; reconcile any inconsistency against the solicitation.',
    unpricedRows,totalHours:model.totalHours,pricedHours:rows.reduce((s,r)=>s+r.hours,0),quantityComplete:model.quantityComplete};
}
