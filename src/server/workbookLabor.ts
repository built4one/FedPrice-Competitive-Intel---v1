import type {AiAnalysisDraft,LaborSignal} from '../types';
import type {PackageFile} from './packageInventory';

/** Reconcile explicit worksheet cells, never infer hours from wages or headcount. */
export function reconcileWorkbookLabor<T extends Pick<AiAnalysisDraft,'deal'|'evidence'|'gaps'>>(input:T,files:PackageFile[]):T {
 const draft=structuredClone(input);
 const schedules:Array<{signals:LaborSignal[];source:string;months:number}>=[];
 for(const file of files){
  if(file.mimetype!=='text/plain')continue;
  const text=file.buffer.toString('utf8');
  const name=/SOURCE SPREADSHEET: ([^\n]+)/.exec(text)?.[1]?.trim();
  if(!name)continue;
  for(const section of text.split(/\nSHEET: /).slice(1)){
   const sheet=section.split('\n')[0].trim();
   const rows=new Map<number,Map<string,string>>(),raw=new Map<number,string>();
   for(const line of section.split('\n').slice(1)){
    for(const match of line.matchAll(/(?:^|\t)([A-Z]+)(\d+): ([^\t]*)/g)){
     const number=Number(match[2]);if(!rows.has(number))rows.set(number,new Map());
     rows.get(number)!.set(match[1],match[3].trim());raw.set(number,line);
    }
   }
   const headers=[...rows].filter(([,row])=>[...row.values()].some(v=>/^labor categor(?:y|ies)$/i.test(v)));
   if(headers.length!==1)continue;
   const [headerNumber,header]=headers[0];
   const titleColumn=[...header].find(([,v])=>/^labor categor(?:y|ies)$/i.test(v))![0];
   const columnNumber=(column:string)=>[...column].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);
   const hourColumns=[...header].filter(([,v])=>/^(?:estimated |total |evaluated )?hours$/i.test(v)).map(([c])=>c).sort((a,b)=>columnNumber(a)-columnNumber(b));
   // A separate optional sheet without explicit period headers remains unresolved.
   if(!hourColumns.length)continue;
   let startMonth=0;
   const periods=hourColumns.map(column=>{
    const above=[...rows].filter(([n])=>n<headerNumber).map(([n,row])=>({n,value:row.get(column)||''}));
    const duration=above.map(r=>r.value.match(/\b(\d+)\s*[- ]?\s*months?\b/i)).find(Boolean);
    const months=duration?Number(duration[1]):0;
    const label=above.map(r=>r.value).find(v=>/base|option|extension/i.test(v)&&/month/i.test(v))||'';
    const result={column,label,startMonth,months};startMonth+=months;return result;
   });
   if(periods.some(p=>!p.months||p.months>120)||startMonth!==draft.deal.performanceMonths)continue;
   const signals:LaborSignal[]=[];let invalid=false;
   for(const [rowNumber,row] of rows){
    if(rowNumber<=headerNumber)continue;
    const title=row.get(titleColumn)?.trim();
    if(!title||/^(?:labor |grand |sub)?total\b/i.test(title))continue;
    const values=periods.map(p=>row.get(p.column));
    if(!values.some(v=>v!==undefined))continue;
    if(values.some(v=>!v||!/^\d[\d,]*(?:\.\d+)?$/.test(v))){invalid=true;break;}
    const original=draft.deal.laborSignals.find(s=>s.title.trim().toLowerCase()===title.toLowerCase());
    signals.push({...original,title,quantity:undefined,annualHours:undefined,
     section:`${name} | ${sheet} | ${titleColumn}${rowNumber}`,
     periods:periods.map((p,i)=>({label:p.label,startMonth:p.startMonth,months:p.months,
      quantity:Number(values[i]!.replace(/,/g,''))===0?0:1,totalHours:Number(values[i]!.replace(/,/g,'')),section:`${name} | ${sheet} | ${p.column}${rowNumber} (documented row hours; quantity counts one worksheet line, not inferred FTE)`})),
    });
    const id=`WORKBOOK-${name}-${sheet}-${rowNumber}`;
    draft.evidence=draft.evidence.filter(e=>e.id!==id);
    draft.evidence.push({id,type:'SOLICITATION_FACT',sourceLabel:name,section:`${sheet} | row ${rowNumber}`,claim:`Documented evaluated hours for ${title}; every supplied base and option period retained.`,excerpt:raw.get(rowNumber)!,confidence:100});
   }
   if(!invalid&&signals.length)schedules.push({signals,source:`${name} | ${sheet}`,months:startMonth});
  }
 }
 // Multiple candidate schedules require analyst reconciliation rather than a guess.
 if(schedules.length!==1)return input;
 const schedule=schedules[0];
 draft.deal.laborSignals=schedule.signals;
 draft.deal.laborModelComplete=true;
 draft.deal.laborModelSource=`${schedule.source}: ${schedule.signals.length} documented rows across all ${schedule.months} stated performance months. Hours are read directly from worksheet cells; no headcount or annual hours inferred. Separately listed extension scenarios require evaluation-basis review.`;
 return draft;
}
