import PDFDocument from 'pdfkit';
import { regularFontData, boldFontData } from './fontData';
import type { OpportunityAnalysis } from '../types';
import { enforceAuthoritativeAnalysis } from '../domain/marketPosition/authoritative';
import { assessmentIssues } from '../domain/analysisQuality';
import { preserveCurrentStrategy } from '../server/ptwSynthesis';
import { governmentRules, readableDecisionText } from '../domain/governmentRules';
import { sourceConflictStatus } from '../domain/sourceConsistency';

const colors = {navy:'#103243',teal:'#007E7A',ink:'#172D3A',muted:'#617580',line:'#DAE4E8',panel:'#F0F5F7',amber:'#965A12'};
const pageWidth=612,pageHeight=792,margin=42,contentWidth=528;
const regularFont='FMP-Regular',boldFont='FMP-Bold';
const clean=(v:unknown)=>readableDecisionText(String(v??'')).replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/\s+/g,' ').trim();
const short=(v:unknown,n=190)=>{const s=clean(v);return s.length>n ? `${s.slice(0,n-3)}...` : s;};
const money=(v:number|null|undefined)=>v==null ? 'Not established' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
const compact=(v:number|null|undefined)=>v==null ? 'Model incomplete' : v>=1e6 ? `$${(v/1e6).toFixed(1)}M` : money(v);

class Layout {
  y=102; pageTitle='';
  constructor(readonly doc:PDFKit.PDFDocument,readonly analysis:OpportunityAnalysis){}
  page(title:string,subtitle:string,continuation=false){
    const d=this.doc;d.addPage();if(!continuation)this.pageTitle=title;this.y=102;
    d.rect(margin,23,contentWidth,4).fill(colors.teal);
    d.font(boldFont).fontSize(9).fillColor(colors.navy).text('FEDERAL MARKET POSITION',margin,36,{width:contentWidth,lineBreak:false});
    d.font(regularFont).fontSize(7).fillColor(colors.muted).text('EXECUTIVE RECOMMENDATION / PHASE 1 - INDEPENDENT MARKET POSITION',margin,51,{width:contentWidth,lineBreak:false});
    d.font(boldFont).fontSize(21);const titleSize=d.widthOfString(title)>contentWidth?16:21;
    d.fontSize(titleSize).fillColor(colors.navy).text(title,margin,69,{width:contentWidth,lineBreak:false});
    d.font(regularFont).fontSize(8).fillColor(colors.muted).text(short(subtitle,120),margin,94,{width:contentWidth,lineBreak:false});
    this.y=116;
  }
  ensure(height:number){if(this.y+height>706)this.page(`${this.pageTitle} - continued`,this.analysis.deal.solicitationNumber,true);}
  text(value:string,bold=false,size=9,color=colors.ink){
    const d=this.doc;d.font(bold?boldFont:regularFont).fontSize(size);
    const v=clean(value),height=d.heightOfString(v,{width:contentWidth,lineGap:2});this.ensure(height+9);
    d.font(bold?boldFont:regularFont).fontSize(size).fillColor(color).text(v,margin,this.y,{width:contentWidth,lineGap:2});this.y+=height+9;
  }
  title(value:string){this.ensure(58);this.y+=8;this.text(value,true,12,colors.navy);}
  table(headers:string[],widths:number[],rows:string[][]){
    const d=this.doc;
    const header=()=>{this.ensure(34);d.rect(margin,this.y,contentWidth,25).fill(colors.navy);let x=margin;
      headers.forEach((h,i)=>{d.font(boldFont).fontSize(7.5).fillColor('white').text(h,x+7,this.y+7,{width:widths[i]-14,height:20});x+=widths[i];});this.y+=25;};
    header();
    rows.forEach((row,index)=>{
      d.font(regularFont).fontSize(8);
      const height=Math.max(27,...row.map((v,i)=>d.heightOfString(clean(v),{width:widths[i]-14,lineGap:2})+14));
      if(this.y+height>701){this.page(`${this.pageTitle} - continued`,this.analysis.deal.solicitationNumber,true);header();}
      d.rect(margin,this.y,contentWidth,height).fill(index%2===0?colors.panel:'#FFFFFF');let x=margin;
      row.forEach((v,i)=>{d.font(regularFont).fontSize(8).fillColor(colors.ink).text(clean(v),x+7,this.y+7,{width:widths[i]-14,lineGap:2});x+=widths[i];});this.y+=height;
    });this.y+=10;
  }
}

function buildBrief(l:Layout){
  const {analysis:a,doc:d}=l;const p=a.competitivePosition!;const m=a.marketPosition;
  const subtitle=[a.deal.solicitationNumber,a.deal.agency,new Date(a.meta.analyzedAt).toISOString().slice(0,10)].filter(Boolean).join(' | ');
  l.page('Where to price. Why. What must hold.',subtitle);
  l.text(short(a.deal.title,155),true,11);
  const heroY=l.y;
  d.roundedRect(margin,heroY,contentWidth,107,5).fill(colors.navy);
  d.font(boldFont).fontSize(8).fillColor('#B9DDDB').text(p.evaluationComplete ? 'RECOMMENDED TOTAL EVALUATED PRICE' : 'PROVISIONAL PRICE OF MODELED BASKET',margin+16,heroY+15,{width:320,lineBreak:false});
  d.font(boldFont).fontSize(p.target==null?24:34).fillColor('white').text(compact(p.target),margin+16,heroY+35,{width:300,lineBreak:false});
  d.font(regularFont).fontSize(9).fillColor('white').text(`${p.status.replaceAll('_',' ')} | ${p.confidence.overall} PTW confidence`,margin+16,heroY+83,{width:300,lineBreak:false});
  d.font(regularFont).fontSize(9).fillColor('#D4E6E7').text(`Planning scenario range\n${compact(p.rangeLow)} - ${compact(p.rangeHigh)}\n${p.evaluationComplete?'Evaluated basket represented':p.status==='PARTIAL_MODEL'?'Partial labor coverage':'Component validation remains open'}`,margin+327,heroY+24,{width:185,lineGap:5});
  l.y=heroY+119;
  l.text(`Decision requested: ${p.decisionRequest}`,true,9);
  l.text(`Rate coverage: ${p.pricedHours.toLocaleString('en-US')} of ${p.totalHours.toLocaleString('en-US')} source hours priced; ${p.unpricedRows.length} unpriced rows.`,true,9);
  l.table(['Aggressive','Protected working case','Defensive stress case'],[176,176,176],[p.scenarios.length ? p.scenarios.map(s=>`${compact(s.total)}${s.basis==='PARTIAL_SUBTOTAL'?' / PARTIAL SUBTOTAL':''}`) : ['Not established','Not established','Not established']]);
  l.title('Why we recommend this position');l.text(p.rationale);
  l.text(`${p.priceOrderFirst?'Rate protection':'Market alignment'}: ${p.scenarios.find(s=>s.id==='RECOMMENDED')?.rationale || 'Resolve the missing calculation basis before selecting a numerical target.'}`);
  l.text(`Supporting total-value benchmark: ${compact(m.aggressive)} / ${compact(m.expected)} / ${compact(m.conservative)}. The ${m.methodLabel.toLowerCase()} references are distinct from the selected competitive planning case.`);
  l.text(`Critical condition: ${short(p.missing[0] || p.scenarios.find(s=>s.selected)?.condition || 'Analyst validation remains required.',260)}`,true,9,colors.amber);
  l.text(`Confidence: quantities ${p.confidence.quantities}; rate relevance ${p.confidence.rateRelevance}; competition ${p.confidence.competition}; company execution NOT ASSESSED. The numerical range is a planning scenario envelope, not a statistical interval.` ,false,8,colors.muted);
  l.text('Phase 2 - Company position: add authorized company costs, workforce, supplier commitments and margin requirements separately. No IBM costs, internal advantages or executable floor are established by this Phase 1 brief.',false,8,colors.muted);

  l.page('Understand the government decision',subtitle);
  l.text(a.deal.title,true,11);
  l.table(['Source fact / extracted rule','Pricing implication'],[264,264],[
    [`${a.deal.contractType}; ${a.deal.awardStructure}; ${a.deal.periodOfPerformance}.`,'Use the complete evaluated basket; task-order revenue and program ceilings are separate measurements.'],
    [`Set-aside: ${a.deal.setAside || 'Not established - validate selected form boxes'}. NAICS: ${a.deal.naics || 'Unknown'}.`,'Define the eligible field from the controlling solicitation/amendment.'],
    [short(a.deal.evaluationMethod,170),p.priceOrderFirst ? 'Compete on evaluated price while preserving every scored non-price and compliance gate.' : 'Validate scored benefits and government willingness to pay before proposing a premium.'],
    [a.deal.evaluationPricing?.basis || 'Evaluation basket requires source confirmation',`Source: ${short(a.deal.evaluationPricing?.source || 'Not supplied',100)}. ${p.evaluationComplete ? 'All modeled evaluated components are represented.' : 'Provisional totals retain the assumptions listed in A price that reconciles and the workbook.'}`],
  ]);
  const evalRules=governmentRules(a.deal,a.evidence);
  const briefGates=[evalRules.find(r=>/substantial confidence|past.performance/i.test(r.detail)),evalRules.find(r=>/facility (?:security )?clearance/i.test(r.detail) && /Top Secret|TOP SECRET/i.test(r.detail)),evalRules.find(r=>/all personnel|personnel require|all contractor personnel/i.test(`${r.name} ${r.detail}`))].filter((r):r is typeof evalRules[number]=>Boolean(r));
  const displayedRules=briefGates.length ? briefGates : evalRules.slice(0,3);
  l.title('Scored factors and mandatory gates');
  if(!evalRules.length)l.text('Specific rating thresholds, evaluation branches and compliance gates remain unestablished. Validate the controlling instructions.');
  displayedRules.forEach(r=>l.text(`${r.name}: ${short(r.detail,310)} [${short(r.source,80)}]`,false,8));
  if(evalRules.length>3)l.text('Additional source rules and full evaluation branches are preserved in Government Decision in the workbook.',false,8,colors.muted);

  l.title('Ceiling and evaluated-price distinction');l.text(short(p.ceilingExplanation,225),false,8);
  const openConflicts=a.deal.sourceConflicts?.filter(c=>sourceConflictStatus(c,a.deal)==='OPEN') || [];
  if(openConflicts.length){l.title('Open source-package conflicts');openConflicts.slice(0,2).forEach(c=>l.text(`${short(c.topic,60)}: ${short(c.resolution,135)} [${short(c.sources.join('; '),55)}]`,false,8));}
  if(a.deal.sourceConflicts?.some(c=>sourceConflictStatus(c,a.deal)==='RESOLVED'))l.text('Resolved source agreements are retained in the workbook and do not block the model.',false,8,colors.muted);

  l.page('Market and competitive intelligence',subtitle);
  l.title('Independent market anchor');
  if(m.expected==null)l.text('A complete supporting total-value benchmark is not established. Fixed travel amounts are components; partial labor coverage cannot provide a whole-contract reference.');
  else l.table(['Market reference','Total','Meaning'],[155,90,283],[
    ['Lower public-rate reference',compact(m.aggressive),`${m.methodLabel}; not an executable staffing floor.`],
    ['Median public-rate reference',compact(m.expected),'Supporting market reference; not company cost or an automatically selected PTW.'],
    ['Upper public-rate reference',compact(m.conservative),'Upper planning reference; not a confidence bound.'],
  ]);
  l.text(`Comparable-award evidence: ${m.anchors.filter(r=>r.included && !r.opportunitySpecific).length} total-value anchors used. ${m.publicBenchmark.summary}`);
  const comparable=m.anchors.filter(r=>r.valueType==='TOTAL_AWARD_VALUE' || r.valueType==='CURRENT_AWARD_AMOUNT');
  if(comparable.some(r=>r.included))l.table(['Evidence / original','Normalized / treatment'],[264,264],comparable.filter(r=>r.included).slice(0,2).map(r=>[`${r.evidenceId}: ${money(r.originalValue)}`,`${money(r.normalizedValue)}. ${r.included ? r.inclusionRationale : r.exclusionReasons.join(' ')}`]));
  l.title('Competitor intelligence');
  if(!a.competitors.length)l.text('No evidence-supported named competitor field has been established. General capabilities or vehicle membership do not demonstrate pursuit participation.');
  else l.table(['Company / role','Pursuit-specific support / limitation'],[165,363],a.competitors.map(c=>[`${c.name} / ${c.role.replaceAll('_',' ')}`,`${c.rationale} Sources: ${c.sourceRefs.join(', ')}. Bid intent remains unconfirmed unless explicitly documented.`]));
  l.title('Competitive hypotheses to validate');
  l.text(p.priceOrderFirst ? 'If enough lower-priced eligible offers satisfy the required non-price ratings, a more expensive staffing posture may never reach the qualifying cohort. Establish eligible rivals and their relevant past performance before increasing confidence.' : 'A premium is supportable only where a scored advantage is demonstrated and the government has reason to value it. Market proximity alone does not prove premium tolerance.');
  l.text('No rival price range or bid intent is invented to fill a missing competitive field.');
  l.title('Labor crosswalk priorities');
  const roleRows=[...new Map(p.rows.map(r=>[r.title,r])).values()].sort((x,y)=>p.rows.filter(r=>r.title===y.title).reduce((s,r)=>s+r.target,0)-p.rows.filter(r=>r.title===x.title).reduce((s,r)=>s+r.target,0));
  if(roleRows.length)l.table(['High-impact role','Mapping / validation'],[180,348],roleRows.slice(0,2).map(r=>[r.title,`${short(r.qualification || 'Qualifications were not fully extracted.',110)} ${short(r.rateLimitation,70)} [${r.evidenceIds.join(', ')}]`]));
  else l.text('A role-level public-rate model has not been established.');

  l.page('A price that reconciles',subtitle);
  l.text('Deterministic evaluation build. Fully burdened public labor proxies are not charged a second burden or fee.');
  const periodTotals=[...new Set(p.rows.map(r=>r.period))].map(period=>[period,...['low','target','high'].map(key=>money(p.rows.filter(r=>r.period===period).reduce((s,r)=>s+r[key as 'low'|'target'|'high'],0)))]);
  l.table(['Evaluated labor period','Aggressive','Recommended','Defensive'],[207,107,107,107],periodTotals.length?periodTotals:[['No complete labor basis','-','-','-']]);
  l.text(`Priced labor hours ${p.pricedHours.toLocaleString('en-US')} / source hours ${p.totalHours.toLocaleString('en-US')}; missing ${p.unpricedRows.length} source rows. ${p.unpricedRows.length?'Every subtotal excludes these unpriced rows; no full PTW target is established.':''}`,true,8);
  if(p.components.length)l.table(['Other evaluated component','Included amount / treatment'],[264,264],p.components.map(c=>[c.label,`${money(c.includedAmount)}. ${short(c.assumption || 'Specified amount and documented indirect treatment.',130)} Source: ${short(c.source,90)}`]));
  l.title('Calculation chain');
  l.text(`Labor = row hours x selected loaded rate x performance-year factor; no second FTE multiplication. Other components add ${money(p.components.reduce((s,c)=>s+c.includedAmount,0))}. ${p.target==null?'Full target not established; strategy cards contain partial subtotals.':`Modeled target ${money(p.target)}.`} Full strategy cases reconcile in Competitive Strategies in the workbook.`,false,8);
  l.text(`Extension: ${a.deal.evaluationPricing?.extensionRateRule || 'UNKNOWN'} [${a.deal.evaluationPricing?.extensionSource || 'Clause validation needed'}]. Full rate protections, conditions and recalculable formulas are in the workbook.`,false,8);
  if(a.pricingScenario){l.title('Separate analyst-entered offer model');l.text(`Lower ${money(a.pricingScenario.low)}; target ${money(a.pricingScenario.target)}; upper ${money(a.pricingScenario.high)}. ${a.pricingScenario.inputs.evaluationBasis} Source: ${a.pricingScenario.inputs.basisSource}. ${a.pricingScenario.scopeReconciled===false?'SOURCE SCOPE NOT RECONCILED. Review and reprice the source rows. ':''}This separate conditional model does not override the independent recommendation.`);}

  l.page('Know when to change the position',subtitle);
  l.title('Isolated planning sensitivities');
  const executiveSensitivities=p.sensitivities.filter((s,i)=>i===0 || i===1 || /escalation|Role protection/.test(s.label));
  l.table(['Change','Price effect','Interpretation'],[170,97,261],executiveSensitivities.map(s=>[`${s.label}: ${s.change}`,`${s.delta>=0?'+':''}${money(s.delta)}`,short(s.rationale,125)]));
  l.text('Sensitivities are separate deterministic changes, not probabilities. Check overlap before combining them.',false,8,colors.muted);
  l.title('Accountable validation actions');
  l.table(['Owner','Required action / decision consequence'],[115,413],p.actions.map(a=>[a.owner,`${short(a.action,85)} ${short(a.consequence,55)}`]));
  l.text(`Unresolved inputs: ${p.missing.length}. ${p.missing.slice(0,2).map(v=>short(v,125)).join(' ')} Full actions and source conflicts are in the workbook.`,false,8,colors.amber);
  l.text('Move conditions: lower with validated labor economics or reduced scope; higher with corrected specialist rates or additional evaluated obligations. Company cost alone does not establish government willingness to pay.',false,8);

  l.page('Evidence, assumptions and limits',subtitle);
  l.text(`Analysis as of ${a.meta.analyzedAt}. Run ${a.id}. Market engine ${m.formulaVersion}; competitive engine ${p.version}. Human pricing judgment and bid approval remain required.`);
  l.title('Evidence and source lineage');
  const ids=new Set([...p.rows.flatMap(r=>r.evidenceIds),...p.components.flatMap(c=>c.evidenceIds),...a.evidence.filter(e=>e.numeric?.valueType==='ESCALATION_RATE').map(e=>e.id)]);
  const used=a.evidence.filter(e=>ids.has(e.id) || e.type==='SOLICITATION_FACT').sort((x,y)=>Number(y.type==='SOLICITATION_FACT')-Number(x.type==='SOLICITATION_FACT'));
  l.table(['Evidence record','Claim / locator / limitation'],[130,398],used.slice(0,3).map(e=>[`${e.id} / ${e.type.replaceAll('_',' ')}`,`${short(e.claim,140)} Source: ${e.sourceLabel}; ${e.section || e.url || e.sourceRecordId || 'Locator needed'}. ${e.retrievedAt ? `Retrieved ${e.retrievedAt}.` : ''}`]));
  if(used.length>3)l.text(`${used.length-3} additional cited records, full source excerpts and frozen rate-distribution inputs are in the workbook.` ,false,8,colors.muted);
  l.title('Planning assumptions');p.assumptions.slice(0,3).forEach(v=>l.text(short(v,200),false,8));
  if(p.assumptions.length>3)l.text('The complete assumption register is in Pricing Inputs. No labor benchmark is an executable cost floor; unquantified savings are excluded.',false,8,colors.muted);
  l.title('Research coverage');l.text((a.meta.connectors || []).map(c=>`${c.name}: ${c.status.replaceAll('_',' ')} (${c.recordsFound} records)`).join('; ') || 'Source coverage is recorded in the evidence ledger.',false,8);
  l.text(`Market-model confidence: ${m.confidence}. Competitive PTW confidence: ${p.confidence.overall} / provisional. High confidence in multiplication does not establish confidence in rival prices or premium tolerance.`,true,9);
  if(a.validation)l.text('Actuals are recorded separately. A scored historical review requires a pre-decision evidence cutoff and a matching measurement basis.',false,8,colors.muted);
  const issues=assessmentIssues(a);if(issues.length)l.text(`${issues.length} assessment issues and source diagnostics are recorded in the workbook. Review consequential gaps before using this planning position.`,false,8,colors.muted);
  if(a.ptwStrategy?.status==='DRAFT'){
    const s=a.ptwStrategy.strategy;const selected=s.options.find(o=>o.id===s.recommendation.selectedOptionId);
    l.page('Delivery-strategy hypotheses',subtitle);
    l.text('Qualitative synthesis / unreviewed. Only the explicit role-rate scenarios in A price that reconciles have numerical effects in the recommendation. Unquantified productivity, teaming and premium hypotheses remain separate.',true,9);
    l.title(`Selected delivery approach: ${selected?.name || 'Review required'}`);l.text(s.recommendation.rationale.text);
    s.options.forEach(o=>{l.title(o.name);l.text(`Win logic: ${short(o.winLogic.text,330)}`);l.text(`Evaluation advantage: ${short(o.evaluationAdvantage.text,260)}`);l.text(`Pricing mechanism: ${short(o.pricingLevers.map(v=>v.text).join(' '),280)}`);l.text(`Risk: ${short(o.principalRisk.text,220)}`);
      const other=s.recommendation.alternatives.find(v=>v.optionId===o.id);if(other)l.text(`Why not selected: ${short(other.reason.text,220)}`);});
    l.title('Change triggers');s.recommendation.changeTriggers.forEach(v=>l.text(`${v.kind}: ${v.text} Sources: ${v.evidenceIds.join(', ') || 'Working assumption'}. Validate: ${v.validationAction}`));
  }
}

function footers(doc:PDFKit.PDFDocument){const r=doc.bufferedPageRange();for(let i=r.start;i<r.start+r.count;i++){doc.switchToPage(i);doc.moveTo(margin,728).lineTo(pageWidth-margin,728).strokeColor(colors.line).lineWidth(.6).stroke();doc.font(regularFont).fontSize(7).fillColor(colors.muted).text('PROVISIONAL DECISION SUPPORT - ANALYST REVIEW AND COMPANY BID APPROVAL REQUIRED',margin,738,{width:contentWidth-55,lineBreak:false});doc.font(boldFont).fontSize(7).text(`${i+1}/${r.count}`,pageWidth-margin-45,738,{width:45,align:'right',lineBreak:false});}}

export function createExecutivePdf(raw:OpportunityAnalysis):Promise<Buffer>{
  const analysis=enforceAuthoritativeAnalysis(raw);
  analysis.ptwStrategy=preserveCurrentStrategy(analysis,raw.ptwStrategy);
  return new Promise((resolve,reject)=>{
    const regular=Buffer.from(regularFontData,'base64'),bold=Buffer.from(boldFontData,'base64');
    const doc=new PDFDocument({font:regular as unknown as string,size:'LETTER',margins:{top:margin,bottom:margin,left:margin,right:margin},bufferPages:true,autoFirstPage:false});
    doc.registerFont(regularFont,regular);doc.registerFont(boldFont,bold);
    const chunks:Buffer[]=[];doc.on('data',b=>chunks.push(b));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
    try{buildBrief(new Layout(doc,analysis));footers(doc);doc.end();}catch(error){doc.destroy();reject(error);}
  });
}
export const executivePdfLayout={pageWidth,pageHeight,margin,contentWidth};
