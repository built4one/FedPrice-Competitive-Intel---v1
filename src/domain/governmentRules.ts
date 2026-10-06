import type { DealProfile, EvidenceItem } from '../types';

export function governmentRules(deal: DealProfile, evidence: EvidenceItem[]) {
  const requirements = (deal.requirements || []).filter(r=>['EVALUATION','COMPLIANCE'].includes(r.category)
    || /rating|confidence|clearance|facility security|\bFCL\b|past performance|acceptab|eligible|set.aside/i.test(`${r.name} ${r.detail}`))
    .map(r=>({name:r.name,detail:r.detail,source:r.section || 'Locator needed'}));
  const facts = evidence.filter(e=>e.type==='SOLICITATION_FACT' && e.section
    && /rating|confidence|\bFCL\b|facility clearance|past performance|evaluat|eligible|set.aside/i.test(e.claim))
    .map(e=>({name:e.id,detail:e.claim,source:e.section!}));
  return [...requirements,...facts].filter((r,i,all)=>all.findIndex(v=>v.detail===r.detail)===i);
}

// Make sourced instructions individually citable instead of forcing strategy
// synthesis to cite an unrelated numeric record or evaluation summary.
export function ruleEvidence(deal: DealProfile, evidence: EvidenceItem[]): EvidenceItem[] {
  const result = evidence.filter(e=>!(e.sourceLabel==='Extracted solicitation instruction' && /^RULE-\d+$/.test(e.id)));
  const rules = [
    ...deal.requirements.map(r=>({label:r.name,detail:r.detail,section:r.section,confidence:r.confidence})),
    ...deal.pricingSignals.map(r=>({label:r.signal,detail:r.implication,section:r.section,confidence:r.confidence})),
  ];
  for (const [index,r] of rules.entries()) {
    if (!r.section || !r.detail || result.some(e=>e.type==='SOLICITATION_FACT' && e.claim===`${r.label}: ${r.detail}`)) continue;
    const id = `RULE-${index+1}`;
    if (result.some(e=>e.id===id)) continue;
    result.push({id,type:'SOLICITATION_FACT',sourceLabel:'Extracted solicitation instruction',claim:`${r.label}: ${r.detail}`,section:r.section,confidence:r.confidence});
  }
  return result;
}

export function claimSupportIssue(text: string, citations: EvidenceItem[], kind: 'FACT'|'INFERENCE'|'ASSUMPTION') {
  if (kind==='ASSUMPTION') return undefined;
  const source = citations.map(e=>`${e.claim} ${e.excerpt || ''}`).join(' ');
  const tests: Array<[RegExp,RegExp,string]> = [
    [/\bFCL\b|facility clearance|facility security/i,/\bFCL\b|facility (?:security )?clearance/i,'facility-clearance gate'],
    [/substantial confidence|satisfactory confidence|past.performance (?:rating|threshold)/i,/substantial confidence|satisfactory confidence|past.performance/i,'past-performance rating'],
    [/transition (?:window|period|deadline)|(?:transition|mobilization) (?:must|requires?|within|before)/i,/transition|mobilization|phase.in/i,'transition timing'],
    [/all (?:required |evaluated )?(?:labor (?:categories|roles)|categories)|every (?:labor )?(?:category|role) (?:must|is required)|(?:retain|price|propose|include) all (?:required )?(?:labor|pricing|categories|ordering periods)/i,/all (?:required |evaluated )?(?:labor |pricing )?(?:categories|roles|lines)|every (?:labor )?(?:category|role)|pricing (?:schedule|worksheet)|evaluated (?:hours|quantities)|complete.*labor.*(?:schedule|basket)/i,'full pricing-schedule requirement'],
  ];
  for (const [claim,required,label] of tests) if (claim.test(text) && !required.test(source)) return `Citations do not support the ${label}; use a claim-specific instruction or mark the statement as an assumption.`;
  if (kind==='FACT' && /(?:WOSB|women.owned|total small.business|set.aside)/i.test(text)
    && !/set.aside|small.business|WOSB|women.owned/i.test(source)) return 'Eligibility needs a citation to the selected set-aside rule.';
  return undefined;
}

export const readableDecisionText = (text:string) => text.replace(/\bcompetitivePosition\b/g,'provisional pricing model').replace(/\bmarketPosition\b/g,'supporting market benchmark');
