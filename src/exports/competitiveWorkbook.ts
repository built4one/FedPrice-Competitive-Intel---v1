import type ExcelJS from 'exceljs';
import type { OpportunityAnalysis } from '../types';
import { buildLaborModel } from '../domain/ptw/laborModel';
import { sourceConflictStatus } from '../domain/sourceConsistency';
import { determineBidTransform } from '../domain/ptw/bidTransform';

export function addCompetitiveWorkbook(workbook: ExcelJS.Workbook, analysis: OpportunityAnalysis) {
  const p=analysis.competitivePosition!;
  const government=workbook.addWorksheet('Government Decision');
  government.columns=[{header:'Category',key:'category',width:25},{header:'Fact / rule',key:'label',width:35},{header:'Extracted value / implication',key:'value',width:100},{header:'Source locator',key:'source',width:80}];
  government.addRows([{category:'Eligibility',label:'Set-aside',value:analysis.deal.setAside || 'Unconfirmed'},{category:'Eligibility',label:'NAICS',value:analysis.deal.naics},{category:'Evaluation',label:'Method',value:analysis.deal.evaluationMethod},{category:'Evaluation',label:'Basket',value:analysis.deal.evaluationPricing?.basis,source:analysis.deal.evaluationPricing?.source}]);
  analysis.deal.facts.forEach(f=>government.addRow({category:'Source fact',label:f.label,value:f.value,source:f.section}));
  analysis.deal.requirements.forEach(r=>government.addRow({category:r.category,label:r.name,value:r.detail,source:r.section}));
  analysis.deal.pricingSignals.forEach(r=>government.addRow({category:'Pricing instruction',label:r.signal,value:r.implication,source:r.section}));
  const inputs=workbook.addWorksheet('Pricing Inputs');
  inputs.columns=[{header:'Input',key:'label',width:38},{header:'Value',key:'value',width:35},{header:'Source / interpretation',key:'source',width:100}];
  const model=buildLaborModel(analysis.deal,analysis.evidence);
  inputs.addRows([
    {label:'Annual planning escalation (fraction)',value:model.escalationPct/100,source:model.escalationEvidenceId || 'Zero escalation assumption'},
    {label:'Evaluation posture',value:p.priceOrderFirst?'PRICE_ORDERED':'MARKET_ALIGNED',source:analysis.deal.evaluationMethod},
    {label:'Evaluation basket complete',value:p.evaluationComplete?'YES':'NO',source:analysis.deal.evaluationPricing?.source || 'Re-extraction required'},
    {label:'Extension rate rule',value:analysis.deal.evaluationPricing?.extensionRateRule || 'UNKNOWN',source:analysis.deal.evaluationPricing?.extensionSource || 'Validation required'},
    {label:'Recommendation status',value:p.status,source:p.rangeMeaning},
    {label:'Total source labor hours',value:p.totalHours,source:'All validated extracted quantity rows, including unpriced rows'},
    {label:'Priced labor hours',value:p.pricedHours,source:'Only rows with a relevant public rate proxy'},
    {label:'Unpriced labor hours',value:p.totalHours-p.pricedHours,source:'Excluded from every partial subtotal'},
  ]);
  inputs.getCell('B2').numFmt='0.0%';
  p.assumptions.forEach(source=>inputs.addRow({label:'Planning assumption',source}));
  p.missing.forEach(source=>inputs.addRow({label:'Unresolved input',source}));

  const quantities=workbook.addWorksheet('Quantity Coverage');
  quantities.columns=[{header:'Row ID',key:'id',width:18},{header:'Source labor category',key:'title',width:42},{header:'Period',key:'period',width:30},{header:'Evaluated hours',key:'hours',width:24},{header:'Pricing status',key:'status',width:24},{header:'Quantity locator',key:'source',width:90}];
  const pricedIds=new Set(p.rows.map(r=>r.id));
  model.quantityRows.forEach(r=>quantities.addRow({...r,status:pricedIds.has(r.id)?'PRICED':'UNPRICED - EXCLUDED'}));
  quantities.addRow({title:'TOTAL SOURCE HOURS',hours:{formula:model.quantityRows.length ? `SUM(D2:D${quantities.rowCount})` : '0',result:p.totalHours},status:p.quantityComplete?'QUANTITIES COMPLETE':'QUANTITY VALIDATION OPEN'});

  const distributions=workbook.addWorksheet('Rate Distribution');
  distributions.columns=[{header:'Evidence ID',key:'id',width:30},{header:'Sample index',key:'index',width:16},{header:'Loaded rate / hour',key:'rate',width:24}];
  const stats=workbook.addWorksheet('Rate Statistics');
  stats.columns=[{header:'Evidence ID',key:'id',width:30},{header:'Requested category',key:'category',width:38},{header:'Lower quartile',key:'low',width:20},{header:'Median',key:'median',width:20},{header:'Upper quartile',key:'high',width:20},{header:'Sample count',key:'count',width:16},{header:'Source / limitation',key:'source',width:90},{header:'Query URL',key:'url',width:80},{header:'Retrieved',key:'retrieved',width:28},{header:'Source-sample SHA-256',key:'fingerprint',width:68}];
  const statRows=new Map<string,number>();
  const records=workbook.addWorksheet('Rate Source Records');
  records.columns=[{header:'Evidence ID',key:'evidence',width:30},{header:'Record ID',key:'id',width:24},{header:'Category',key:'category',width:40},{header:'Vendor',key:'vendor',width:34},{header:'Contract',key:'contract',width:25},{header:'Rate',key:'rate',width:16},{header:'Experience years',key:'experience',width:22},{header:'Education',key:'education',width:28},{header:'Worksite',key:'worksite',width:25},{header:'Clearance',key:'clearance',width:20}];
  for(const e of analysis.evidence.filter(e=>e.numeric?.valueType==='HOURLY_CEILING_RATE')){
    const n=e.numeric!;const first=distributions.rowCount+1;
    const rates=n.rateDistribution || [];
    rates.forEach((rate,index)=>distributions.addRow({id:e.id,index:index+1,rate}));
    const last=distributions.rowCount;
    const percentile=(q:number,result:number)=>rates.length ? {formula:`PERCENTILE.INC('Rate Distribution'!C${first}:C${last},${q})`,result} : result;
    const row=stats.addRow({id:e.id,category:n.matchedLaborCategory || n.scopeText,low:percentile(.25,n.lowerRate ?? n.originalValue),median:percentile(.5,n.originalValue),high:percentile(.75,n.upperRate ?? n.originalValue),count:n.rateSampleSize || rates.length || 1,source:e.claim,url:e.url,retrieved:e.retrievedAt,fingerprint:n.rateSampleFingerprint || 'Full source snapshot not available for this older run'});
    statRows.set(e.id,row.number);
    n.rateRecords?.forEach(r=>records.addRow({evidence:e.id,...r}));
  }
  const labor=workbook.addWorksheet('Competitive Labor');
  labor.columns=[{header:'Row ID',key:'id',width:16},{header:'Labor category',key:'title',width:38},{header:'Period',key:'period',width:27},{header:'Total evaluated hours',key:'hours',width:24},{header:'Lower loaded rate',key:'lowRate',width:22},{header:'Median loaded rate',key:'medianRate',width:22},{header:'Upper loaded rate',key:'highRate',width:22},{header:'Selected loaded rate',key:'selectedRate',width:22},{header:'Escalation factor',key:'factor',width:22},{header:'Aggressive labor',key:'low',width:24},{header:'Recommended labor',key:'target',width:24},{header:'Defensive labor',key:'high',width:24},{header:'Rate-protection reason',key:'reason',width:100},{header:'Quantity source',key:'source',width:85},{header:'Rate evidence IDs',key:'evidence',width:40},{header:'Qualification / mapping limitation',key:'limitation',width:100},{header:'Protect median: 1 / lower: 0',key:'protect',width:30}];
  const bidTransform = determineBidTransform(analysis.deal);
  const discount = bidTransform.discountPct / 100;

  p.rows.forEach(r=>{
    const index=labor.rowCount+1;
    const rate=(column:string,result:number)=>{const refs=r.evidenceIds.map(id=>statRows.get(id)).filter((v):v is number=>v!=null).map(n=>`'Rate Statistics'!${column}${n}`);return refs.length ? {formula:`MEDIAN(${refs.join(',')})`,result} : result;};
    const factorFormula=r.rateYearWeights.map(w=>`${w.weight}*(1+'Pricing Inputs'!$B$2)^${w.year}`).join('+');
    labor.addRow({id:r.id,title:r.title,period:r.period,hours:r.hours,lowRate:rate('C',r.lowRate),medianRate:rate('D',r.medianRate),highRate:rate('E',r.highRate),
      selectedRate:{formula:`IF(Q${index}=1, F${index}*(1-${discount}), E${index}*(1-${discount}))`,result:r.recommendedRate},
      factor:{formula:factorFormula,result:r.factor},
      low:{formula:`D${index}*(E${index}*(1-${discount}))*I${index}`,result:r.low},
      target:{formula:`D${index}*H${index}*I${index}`,result:r.target},
      high:{formula:`D${index}*(G${index}*(1-MAX(0,${discount}-0.05)))*I${index}`,result:r.high},
      reason:r.protectionReason,source:r.source,evidence:r.evidenceIds.join(', '),limitation:`${r.qualification} ${r.rateLimitation}`,protect:r.protectionReason.includes('unprotected')?0:1});
  });
  const components=workbook.addWorksheet('Evaluated Components');
  components.columns=[{header:'Evaluated component',key:'label',width:40},{header:'Specified USD',key:'amount',width:24},{header:'Indirect fraction',key:'indirect',width:23},{header:'Included USD',key:'total',width:24},{header:'Treatment / assumption',key:'treatment',width:100},{header:'Source locator',key:'source',width:80},{header:'Evidence IDs',key:'evidence',width:40}];
  p.components.forEach(c=>{const row=components.rowCount+1;const indirect=c.indirectTreatment==='KNOWN' && c.indirectPct!=null && Number.isFinite(c.indirectPct) && c.indirectPct>=0 && c.indirectPct<=100 ? c.indirectPct/100 : 0;components.addRow({label:c.label,amount:c.amount,indirect,total:{formula:`ROUND(B${row}*(1+C${row}),2)`,result:c.includedAmount},treatment:c.assumption || `${c.indirectTreatment}; fee ${c.feeAllowed?'requires validation':'not added'}`,source:c.source,evidence:c.evidenceIds.join(', ')});});
  const strategies=workbook.addWorksheet('Competitive Strategies');
  strategies.columns=[{header:'Strategy',key:'label',width:30},{header:'Labor USD',key:'labor',width:26},{header:'Other evaluated USD',key:'other',width:26},{header:'Total USD',key:'total',width:28},{header:'Selected',key:'selected',width:16},{header:'Decision rationale',key:'rationale',width:100},{header:'Conditions / interpretation',key:'condition',width:100}];
  const end=labor.rowCount,lastComponent=components.rowCount;
  p.scenarios.forEach((s,i)=>{const index=strategies.rowCount+1;const column=['J','K','L'][i];strategies.addRow({label:`${s.label}${s.basis==='PARTIAL_SUBTOTAL'?' / PARTIAL SUBTOTAL':''}`,labor:{formula:`ROUND(SUM('Competitive Labor'!${column}2:${column}${Math.max(2,end)}),2)`,result:s.labor},other:{formula:lastComponent>1 ? `ROUND(SUM('Evaluated Components'!D2:D${lastComponent}),2)` : '0',result:s.nonLabor},total:{formula:`ROUND(B${index}+C${index},2)`,result:s.total},selected:s.selected?'YES':'NO',rationale:s.rationale,condition:`${p.status}; ${s.basis}; ${p.evaluationComplete?'Basket represented':'Validation open'}. ${s.condition}`});});
  const decision=workbook.getWorksheet('Executive Decision')!;
  decision.addRows([
    {field:'Selected provisional PTW target',value:p.target == null ? 'No complete quantity/rate basis' : {formula:"'Competitive Strategies'!D3",result:p.target}},
    {field:'Planning scenario lower',value:p.rangeLow == null ? 'Not established' : {formula:"'Competitive Strategies'!D2",result:p.rangeLow}},
    {field:'Planning scenario upper',value:p.rangeHigh == null ? 'Not established' : {formula:"'Competitive Strategies'!D4",result:p.rangeHigh}},
    {field:'Range meaning',value:p.rangeMeaning},
    {field:'Competitive recommendation status',value:p.status},
    {field:'Evaluated basket complete',value:p.evaluationComplete?'YES':'NO - see unresolved inputs'},
    {field:'Priced / source labor hours',value:`${p.pricedHours} / ${p.totalHours}`},
    {field:'Unpriced source rows',value:p.unpricedRows.length},
    ...Object.entries(p.confidence).map(([key,value])=>({field:`${key} confidence`,value})),
    {field:'Decision request',value:p.decisionRequest},
    {field:'Competitive rationale',value:p.rationale},
    {field:'Ceiling interpretation',value:p.ceilingExplanation},
    {field:'Phase 2 - Company position',value:'Requires authorized company inputs. Company cost, margin, execution floor and IBM advantages are not established by public rate proxies.'},
  ]);
  const sensitivities=workbook.addWorksheet('Sensitivity and Actions');
  sensitivities.columns=[{header:'Category',key:'category',width:23},{header:'Input / owner',key:'label',width:38},{header:'Change / action',key:'change',width:100},{header:'Price delta USD',key:'delta',width:26},{header:'Interpretation',key:'reason',width:100}];
  p.sensitivities.forEach(s=>sensitivities.addRow({category:'Sensitivity',label:s.label,change:s.change,delta:s.delta,reason:s.rationale}));
  p.actions.forEach(a=>sensitivities.addRow({category:'Validation action',label:a.owner,change:a.action,reason:a.consequence}));
  p.missing.forEach(change=>sensitivities.addRow({category:'Unresolved input',change}));
  analysis.deal.sourceConflicts?.forEach(c=>sensitivities.addRow({category:sourceConflictStatus(c,analysis.deal)==='RESOLVED'?'Resolved source agreement':'Open source conflict',label:c.topic,change:c.descriptions.join(' versus '),reason:`${c.resolution} ${c.sources.join('; ')}`}));
  const sources=workbook.addWorksheet('Source Snapshots');
  sources.columns=[{header:'Snapshot / evidence',key:'id',width:35},{header:'Retrieved / as of',key:'date',width:30},{header:'Locator / fingerprint',key:'source',width:110},{header:'Limitation',key:'limitation',width:100}];
  sources.addRow({id:'Analysis cutoff',date:analysis.meta.analyzedAt,source:analysis.id,limitation:'Live analysis timestamp; not a certified historical pre-award evidence cutoff.'});
  analysis.meta.warnings.filter(w=>w.startsWith('Package snapshot:')).forEach(source=>sources.addRow({id:'Uploaded source SHA-256',date:analysis.meta.analyzedAt,source,limitation:'Retain original uploaded files with this decision package.'}));
  analysis.evidence.forEach(e=>sources.addRow({id:e.id,date:e.retrievedAt || e.numeric?.sourceDate,source:[e.sourceLabel,e.section,e.url,e.numeric?.rateSampleFingerprint].filter(Boolean).join('; '),limitation:e.numeric?.rateDistribution ? 'All retrieved matched rates are frozen in Rate Distribution; up to 40 detailed source records are included. Sampling and qualification limitations remain.' : 'Detailed source snapshot is not available; retain the original cited record.'}));
  workbook.calcProperties.fullCalcOnLoad=true;
  for(const sheet of [stats,labor,components,strategies]) sheet.eachRow((r,i)=>{if(i>1)r.eachCell(c=>{if(typeof c.value==='number' || c.type===6)c.numFmt='#,##0.00';});});
}
