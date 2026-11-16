import type {OpportunityAnalysis} from '../types';
import {calculateCompetitivePosition} from '../domain/ptw/competitivePosition';
export const compactMoney=(n:number|null|undefined)=>n==null||!Number.isFinite(n)?'Price basis needs clarification':`${n<0?'-':''}$${Math.abs(n)>=1e6?(Math.abs(n)/1e6).toFixed(2)+'M':Math.abs(n)>=1e3?(Math.abs(n)/1e3).toFixed(1)+'K':Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const labels:Record<string,string>={UNKNOWN:'Not stated in solicitation',UNVERIFIED:'Needs verification',UNAVAILABLE:'Not available',NOT_ASSESSED:'Not yet assessed',SOLICITATION_ONLY:'Uploaded package only',PARTIAL:'Some evidence missing',ADMITTED:'Included after source checks',EXCLUDED:'Not used',FAILED:'Could not complete',RUNNING:'In progress',COMPLETE:'Complete',DISCOVERED:'Found; review pending',READ:'Read; evidence review pending',NOT_SUPPORTABLE:'Price basis needs clarification',RETROSPECTIVE_APPROXIMATION:'Historical estimate pending review',PLANNING_ASSUMPTION:'AI planning estimate',EXTERNAL_SOURCE:'External source',SOLICITATION_FACT:'Solicitation fact',TARGET_OUTCOME:'Award outcome withheld'};
export function displayText(value:unknown):string {
 let s=String(value??'');
 if(/(?:ZodError|\btoo_big\b|\bstack trace\b|\bTypeError:|\bArray must contain|\bHTTP [45]\d\d|\bOpenAI request failed|\"(?:error|issues|path)\"\s*:)/i.test(s))return 'A source or analysis step could not complete. Available evidence was retained; confidence is limited.';
 s=s.replace(/executable quote/gi,'supplier quote').replace(/eligible bidder field/gi,'eligible competitors').replace(/predecessor scope/gi,'earlier contract scope').replace(/stated selection sequence/gi,'award rules').replace(/bounded pricing assumptions?/gi,'estimated prices');
 s=s.replace(/\b0 roles use efficient rates; (\d+) retain central economics\./g,'$1 roles use central planning rates; no rate discount is assumed.');
 s=s.replace(/\b(?:Unknown|UNKNOWN)\b/g,'Not stated in solicitation');
 if(labels[s])return labels[s];
 s=s.replace(/\b(?:UNVERIFIED|UNAVAILABLE|NOT_ASSESSED|SOLICITATION_ONLY|RETROSPECTIVE_APPROXIMATION|PLANNING_ASSUMPTION|EXTERNAL_SOURCE|SOLICITATION_FACT)\b/g,v=>labels[v]||v);
 s=s.replace(/\b(?:factor|multiplier)\s+(\d+\.\d+)/gi,(_,n)=>`adjustment ${Number(n).toLocaleString('en-US',{maximumFractionDigits:2})}`);
 s=s.replace(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g,v=>labels[v]||v.toLowerCase().replaceAll('_',' '));
 return s.replace(/\b\d+\.\d{3,}\b/g,v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:2}));
}
/** Presentation only: numerical inputs, stored evidence and formulas are untouched. */
export function present(value:any):any {return typeof value==='string'?displayText(value):typeof value==='number'?Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:2}):'Not stated in solicitation':value;}
const sentence=(s:string,max=155)=>{const v=displayText(s).replace(/\s+/g,' ').trim();if(v.length<=max)return v;const first=v.split(/(?<=[.!?])\s/)[0];return first.length<=max?first:v.slice(0,max-1).replace(/\s+\S*$/,'')+'…';};
export function executiveBrief(a:OpportunityAnalysis){
 const p=calculateCompetitivePosition(a),estimate=a.meta.contingencyEstimate;
 const rates=a.evidence.filter(e=>e.numeric?.valueType==='HOURLY_CEILING_RATE');
 const basis=estimate?`AI estimate for the whole package; ${rates.length?'sourced rate references exist, but do not establish this total':'no sourced rates found'}.`:p.assumptionShare>0?`${Math.round(p.assumptionShare*100)}% of the modeled price uses estimates; source-backed inputs are identified in the detail.`:'Calculated from the evaluated quantities and matched source-backed pricing inputs.';
 const why=estimate?[
  'The price covers the whole package, including work missing from the populated pricing rows.',
  `Performance period: ${a.deal.performanceMonths?`${a.deal.performanceMonths} months`:sentence(a.deal.periodOfPerformance||'Not stated in solicitation',100)}.`,
  'Staffing, workload and delivery costs that are not specified remain explicit AI assumptions.',
  'The lower and upper cases reflect the delivery assumptions shown in the full calculation.'
 ]:[sentence(p.judgment.find(j=>j.factor==='Government evaluation')?.finding||a.deal.evaluationMethod),`${p.rows.length} labor rows and ${p.components.length} other price components are included.`,p.assumptionShare>0?'Missing prices are filled with labeled estimates, not presented as sourced facts.':'Matched pricing evidence supplies the modeled rates.',sentence(p.judgment.find(j=>j.factor==='Predecessor / comparables')?.finding||p.confidenceReason)];
 const drivers=estimate?[{label:'Lower delivery-cost case',change:'Combined lower staffing, rate and workload assumptions',delta:(p.rangeLow||0)-(p.target||0)},{label:'Higher delivery-cost case',change:'Combined higher staffing, rate and workload assumptions',delta:(p.rangeHigh||0)-(p.target||0)},{label:'Individual staffing or workload changes',change:'A separate estimate is needed before assigning a dollar impact',delta:null}]:[...p.sensitivities].sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)).slice(0,3);
 const gaps=[...new Set([...(rates.length?[]:['No sourced labor rates found.']),...(p.quantityComplete?[]:['Staffing or workload quantities are incomplete.']),...(a.meta.packageCoverage?.freshness.status==='UNVERIFIED'?['Latest amendments unverified.']:[]),...p.missing.map(v=>sentence(v,115))])].slice(0,5);
 return{p,basis,why:why.slice(0,5),drivers,actions:p.actions.slice(0,3).map(v=>sentence(v.action,135)),gaps,math:p.rationale};
}
