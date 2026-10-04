import { useState } from 'react';
import type { OpportunityAnalysis } from '../../types';
import { calculatePricingScenario } from '../../domain/ptw/pricingScenario';

const blank = () => ({label:'',quantity:'',lowUnitPrice:'',targetUnitPrice:'',highUnitPrice:'',source:''});
const money = (n:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
export default function PricingScenarioPanel({analysis,onUpdate}:{analysis:OpportunityAnalysis;onUpdate:(a:OpportunityAnalysis)=>Promise<void>}) {
  const saved = analysis.pricingScenario;
  const [basis,setBasis] = useState(saved?.inputs.evaluationBasis || '');
  const [basisSource,setBasisSource] = useState(saved?.inputs.basisSource || '');
  const [lines,setLines] = useState(saved?.inputs.lines.map(row=>({...row,quantity:String(row.quantity),lowUnitPrice:String(row.lowUnitPrice),targetUnitPrice:String(row.targetUnitPrice),highUnitPrice:String(row.highUnitPrice)})) || [blank()]);
  const [confirmed,setConfirmed] = useState(false);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const [dirty,setDirty] = useState(false);
  const change = () => {setDirty(true);setConfirmed(false);setError('');};
  const save = async () => {
    setError('');setSaving(true);
    try {
      if (lines.some(row=>[row.quantity,row.lowUnitPrice,row.targetUnitPrice,row.highUnitPrice].some(v=>v.trim()===''))) throw new Error('Enter every quantity and unit price. No missing amount is treated as zero.');
      const scenario=calculatePricingScenario({evaluationBasis:basis,basisSource,completenessConfirmed:confirmed,lines:lines.map(row=>({...row,quantity:Number(row.quantity),lowUnitPrice:Number(row.lowUnitPrice),targetUnitPrice:Number(row.targetUnitPrice),highUnitPrice:Number(row.highUnitPrice)}))});
      await onUpdate({...analysis,pricingScenario:scenario});setDirty(false);
    } catch(e) {setError(e instanceof Error && e.name==='ZodError' ? 'Complete the evaluation basis, source notes, positive quantities and ordered low/target/high unit prices; confirm the full evaluation scope.' : e instanceof Error ? e.message : 'Could not save scenario.');}
    finally {setSaving(false);}
  };
  return <section aria-label="Conditional pricing scenarios" className="mt-6 rounded-2xl border border-blue-200 bg-white p-5 sm:p-6">
    <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Analyst scenario model</p>
    <h2 className="mt-2 text-xl font-black">Price the proposed approach</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Enter the quantities and fully burdened offered unit prices for every evaluated CLIN and period. Use separate rows for option years or different assumptions. These are conditional offer scenarios; competitive support comes from the evidence and strategic assessment.</p>
    {saved && <div className={`mt-5 rounded-xl p-4 ${dirty?'bg-amber-50':'bg-blue-50'}`}>
      <p className="text-xs font-bold">{dirty?'Saved scenario · edits below are not applied':'Conditional target · analyst inputs'}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">{[['Lower offer',saved.low],['Target offer',saved.target],['Upper offer',saved.high]].map(([label,value])=><div key={label}><p className="text-xs text-slate-600">{label}</p><strong className="text-xl">{money(value as number)}</strong></div>)}</div>
      <p className="mt-3 text-xs leading-5">{saved.formula} This calculation does not establish a winning price or probability.</p>
    </div>}
    <details className="mt-5" open={!saved}>
      <summary className="cursor-pointer text-sm font-bold text-blue-700">{saved?'Edit assumptions and recalculate':'Define the evaluation basis and inputs'}</summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Evaluation basis<textarea value={basis} onChange={e=>{setBasis(e.target.value);change();}} className="mt-1 w-full rounded-lg border p-3 text-sm font-normal" placeholder="Exactly which CLINs and base/option periods are evaluated?" /></label>
        <label className="text-sm font-semibold">Evaluation source<input value={basisSource} onChange={e=>{setBasisSource(e.target.value);change();}} className="mt-1 w-full rounded-lg border p-3 text-sm font-normal" placeholder="File, Section M, page or pricing sheet" /></label>
      </div>
      <div className="mt-4 space-y-4">{lines.map((row,i)=><fieldset key={i} className="rounded-xl border bg-slate-50 p-4"><legend className="px-2 text-xs font-bold">CLIN / period {i+1}</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{([['label','CLIN / period'],['quantity','Evaluated quantity'],['lowUnitPrice','Lower unit price ($)'],['targetUnitPrice','Target unit price ($)'],['highUnitPrice','Upper unit price ($)']] as const).map(([key,label])=><label key={key} className="text-xs font-semibold">{label}<input aria-label={`${label} ${i+1}`} type={key==='label'?'text':'number'} min="0" step="any" value={row[key]} onChange={e=>{setLines(current=>current.map((v,j)=>j===i?{...v,[key]:e.target.value}:v));change();}} className="mt-1 w-full rounded-lg border bg-white p-2.5" /></label>)}</div>
        <label className="mt-3 block text-xs font-semibold">Quantity and price sources / assumptions<input aria-label={`Sources and assumptions ${i+1}`} value={row.source} onChange={e=>{setLines(current=>current.map((v,j)=>j===i?{...v,source:e.target.value}:v));change();}} className="mt-1 w-full rounded-lg border bg-white p-2.5" placeholder="Cite the quantity and rate evidence, or identify the analyst assumption and validation needed." /></label>
        {lines.length>1 && <button type="button" onClick={()=>{setLines(v=>v.filter((_,j)=>j!==i));change();}} className="mt-2 text-xs font-bold text-red-700">Remove row {i+1}</button>}
      </fieldset>)}</div>
      <button type="button" disabled={lines.length>=40} onClick={()=>{setLines(v=>[...v,blank()]);change();}} className="mt-3 text-sm font-bold text-blue-700">+ Add evaluated CLIN / period</button>
      <label className="mt-5 flex gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1" />I checked that these rows include the full evaluation scope and that offered rates include all applicable burdens, fees, options and adjustments. This is a conditional testing scenario.</label>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={save} disabled={!confirmed||saving} className="mt-4 rounded-lg bg-[#10243e] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">{saving?'Saving…':'Calculate and save scenarios'}</button>
    </details>
  </section>;
}
