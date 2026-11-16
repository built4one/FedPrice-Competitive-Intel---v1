import type ExcelJS from 'exceljs';
import type {OpportunityAnalysis} from '../types';
import {compactMoney,displayText,executiveBrief} from '../presentation/brief';
export function addSummarySheet(w:ExcelJS.Workbook,a:OpportunityAnalysis){
 if(w.getWorksheet('Summary'))return;
 const s=w.addWorksheet('Summary'),b=executiveBrief(a);s.columns=[{header:'Executive brief',key:'field',width:30},{header:a.deal.title,key:'value',width:110}];
 s.addRows([{field:'Recommended price',value:compactMoney(b.p.target)},{field:'Range',value:`${compactMoney(b.p.rangeLow)} – ${compactMoney(b.p.rangeHigh)}`},{field:'Confidence',value:b.p.confidenceLabel},{field:'Basis',value:b.basis},...(a.historical?[{field:'Historical cutoff',value:a.historical.cutoff}]:[]),...b.why.map(value=>({field:'Why this price',value})),...b.drivers.map(x=>({field:'What could move it',value:`${x.label}: ${x.delta==null?'Not separately quantified':(x.delta>0?'+':'')+compactMoney(x.delta)}. ${x.change}`})),...b.actions.map(value=>({field:'What to do next',value})),...b.gaps.map(value=>({field:"What's missing",value})),{field:'Full detail',value:'See the remaining sheets for complete arithmetic, strategy, assumptions and evidence.'}]);
 s.eachRow((r,i)=>{r.alignment={vertical:'top',wrapText:true};r.height=i===1?32:32;r.eachCell(c=>{if(typeof c.value==='string')c.value=displayText(c.value);});});s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF10243E'}};s.views=[{state:'frozen',ySplit:1}];s.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1};
}
export function formatWorkbook(w:ExcelJS.Workbook){w.eachSheet(s=>s.eachRow(r=>r.eachCell(c=>{if(typeof c.value==='number'||c.type===6){if(!c.numFmt||c.numFmt==='General')c.numFmt='#,##0.##';}else if(typeof c.value==='string')c.value=displayText(c.value);})));}
