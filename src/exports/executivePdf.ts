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
  const {analysis:a,doc:d}=l,p=a.competitivePosition!;
  const subtitle=[a.deal.solicitationNumber,a.deal.agency,new Date(a.meta.analyzedAt).toISOString().slice(0,10)].filter(Boolean).join(' | ');
  l.page('Your competitive position',subtitle);
  l.text(a.deal.title,true,11);
  if(a.meta.packageCoverage?.mode==='HISTORICAL')l.text('HISTORICAL PRACTICE — closed solicitation using current research; not a live bid or historical price backtest.',true,8);
  const y=l.y;
  d.roundedRect(margin,y,contentWidth,111,5).fill(colors.navy);
  d.font(boldFont).fontSize(9).fillColor('#B9DDDB').text('RECOMMENDED PTW',margin+16,y+15,{width:contentWidth-32,lineBreak:false});
  d.font(boldFont).fontSize(p.target==null?22:31).fillColor('white').text(money(p.target),margin+16,y+36,{width:contentWidth-32,lineBreak:false});
  d.font(regularFont).fontSize(10).fillColor('#D4E6E7').text(`Competitive corridor: ${money(p.rangeLow)} - ${money(p.rangeHigh)}`,margin+16,y+82,{width:contentWidth-32,lineBreak:false});
  l.y=y+125;
  l.title('Why this position?');l.text(p.rationale);
  l.text(p.judgment.find(j=>j.factor==='Labor and unit-price evidence')!.finding,false,9);
  l.title(`Recommendation Confidence: ${p.confidenceLabel}`);l.text(p.confidenceReason);
  if(a.meta.packageCoverage)l.text(a.meta.packageCoverage.freshness.message,false,8,colors.muted);
  l.title('What could move it?');
  const movers=[...p.sensitivities].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,2);
  if(movers.length)l.table(['Input change','Evaluated-price effect'],[380,148],movers.map(s=>[`${s.label}: ${s.change}`,`${s.delta>=0?'+':''}${money(s.delta)}`]));
  else l.text('The lower and upper cases represent the stated alternative pricing assumptions; validate the highest-value item first.');
  l.title('What should we do next?');l.text(`${p.actions[0].owner}: ${p.actions[0].action}`,true,9);
  l.text('Market decision support; not a win probability. Company costs, margin and final bid approval remain separate.',false,8,colors.muted);

  l.page('The government buying logic',subtitle);
  l.table(['Controlling fact','Extracted basis'],[140,388],[['Set-aside / NAICS',`${a.deal.setAside||'Unconfirmed'} / ${a.deal.naics||'Unconfirmed'}`],['Contract / period',`${a.deal.contractType}; ${a.deal.periodOfPerformance}`],['Evaluation',a.deal.evaluationMethod],['Evaluated price',`${a.deal.evaluationPricing?.basis||'Validate the formula'}. Source: ${a.deal.evaluationPricing?.source||'Unresolved'}`],['Extension rule',`${a.deal.evaluationPricing?.extensionRateRule||'UNKNOWN'}; ${a.deal.evaluationPricing?.extensionSource||'Confirm applicability'}`]]);
  l.title('Scored factors, thresholds and mandatory gates');
  const rules=governmentRules(a.deal,a.evidence);
  // Never truncate a decision branch or threshold to fit a fixed page count.
  const selected=rules.filter(r=>/evaluat|rating|confidence|clearance|set.aside|technical|award|acceptable|lowest|price/i.test(r.name+' '+r.detail));
  const seen=new Set<string>();
  (selected.length?selected:rules).forEach(r=>{if(seen.has(r.detail.toLowerCase()))return;seen.add(r.detail.toLowerCase());l.text(`${r.name}: ${r.detail} [${r.source}]`,false,8);});
  if(!rules.length)l.text('Confirm the controlling evaluation instructions; no additional scored factors have been invented.');
  l.text(p.ceilingExplanation,false,8,colors.muted);

  l.page('Why the numbers hold together',subtitle);
  l.table(['Calculated case','Evaluated price','Use'],[155,118,255],p.scenarios.map(s=>[s.label,money(s.total),s.selected?'Selected working competitive position':s.condition]));
  l.text(`Source labor hours: ${p.totalHours.toLocaleString('en-US')}; priced hours: ${p.pricedHours.toLocaleString('en-US')}; ${p.unpricedRows.length} unpriced source rows. Bounded price assumptions account for ${Math.round(p.assumptionShare*100)}% of the modeled total.`,true,9);
  l.title('Pricing judgment');
  p.judgment.forEach(j=>l.text(`${j.factor}: ${j.finding} ${j.effect}`,false,8));
  l.title('Calculation chain');
  l.text('Labor rows = evaluated hours × selected loaded rate × documented period factor. Unit-price lines = evaluated quantity × selected unit-price assumption. Specified fixed components are added once. There is no second labor burden or profit. The workbook preserves row formulas, source records and the complete assumption register.',false,8);
  if(p.components.length)l.text(`Other evaluated components: ${p.components.map(c=>`${c.label}: ${money(c.includedAmount)}`).join('; ')}.`,false,8);
  l.text(p.rangeMeaning,false,8,colors.muted);

  l.page('Assumptions, evidence and next actions',subtitle);
  l.table(['Owner','Next action / consequence'],[115,413],p.actions.map(x=>[x.owner,`${x.action} ${x.consequence}`]));
  l.title('Most influential assumptions');
  const assumptionItems=p.planningRows.slice(0,4).map(i=>`${i.label}: ${money(i.low)} / ${money(i.central)} / ${money(i.high)} per ${i.unit}. ${i.basis}. ${i.rationale}`);
  (assumptionItems.length?assumptionItems:p.assumptions.slice(0,3)).forEach(x=>l.text(x,false,8));
  l.text('Full lower/upper conditions and quantities are in Bounded Assumptions; every role, unit line and component is retained in the workbook.',false,8,colors.muted);
  l.title('Source and calculation lineage');
  l.text(`Run ${a.id}. Analysis: ${a.meta.analyzedAt}. Recommendation engine: ${p.version}.`,false,8);
  l.text(`Confidence drivers: quantity/evaluation ${p.confidence.quantities}; rate relevance ${p.confidence.rateRelevance}; competitive evidence ${p.confidence.competition}. Company execution is not assessed in Phase 1.`,false,8);
  l.text((a.meta.connectors||[]).map(c=>`${c.name}: ${c.status.replaceAll('_',' ')} (${c.recordsFound} records)`).join('; ')||'Source coverage is retained in the workbook.',false,8);
  const conflicts=a.deal.sourceConflicts?.filter(c=>sourceConflictStatus(c,a.deal)==='OPEN')||[];
  if(conflicts.length){l.title('Unresolved source conflicts');conflicts.forEach(c=>l.text(`${c.topic}: ${c.resolution} [${c.sources.join('; ')}]`,false,8));}
  if(p.missing.length)l.text(`${p.missing.length} validation items are preserved in the workbook. First: ${p.missing[0]}`,false,8,colors.amber);
  l.text('Phase 2 adds authorized company economics, workforce, suppliers and margin requirements. Public price proxies do not establish an executable company cost floor.',false,8,colors.muted);
}

function footers(doc:PDFKit.PDFDocument){const r=doc.bufferedPageRange();for(let i=r.start;i<r.start+r.count;i++){doc.switchToPage(i);doc.moveTo(margin,728).lineTo(pageWidth-margin,728).strokeColor(colors.line).lineWidth(.6).stroke();doc.font(regularFont).fontSize(7).fillColor(colors.muted).text('PROVISIONAL DECISION SUPPORT - ANALYST REVIEW AND COMPANY BID APPROVAL REQUIRED',margin,738,{width:contentWidth-55,lineBreak:false});doc.font(boldFont).fontSize(7).text(`${i+1}/${r.count}`,pageWidth-margin-45,738,{width:45,align:'right',lineBreak:false});}}

export function createExecutivePdf(raw:OpportunityAnalysis):Promise<Buffer>{
  const analysis=raw.frozenPrediction?structuredClone(raw):enforceAuthoritativeAnalysis(raw);
  if(!raw.frozenPrediction)analysis.ptwStrategy=preserveCurrentStrategy(analysis,raw.ptwStrategy);
  return new Promise((resolve,reject)=>{
    const regular=Buffer.from(regularFontData,'base64'),bold=Buffer.from(boldFontData,'base64');
    const doc=new PDFDocument({font:regular as unknown as string,size:'LETTER',margins:{top:margin,bottom:margin,left:margin,right:margin},bufferPages:true,autoFirstPage:false});
    doc.registerFont(regularFont,regular);doc.registerFont(boldFont,bold);
    const chunks:Buffer[]=[];doc.on('data',b=>chunks.push(b));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
    try{const layout=new Layout(doc,analysis);buildBrief(layout);
      if(analysis.historical){layout.page('Historical test record',`Cutoff: ${analysis.historical.cutoff}`);
       layout.text(`Classification: ${analysis.validation?.comparisonClass||(analysis.historicalReview?'VALIDATED_BACKTEST':'RETROSPECTIVE_APPROXIMATION')}`,true);
       layout.text(`Prediction frozen: ${analysis.frozenPrediction?.frozenAt}. SHA-256: ${analysis.frozenPrediction?.hash}`,false,8);
       analysis.historical.limitations.forEach(v=>layout.text(v,false,8));
       layout.table(['Source','Decision / publication'],[330,198],analysis.historical.documents.map(v=>[short(v.name,150),`${v.audit.decision} / ${v.audit.publishedAt||'unverified'}`]));
       const v=analysis.validation;if(v){layout.title('Outcome comparison');layout.text(`Actual: ${money(v.actualValue)} (${v.actualValueType}). ${v.comparableToPrediction?`Absolute error / actual: ${v.expectedErrorPct}%. Within corridor: ${v.inRange?'yes':'no'}.`:'Not comparable; excluded from accuracy scoring.'}`);layout.text(`Outcome source: ${v.actualSource||'Unspecified'}`,false,8);}
      }footers(doc);doc.end();}catch(error){doc.destroy();reject(error);}
  });
}
export const executivePdfLayout={pageWidth,pageHeight,margin,contentWidth};
