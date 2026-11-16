import {present} from '../../presentation/brief';
import type { OpportunityAnalysis } from '../../types';
import type { StrategyStatement } from '../../domain/ptw/strategy';

export default function PtwStrategyBrief({analysis, onGenerate, generating = false}: {
  analysis: OpportunityAnalysis; onGenerate?: () => void; generating?: boolean;
}) {
  const result = analysis.ptwStrategy;
  const generate = onGenerate && <button type="button" onClick={onGenerate} disabled={generating} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{present(generating ? 'Comparing strategies…' : result?.status === 'DRAFT' ? 'Reassess strategy' : 'Build strategic assessment')}</button>;
  if (result?.status !== 'DRAFT') return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6" aria-label="PTW strategic assessment">
    <h2 className="text-xl font-black text-slate-950">The competitive decision comes first</h2>
    <p className="mt-2 text-sm leading-6 text-slate-700">Compare approaches to delivery and pricing against the government’s evaluation, competitor threats, and evidence. Select a strategy and identify what would change that decision.</p>
    <p role="status" className="my-3 text-sm text-slate-600">{present(result?.reason || 'This run contains market evidence. A strategic assessment has not been generated yet.')}</p>{present(generate)}
  </section>;
  const s = result.strategy;
  const selected = s.options.find(o => o.id === s.recommendation.selectedOptionId);
  if (!selected) return <p role="alert">The strategy selection is invalid. Reassess before using it.</p>;
  const statement = (value: StrategyStatement) => <Statement value={value} analysis={analysis} />;
  return <section className="space-y-5" aria-label="PTW strategic assessment">
    <div className="rounded-3xl bg-[#10243e] p-6 text-white sm:p-8">
      <p className="text-xs font-black uppercase tracking-widest text-blue-200">PTW strategy · Analyst review required</p>
      <h2 className="mt-3 text-2xl font-black">{present(selected.name)}</h2>
      <p className="mt-3 text-base leading-7">{present(s.recommendation.rationale.text)}</p>
      <p className="mt-3 text-xs text-blue-200">{present(s.recommendation.rationale.kind.toLowerCase())} · Evidence: {present(s.recommendation.rationale.evidenceIds.join(', ') || 'Working assumption')} · Source support awaits analyst review.</p>
      {present(s.recommendation.rationale.validationAction && <p className="mt-2 text-sm text-slate-300">Validate: {present(s.recommendation.rationale.validationAction)}</p>)}
      <p className="mt-5 border-t border-white/15 pt-4 text-sm text-slate-300">Delivery-strategy draft. The provisional price recommendation uses explicit role-rate assumptions. Unquantified productivity, teaming savings and premiums below remain hypotheses pending a separate calculation.</p>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-black">How the government chooses</h3>
      <div className="mt-3 space-y-3">{present(statement(s.buyingDecision.evaluationMethod))}{present(statement(s.buyingDecision.priceTradeoff))}</div>
      <h4 className="mt-5 text-sm font-bold">Compliance gates</h4>
      {present(s.buyingDecision.complianceGates.length ? s.buyingDecision.complianceGates.map((v,i) => <div className="mt-2" key={i}>{present(statement(v))}</div>) : <p className="mt-2 text-sm text-amber-800">No gates were identified in this assessment. Validate the solicitation’s mandatory requirements.</p>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      {present(s.options.map(option => <article key={option.id} className={`rounded-2xl border p-5 ${option.id === selected.id ? 'border-blue-400 bg-blue-50/40' : 'border-slate-200 bg-white'}`}>
        <h3 className="text-base font-black">{present(option.name)}{present(option.id === selected.id && <span className="ml-2 rounded bg-blue-600 px-2 py-1 text-[10px] text-white">SELECTED</span>)}</h3>
        {present((['winLogic','evaluationAdvantage','likelyRivalResponse','principalRisk'] as const).map((key,i) => <div className="mt-4" key={key}><h4 className="mb-1 text-xs font-black uppercase text-slate-500">{present(['Why it could win','Evaluation benefit','Likely rival response','Main risk'][i])}</h4>{present(statement(option[key]))}</div>))}
        <details className="mt-4"><summary className="cursor-pointer text-sm font-bold text-blue-700">Delivery changes and pricing levers</summary><div className="mt-3 space-y-3">{present([...option.deliveryChanges, ...option.pricingLevers].map((v,i) => <div key={i}>{present(statement(v))}</div>))}</div></details>
        {present(s.recommendation.alternatives.filter(a => a.optionId === option.id).map(a => <div className="mt-4 border-t border-slate-200 pt-3" key={a.optionId}><h4 className="mb-1 text-xs font-black uppercase text-slate-500">Why it was not selected</h4>{present(statement(a.reason))}</div>))}
      </article>))}
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-black">Competitive response assessment</h3>
      {present(!s.competitors.length && <p className="mt-2 text-sm text-amber-800">Specific competitor positions remain unestablished. A company’s capabilities or contract history alone do not establish bid intent.</p>)}
      {present(s.competitors.map((c,i) => <div className="mt-4 space-y-2 border-t border-slate-100 pt-4" key={`${c.name}-${i}`}><h4 className="font-bold">{present(c.name)} <span className="text-xs font-normal text-slate-500">Bid intent: {present(c.bidIntent.toLowerCase())}</span></h4>{present(statement(c.intentBasis))}{present(statement(c.likelyApproach))}{present(statement(c.threat))}</div>))}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h3 className="font-black">What would change the recommendation</h3><div className="mt-3 space-y-4">{present(s.recommendation.changeTriggers.map((v,i) => <div key={i}>{present(statement(v))}</div>))}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black">Validation actions</h3><ol className="mt-3 list-decimal space-y-4 pl-5">{present(s.recommendation.nextActions.map((v,i) => <li key={i}>{present(statement(v))}</li>))}</ol></div>
    </div>
    {present(!!s.missingInputs.length && <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black">Inputs needed to price and validate the strategy</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">{present(s.missingInputs.map((v,i) => <li key={i}>{present(v)}</li>))}</ul></div>)}
    {present(generate)}
  </section>;
}

function Statement({value, analysis}: {value: StrategyStatement; analysis: OpportunityAnalysis}) {
  return <div className="text-sm leading-6 text-slate-700">
    <p>{present(value.text)}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{present(value.kind === 'FACT' ? 'Sourced claim · review required' : value.kind.toLowerCase())}</p>
    {present(value.validationAction && <p className="text-xs text-slate-500">Validate: {present(value.validationAction)}</p>)}
    {present(value.evidenceIds.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-blue-700">Sources: {present(value.evidenceIds.join(', '))}</summary><ul className="mt-1 space-y-2">{present(value.evidenceIds.map(id => {
      const e = analysis.evidence.find(item => item.id === id);
      const safeUrl = e?.url && /^https?:\/\//i.test(e.url) ? e.url : null;
      return <li className="rounded bg-slate-50 p-2 text-xs" key={id}><strong>{present(id)}: {present(e?.sourceLabel || 'Source unavailable')}</strong>{present(e?.section && <span> · {present(e.section)}</span>)}<p>{present(e?.claim)}</p>{present(safeUrl && <a className="text-blue-700 underline" href={safeUrl} target="_blank" rel="noreferrer">Open source</a>)}</li>;
    }))}</ul></details>)}
  </div>;
}
