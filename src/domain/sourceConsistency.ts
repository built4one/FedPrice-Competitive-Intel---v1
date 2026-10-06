import type { AiAnalysisDraft, DealProfile, EvidenceItem, OpportunityAnalysis, DataGap } from '../types';

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
  const naicsFacts = [
    ...deal.facts.filter(f=>/NAICS/i.test(f.label) && f.section).map(f=>f.value.match(/\b\d{6}\b/)?.[0]),
    ...input.evidence.filter(e=>e.type==='SOLICITATION_FACT' && e.section).map(e=>`${e.claim} ${e.excerpt || ''}`.match(/\bNAICS(?:\s+(?:code|is))?\s*[:#-]?\s*(\d{6})\b/i)?.[1]),
  ].filter((v):v is string=>Boolean(v));
  const codes=[...new Set(naicsFacts)];
  if (codes.length===1) deal.naics=codes[0];
  else if(codes.length>1 && !deal.sourceConflicts.some(c=>c.topic==='NAICS')) deal.sourceConflicts.push({topic:'NAICS',descriptions:codes,sources:['Extracted source ledger'],resolution:'Resolve the controlling solicitation/amendment before defining the eligible field.'});
  const gaps: DataGap[] = (input.gaps || []).filter(g=>!resolvedGap(g.question,deal));
  for(const conflict of deal.sourceConflicts) if(!gaps.some(g=>g.question===`Resolve source conflict: ${conflict.topic}.`)) gaps.push({question:`Resolve source conflict: ${conflict.topic}.`,impact:`${conflict.descriptions.join(' versus ')} ${conflict.resolution}`,priority:'HIGH'});
  const competitors=supportedCompetitors(input.competitors,input.evidence,deal);
  const incumbentSupported = input.incumbent.name && supportedCompetitors([{name:input.incumbent.name,sourceRefs:input.incumbent.sourceRefs} as OpportunityAnalysis['competitors'][number]],input.evidence,deal).length;
  return {...input,deal,gaps,competitors,incumbent:incumbentSupported ? input.incumbent : {...input.incumbent,name:'',status:'UNKNOWN',confidence:0,sourceRefs:[]},
    narrative:{...input.narrative,nextActions:(input.narrative.nextActions || []).filter(a=>!resolvedGap(a,deal)),guardrails:(input.narrative.guardrails || []).filter(a=>!resolvedGap(a,deal))}};
}
