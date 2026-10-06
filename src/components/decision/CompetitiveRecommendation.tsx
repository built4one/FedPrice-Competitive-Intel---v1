import { useMemo } from 'react';
import type { OpportunityAnalysis } from '../../types';
import { calculateCompetitivePosition, type CompetitivePosition } from '../../domain/ptw/competitivePosition';
const money=(v:number|null)=>v==null ? 'Model incomplete' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
export default function CompetitiveRecommendation({analysis}:{analysis:OpportunityAnalysis}){
  const p:CompetitivePosition=useMemo(()=>calculateCompetitivePosition(analysis),[analysis]);
  return <section aria-label="Provisional competitive pricing recommendation" className="overflow-hidden rounded-2xl border border-teal-200 bg-white">
    <div className="bg-[#103243] px-5 py-6 text-white sm:px-7">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-200">Federal Market Position · {p.status.replaceAll('_',' ')}</p>
      <h2 className="mt-4 text-sm font-bold text-slate-300">{p.evaluationComplete ? 'Recommended total evaluated price' : 'Provisional price of modeled basket'}</h2>
      <strong className="mt-2 block text-3xl font-black sm:text-4xl">{money(p.target)}</strong>
      <p className="mt-3 text-sm leading-6 text-slate-200">{p.rationale}</p>
      <p className="mt-3 text-xs leading-5 text-teal-100">{p.decisionRequest}</p>
    </div>
    <div className="grid gap-px bg-slate-200 sm:grid-cols-3">{p.scenarios.map(s=><div key={s.id} className={`p-5 ${s.selected?'bg-teal-50':'bg-white'}`}><p className="text-xs font-bold text-slate-500">{s.label}{s.selected?' · SELECTED':''}</p><strong className="mt-2 block text-xl">{money(s.total)}</strong><p className="mt-2 text-xs leading-5 text-slate-600">{s.rationale}</p><p className="mt-2 text-xs leading-5 text-slate-500">{s.condition}</p></div>)}</div>
    <div className="space-y-4 p-5">
      <p className="text-xs leading-5 text-slate-500">{p.rangeMeaning}</p>
      <div className="flex flex-wrap gap-2">{Object.entries(p.confidence).map(([name,value])=><span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600" key={name}>{name}: {value.replaceAll('_',' ')}</span>)}</div>
      {!!p.missing.length && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950"><strong>Validation remains open</strong><ul className="mt-2 list-disc space-y-1 pl-4">{p.missing.map(v=><li key={v}>{v}</li>)}</ul></div>}
      <details><summary className="cursor-pointer text-sm font-bold text-teal-800">Role pricing, sensitivities and validation owners</summary>
        <div className="mt-4 overflow-x-auto"><table className="min-w-[760px] w-full text-left text-xs"><thead><tr><th className="p-2">Role / period</th><th className="p-2">Hours</th><th className="p-2">Selected rate / hr</th><th className="p-2">Why this rate</th></tr></thead><tbody>{p.rows.map(r=><tr className="border-t border-slate-100" key={r.id}><td className="p-2">{r.title} / {r.period}</td><td className="p-2">{r.hours.toLocaleString()}</td><td className="p-2">{money(r.recommendedRate)}</td><td className="p-2">{r.protectionReason} Sources: {r.evidenceIds.join(', ')}</td></tr>)}</tbody></table></div>
        <ul className="mt-4 space-y-2 text-xs text-slate-600">{p.sensitivities.map(s=><li key={`${s.label}-${s.change}`}><strong>{s.label}: {s.change}</strong> → {s.delta>=0?'+':''}{money(s.delta)}. {s.rationale}</li>)}</ul>
        <ul className="mt-4 space-y-2 text-xs text-slate-600">{p.actions.map(a=><li key={a.owner}><strong>{a.owner}:</strong> {a.action} {a.consequence}</li>)}</ul>
      </details>
      <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">Phase 2 — Company position adds authorized company costs, workforce, suppliers and margin requirements. Public labor proxies do not establish company cost or an executable floor.</p>
    </div>
  </section>;
}
