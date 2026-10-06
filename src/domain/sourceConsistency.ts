import type { AiAnalysisDraft, DealProfile, EvidenceItem, OpportunityAnalysis, DataGap, SourceConflict } from '../types';
import { ruleEvidence } from './governmentRules';

export function sourceConflictStatus(conflict: SourceConflict, deal: DealProfile): 'OPEN' | 'RESOLVED' {
  if (conflict.status === 'OPEN' || /do not remap|requires? (?:clarification|resolution)|unresolved|pending|\bconfirm\b|\bresolve\b|without (?:an? )?amendment/i.test(conflict.resolution)) return 'OPEN';
  if (conflict.status === 'RESOLVED' && conflict.sources.length && conflict.resolution.trim()) return 'RESOLVED';
  // Migrate the observed legacy agreement: checked small-business boxes and
  // the small-business clause corroborate the same eligibility rule.
  if (/set.aside/i.test(conflict.topic) && /^(?:total )?small business(?: set.aside)?$/i.test(deal.setAside || '')
    && conflict.descriptions.length>=2 && conflict.descriptions.every(d=>/small business|52\.219.?6/i.test(d))
    && !conflict.descriptions.some(d=>/women.owned|WOSB|8\(a\)|HUBZone|SDVOSB/i.test(d.replace(/(?:WOSB|EDWOSB|SDVOSB|HUBZone)(?:\/(?:WOSB|EDWOSB|SDVOSB|HUBZone))* boxes not checked/gi,'')))
    && /(?:treat|use|controlling|total) (?:as |the )?(?:a )?(?:total )?small.business/i.test(conflict.resolution)) return 'RESOLVED';
  return 'OPEN';
}

export function resolvedGap(question: string, deal: DealProfile) {
  if (!/missing|illegible|not legible|not (?:stated|provided|found)|confirm|provide|need|obtain/i.test(question)) return false;
  if (/NAICS/i.test(question) && /^\d{6}$/.test(deal.naics)) return true;
  if (/evaluated (?:quantities|hours)|staffing (?:quantities|schedule)|labor (?:quantities|hours)/i.test(question)
    && deal.laborModelComplete && deal.laborSignals.length && deal.laborSignals.every(s=>s.periods?.length && s.periods.every(p=>p.totalHours != null))) return true;
  return false;
}

export function supportedCompetitors(competitors: OpportunityAnalysis['competitors'], evidence: EvidenceItem[], deal: DealProfile) {
  const keys = [deal.solicitationNumber,...deal.facts.filter(f=>/incumbent|predecessor|current contract|program name/i.test(f.label)).map(f=>f.value)].filter(k=>k && k.length>=5);
  return (competitors || []).filter(c=>c.sourceRefs?.some(ref=>evidence.some(e=>{
    if (e.type==='ANALYST_INFERENCE' || e.type==='DATA_GAP' || !(e.section || e.url || e.sourceRecordId)) return false;
    if (e.id!==ref && e.url!==ref) return false;
    const text=`${e.claim} ${e.excerpt || ''}`.toLowerCase();
    return text.includes(c.name.toLowerCase()) && keys.some(k=>text.includes(k.toLowerCase()));
  })));
}

export function reconcileSourceFacts<T extends Pick<AiAnalysisDraft,'deal'|'evidence'|'gaps'|'narrative'|'competitors'|'incumbent'>>(input: T): T {
  const deal = {...input.deal,facts:[...(input.deal.facts || [])],sourceConflicts:[...(input.deal.sourceConflicts || [])]};
  deal.sourceConflicts = deal.sourceConflicts.map(c=>({...c,status:sourceConflictStatus(c,deal)}));
  const naicsFacts = [
    ...deal.facts.filter(f=>/NAICS/i.test(f.label) && f.section).map(f=>f.value.match(/\b\d{6}\b/)?.[0]),
    ...input.evidence.filter(e=>e.type==='SOLICITATION_FACT' && e.section).map(e=>`${e.claim} ${e.excerpt || ''}`.match(/\bNAICS(?:\s+(?:code|is))?\s*[:#-]?\s*(\d{6})\b/i)?.[1]),
  ].filter((v):v is string=>Boolean(v));
  const codes=[...new Set(naicsFacts)];
  if (codes.length===1) deal.naics=codes[0];
  else if(codes.length>1 && !deal.sourceConflicts.some(c=>c.topic==='NAICS')) deal.sourceConflicts.push({topic:'NAICS',descriptions:codes,sources:['Extracted source ledger'],resolution:'Resolve the controlling solicitation/amendment before defining the eligible field.'});
  const gaps: DataGap[] = (input.gaps || []).filter(g=>!resolvedGap(g.question,deal) && !deal.sourceConflicts.some(c=>c.status==='RESOLVED' && g.question===`Resolve source conflict: ${c.topic}.`));
  for(const conflict of deal.sourceConflicts.filter(c=>c.status!=='RESOLVED')) if(!gaps.some(g=>g.question===`Resolve source conflict: ${conflict.topic}.`)) gaps.push({question:`Resolve source conflict: ${conflict.topic}.`,impact:`${conflict.descriptions.join(' versus ')} ${conflict.resolution}`,priority:'HIGH'});
  const competitors=supportedCompetitors(input.competitors,input.evidence,deal);
  const incumbentSupported = input.incumbent.name && supportedCompetitors([{name:input.incumbent.name,sourceRefs:input.incumbent.sourceRefs} as OpportunityAnalysis['competitors'][number]],input.evidence,deal).length;
  return {...input,deal,evidence:ruleEvidence(deal,input.evidence),gaps,competitors,incumbent:incumbentSupported ? input.incumbent : {...input.incumbent,name:'',status:'UNKNOWN',confidence:0,sourceRefs:[]},
    narrative:{...input.narrative,nextActions:(input.narrative.nextActions || []).filter(a=>!resolvedGap(a,deal)),guardrails:(input.narrative.guardrails || []).filter(a=>!resolvedGap(a,deal))}};
}
