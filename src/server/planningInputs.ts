import {blindHistoricalInput} from './historical';
import type { DealProfile, EvidenceItem, PlanningInput } from '../types';
import { OpenAIIntelligence, type LegacySchema } from './openaiIntelligence';
import { buildLaborModel } from '../domain/ptw/laborModel';
import { validPlanningInput } from '../domain/ptw/competitivePosition';

const fields={id:{type:'STRING'},label:{type:'STRING'},kind:{type:'STRING',enum:['LABOR_RATE','UNIT_PRICE','TOTAL']},quantity:{type:'NUMBER'},unit:{type:'STRING'},quantitySource:{type:'STRING'},low:{type:'NUMBER'},central:{type:'NUMBER'},high:{type:'NUMBER'},basis:{type:'STRING',enum:['ANALOGY','PLANNING_ASSUMPTION']},rationale:{type:'STRING'},evidenceIds:{type:'ARRAY',items:{type:'STRING'}},lowerCondition:{type:'STRING'},upperCondition:{type:'STRING'}};
const schema:LegacySchema={type:'OBJECT',properties:{inputs:{type:'ARRAY',items:{type:'OBJECT',properties:fields,required:Object.keys(fields)}}},required:['inputs']};

/** Bounded planning hypotheses are stored separately from source facts and rates. */
export async function completePlanningInputs(deal:DealProfile,evidence:EvidenceItem[],client=new OpenAIIntelligence(undefined,undefined,fetch,75_000),batchSize=Infinity,cutoff?:string):Promise<string[]> {
  const model=buildLaborModel(deal,evidence);
  const missingRoles=[...new Set(model.quantityRows.filter(q=>!model.rows.some(r=>r.id===q.id)).map(q=>q.title))];
  const needs=[...missingRoles.map(title=>({id:`PLAN-${title}`,label:title,kind:'LABOR_RATE',quantity:1,unit:'loaded USD/hour',quantitySource:deal.laborSignals.find(s=>s.title===title)?.section||model.quantityRows.find(q=>q.title===title)?.source})),
    ...(deal.evaluationPricing?.unitLines||[]).map(l=>({...l,kind:'UNIT_PRICE',quantitySource:l.source})),
    ...(deal.evaluationPricing?.components||[]).filter(c=>c.amount==null).map(c=>({id:c.id,label:c.label,kind:'TOTAL',quantity:1,unit:'evaluated total USD',quantitySource:c.source}))];
  const existing=(deal.planningInputs||[]).filter(p=>validPlanningInput(p)&&needs.some(n=>n.id===p.id&&n.kind===p.kind&&n.label===p.label&&n.quantity===p.quantity));
  const pending=needs.filter(n=>!existing.some(p=>p.id===n.id));
  if(!pending.length)return [];
  const batch=pending.slice(0,batchSize);
  const sourceEvidence=evidence.filter(e=>e.numeric || e.type==='SOLICITATION_FACT').map(e=>{const n=e.numeric;return {...e,numeric:n?{...n,rateDistribution:undefined,rateRecords:n.rateRecords?.slice(0,3)}:undefined};});
  const promptDeal=cutoff?blindHistoricalInput(deal,deal):deal;
  const promptEvidence=cutoff?blindHistoricalInput(sourceEvidence,deal):sourceEvidence;
  const answer=await client.interpret<{inputs:PlanningInput[]}>(`Develop bounded pricing assumptions for the exact missing price inputs below. You are a Federal pricing analyst. The recommendation must cover every reconstructable evaluated quantity.
${cutoff?`HISTORICAL CUTOFF: ${cutoff}. Opportunity identifiers are withheld. Use only the admitted evidence. Any estimate based on general model knowledge is an unvalidated retrospective approximation; do not claim contemporaneous market verification.`:""}
These are explicitly PROVISIONAL PLANNING HYPOTHESES, never extracted facts, verified prices, vendor quotes, or competitor bids. They will be visibly labeled, with limited recommendation confidence.
Use a relevant cited numeric input first. Explain any occupational analogy and qualifications/worksite differences. If no relevant price exists, make a transparent engineering estimate from the actual work, units, technical requirements and ordinary procurement economics. Explain the concrete cost drivers, arithmetic and scope behind low/central/high. Do not apply universal discounts or blanket contingency percentages. Do not invent sources or citations. An unsupported hypothesis must have basis PLANNING_ASSUMPTION and no evidence IDs. An ANALOGY must cite a genuinely relevant numeric evidence ID and state why comparable.
Each bound must describe a plausible delivery condition. central must be between positive low/high. Labor rates must be fully burdened offered-price planning proxies, not wages. Never add a second burden or profit. Do not use a ceiling, travel allowance or past-performance threshold as a full contract estimate. Do not invent quantities, CLINs, dates or evaluation rules. Copy the supplied id, label, kind, quantity, unit and quantitySource exactly. For a role title conflict, price PWS duties as the explicit central assumption and bound the alternative occupation; do not silently resolve the source conflict. Do not use known awards for this target solicitation.
Return exactly one input per requested item. Existing items are not to be repriced.
REQUESTED INPUTS: ${JSON.stringify(batch)}
DEAL: ${JSON.stringify(promptDeal)}
SOURCE EVIDENCE: ${JSON.stringify(promptEvidence)}`,schema);
  const warnings:string[]=[];
  const inputs:PlanningInput[]=[...existing];
  for(const need of batch){
    const p=answer.inputs?.find(p=>p.id===need.id && p.label===need.label && p.kind===need.kind);
    if(!p || !validPlanningInput(p) || p.quantity!==need.quantity){warnings.push(`${need.label}: bounded pricing assumption failed validation; retry price completion.`);continue;}
    // The caller cannot promote an invented citation or a general URL into an anchor.
    p.evidenceIds=(p.evidenceIds||[]).filter(id=>evidence.some(e=>e.id===id && e.numeric));
    if(!p.evidenceIds.length)p.basis='PLANNING_ASSUMPTION';
    p.quantitySource=need.quantitySource||p.quantitySource;
    inputs.push(p);
  }
  deal.planningInputs=inputs;
  return warnings;
}
