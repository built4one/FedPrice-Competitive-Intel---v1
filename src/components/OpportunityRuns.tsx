import { useState } from 'react';
import { Archive, ArrowRight, Clock3, Download, FilePlus2, Plus, Search, Trash2 } from 'lucide-react';
import type { OpportunityAnalysis } from '../types';
interface Props { runs: OpportunityAnalysis[]; onSelect: (id: string) => void; onNew: () => void; onDelete: (id: string) => void; onArchive: (id: string) => void; onImport?: () => void; }
const money = (value: number | null) => value === null ? 'Pending evidence' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
export default function OpportunityRuns({ runs, onSelect, onNew, onDelete, onArchive, onImport }: Props) {
  const [query, setQuery] = useState('');
  const saved = (runs || []).filter(Boolean);
  const filtered = saved.filter(run => [run.deal?.title, run.deal?.agency, run.deal?.solicitationNumber].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
    <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
      <div><p className="fmp-eyebrow">Decision workspace</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Your pricing decisions</h1><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Return to the evidence. Compare your position. Decide what comes next.</p></div>
      <button onClick={onNew} className="fmp-primary shrink-0"><Plus size={18}/>New analysis</button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 py-5">
      <p className="text-sm font-medium text-slate-600">{saved.length} saved {saved.length === 1 ? 'analysis' : 'analyses'}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2"><a href="/api/historical-scorecard.csv" className="fmp-link text-xs"><Download size={15}/>Historical test scorecard</a>{onImport && <button onClick={onImport} className="fmp-link text-xs">Import browser runs</button>}</div>
    </div>
    {saved.length === 0 ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid lg:grid-cols-[1.2fr_1fr]">
        <div className="p-7 sm:p-10"><span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-700"><FilePlus2 size={26}/></span><h2 className="mt-6 text-2xl font-semibold tracking-tight">Your next decision starts here.</h2><p className="mt-3 max-w-md text-sm leading-7 text-slate-600">Bring a solicitation package to build a pricing recommendation grounded in its requirements, market evidence, and explicit assumptions.</p><button onClick={onNew} className="fmp-primary mt-6">Upload a package <ArrowRight size={17}/></button><p className="mt-3 text-xs leading-5 text-slate-500">ZIP, PDF, DOCX, XLSX, TXT or CSV · Up to 50 MB</p></div>
        <div className="border-t border-slate-200 bg-[#edf3ff] p-7 sm:p-10 lg:border-l lg:border-t-0"><p className="fmp-eyebrow">From package to position</p><ol className="mt-6 space-y-6">{[['01','Understand the opportunity','Review scope, evaluation criteria, and the details that drive price.'],['02','Assess the evidence','See source support, gaps, and assumptions before relying on a recommendation.'],['03','Make an informed decision','Review your recommended price to win, corridor, confidence, and next actions.']].map(([n,title,body])=><li className="flex gap-4" key={n}><span className="pt-1 font-mono text-xs text-blue-700">{n}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div></li>)}</ol></div>
      </div>
    </section> : <>
      <label className="mb-6 flex max-w-xl items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 text-slate-500"><Search size={18}/><span className="sr-only">Search saved analyses</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title, agency, or solicitation…" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-900"/></label>
      <p role="status" className="sr-only">{filtered.length} analyses shown</p>
      {filtered.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><h2 className="font-semibold">No matching analyses</h2><p className="mt-2 text-sm text-slate-600">Try another title, agency, or solicitation number.</p><button className="fmp-link mt-3" onClick={()=>setQuery('')}>Clear search</button></div> : <div className="grid gap-5 lg:grid-cols-2">{filtered.map(run=><article key={run.id} className="fmp-run-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">{run.deal?.agency || 'Agency pending'}</p><h2 className="mt-3 break-words text-lg font-semibold leading-7">{run.deal?.title || 'Untitled analysis'}</h2><p className="mt-2 break-words text-xs text-slate-500">{run.deal?.solicitationNumber || 'Solicitation number pending'}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-slate-200 py-5 sm:grid-cols-3"><div><dt className="text-xs text-slate-500">Recommended PTW</dt><dd className="mt-2 text-xl font-semibold tracking-tight text-blue-800">{run.competitivePosition?.target != null ? money(run.competitivePosition.target) : 'Pending'}</dd></div><div><dt className="text-xs text-slate-500">Confidence</dt><dd className="mt-2 text-sm font-semibold">{run.competitivePosition?.confidenceLabel || 'Limited'}</dd></div><div><dt className="text-xs text-slate-500">Basis</dt><dd className="mt-2 text-sm font-semibold">{!run.competitivePosition ? 'Pending' : run.competitivePosition.assumptionShare ? 'Assumption-led' : 'Evidence-led'}</dd></div></dl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={14}/>{run.meta?.analyzedAt ? new Date(run.meta.analyzedAt).toLocaleDateString() : 'Date unavailable'}</span><button onClick={()=>onSelect(run.id)} className="fmp-link">Open brief <ArrowRight size={16}/></button></div>
        <div className="mt-2 flex items-center gap-3 border-t border-slate-100 pt-2"><button onClick={()=>onArchive(run.id)} aria-label={`Archive ${run.deal?.title || 'analysis'}`} title="Hide from saved runs and scorecard; preserve the original record" className="inline-flex min-h-11 items-center gap-2 text-xs text-slate-600 hover:text-blue-700"><Archive size={15}/>Archive</button>{!run.frozenPrediction&&<button onClick={()=>onDelete(run.id)} aria-label={`Delete ${run.deal?.title || 'analysis'}`} className="ml-auto inline-flex min-h-11 items-center gap-2 px-2 text-xs text-slate-500 hover:text-red-700"><Trash2 size={15}/>Delete</button>}</div>
      </article>)}</div>}
    </>}
  </div>;
}
