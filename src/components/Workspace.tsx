import { useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, Printer, RefreshCw, ShieldAlert } from 'lucide-react';
import type { ConnectorStatus, EvidenceItem, OpportunityAnalysis, ValidationValueType } from '../types';
import DecisionCenter from './decision/DecisionCenter';

interface Props { analysis: OpportunityAnalysis; onBack: () => void; onUpdate: (analysis: OpportunityAnalysis) => void; }
type Tab = 'decision-center' | 'deal' | 'intelligence' | 'competition' | 'evidence' | 'validation';

const tabs: [Tab, string][] = [
  ['decision-center', 'Decision Center'],
  ['deal', 'Deal facts'],
  ['intelligence', 'Intelligence'],
  ['competition', 'Competition'],
  ['evidence', 'Evidence'],
  ['validation', 'Validation']
];


const money = (value: number | null | undefined) => value == null ? 'Insufficient evidence' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

export default function Workspace({ analysis, onBack, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('decision-center');
  const [notice, setNotice] = useState('');
  const [retrying, setRetrying] = useState<ConnectorStatus['name'] | null>(null);

  const exportExcel = async () => {
    const response = await fetch('/api/export-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(analysis) });
    if (!response.ok) return setNotice('Export failed. Try again.');
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${analysis.deal.solicitationNumber || 'Market_Position'}_Brief.xlsx`; anchor.click(); URL.revokeObjectURL(url); setNotice('Excel evidence package downloaded.');
  };

  const retryConnector = async (source: ConnectorStatus['name']) => {
    setRetrying(source); setNotice('');
    try {
      const response = await fetch('/api/retry-connector', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis, source }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error || 'Retry failed.');
      onUpdate(payload.data);
      setNotice(`${source} refreshed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${source} retry failed.`);
    } finally {
      setRetrying(null);
    }
  };

  return <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8 print:max-w-none print:p-0">
    {notice && <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold text-white shadow-xl"><CheckCircle2 className="h-4 w-4 text-emerald-400" />{notice}</div>}
    
    <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <button onClick={onBack} className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[.15em] text-slate-400 print:hidden"><ArrowLeft className="h-3.5 w-3.5" /> Opportunity runs</button>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-black text-blue-700">MARKET POSITION</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{analysis.meta.researchStatus?.replaceAll('_',' ')}</span>
        </div>
        <h1 className="mt-3 max-w-3xl text-2xl font-black tracking-tight sm:text-3xl">{analysis.deal.title}</h1>
        <p className="mt-1.5 text-sm text-slate-500">{analysis.deal.agency} · {analysis.deal.solicitationNumber}</p>
      </div>
      <div className="flex flex-wrap gap-2 print:hidden">
        <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black"><Download className="h-4 w-4" /> XLSX</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-[#10243e] px-3.5 py-2.5 text-xs font-black text-white"><Printer className="h-4 w-4" /> PRINT / PDF</button>
      </div>
    </div>
    
    {analysis.meta.warnings.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong className="mr-2">Research note:</strong>{analysis.meta.warnings.join(' ')}</div>}
    
    {analysis.meta.connectors && analysis.meta.connectors.length > 0 && (
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 print:hidden">
        <div className="flex items-center justify-between"><div><h2 className="text-[10px] font-black uppercase tracking-wide text-slate-500">Source Intelligence</h2><p className="mt-1 text-xs text-slate-400">Official-source health, query scope, and retrieval evidence.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {analysis.meta.connectors.map((connector) => (
            <div key={connector.name} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${connector.status === 'SUCCESS' ? 'bg-emerald-500' : connector.status === 'CACHED' ? 'bg-blue-500' : connector.status === 'ZERO_RESULTS' || connector.status === 'UNAVAILABLE' ? 'bg-amber-400' : 'bg-red-500'}`} /><span className="text-xs font-black text-slate-700">{connector.name}</span><span className="ml-auto text-[9px] font-black text-slate-400">{connector.status?.replaceAll('_',' ')}</span></div>
              <p className="mt-2 text-[10px] font-bold text-slate-500">{connector.recordsFound} records · {connector.durationMs ?? 0}ms · {connector.attempts ?? 0} attempt{connector.attempts === 1 ? '' : 's'}</p>
              {connector.querySummary && <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{connector.querySummary}</p>}
              {connector.message && <p className="mt-2 rounded-md bg-slate-50 p-2 text-[10px] leading-4 text-slate-600">{connector.message}</p>}
              <button onClick={() => retryConnector(connector.name)} disabled={retrying !== null} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-black text-blue-600 disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${retrying === connector.name ? 'animate-spin' : ''}`} />{retrying === connector.name ? 'RETRYING' : 'RETRY SOURCE'}</button>
            </div>
          ))}
        </div>
      </div>
    )}

    <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 print:hidden">
      {tabs.map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={`shrink-0 border-b-2 px-3 py-3 text-xs font-black ${tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>{label.toUpperCase()}</button>)}
    </div>

    <div className="mt-8">
      {tab === 'decision-center' && <DecisionCenter analysis={analysis} />}
      {tab === 'deal' && <DealView analysis={analysis} />}
      {tab === 'competition' && <CompetitionView analysis={analysis} />}
      {tab === 'evidence' && <EvidenceView evidence={analysis.evidence} gaps={analysis.gaps} />}
      {tab === 'intelligence' && <IntelligenceView analysis={analysis} />}
      {tab === 'validation' && <ValidationView analysis={analysis} onUpdate={onUpdate} />}
    </div>
  </div>;
}

function DealView({ analysis }: { analysis: OpportunityAnalysis }) { const d=analysis.deal; return <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-black">Core deal facts</h2><dl className="mt-5 space-y-4">{[['Agency',d.agency],['Solicitation',d.solicitationNumber],['Contract type',d.contractType],['Due date',d.dueDate],['Period',d.periodOfPerformance],['NAICS',d.naics],['Award structure',d.awardStructure],['Evaluation',d.evaluationMethod]].map(([label,value]) => <div key={label} className="border-b border-slate-100 pb-3"><dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-semibold">{value || 'Not found'}</dd></div>)}</dl></section><div className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-black">Scope summary</h2><p className="mt-3 text-sm leading-7 text-slate-600">{d.scopeSummary}</p></section><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-black">Requirements and evaluation signals</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{d.requirements.map((item,index) => <div key={index} className="rounded-xl bg-slate-50 p-4"><span className="text-[10px] font-black text-blue-600">{item.category}</span><h3 className="mt-1 text-sm font-black">{item.name}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p><p className="mt-2 text-[10px] font-bold text-slate-400">{item.section || 'Section not resolved'} · {item.confidence}%</p></div>)}</div></section></div></div>; }


function CompetitionView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-[#10243e] p-6 text-white">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-300" />
          <h2 className="text-lg font-black">Incumbent Assessment: {analysis.incumbent.name || 'Unknown'}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-300">{analysis.incumbent.status} · {analysis.incumbent.confidence}% confidence · {analysis.incumbent.transitionRisk} transition risk</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <List title="Demonstrated Strengths" values={analysis.incumbent.strengths} />
          <List title="Potential Vulnerabilities" values={analysis.incumbent.vulnerabilities} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black text-slate-900">Competitor Reconstruction</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {analysis.competitors.length ? analysis.competitors.map((c) => (
            <article key={c.name} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wide text-blue-600">{c.role?.replaceAll('_',' ')}</span>
                    <h3 className="mt-1 text-lg font-black text-slate-900">{c.name}</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{c.confidence}% Conf</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{c.rationale}</p>
                
                <div className="mt-5 grid grid-cols-2 gap-4">
                  {c.techPlatform && (
                    <div>
                      <span className="block text-[10px] font-black uppercase text-slate-400">Tech Platform</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-700">{c.techPlatform}</span>
                    </div>
                  )}
                  {c.deliveryModel && (
                    <div>
                      <span className="block text-[10px] font-black uppercase text-slate-400">Delivery Model</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-700">{c.deliveryModel}</span>
                    </div>
                  )}
                  {c.laborShape && (
                    <div className="col-span-2">
                      <span className="block text-[10px] font-black uppercase text-slate-400">Labor Shape</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-700">{c.laborShape}</span>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  {c.demonstratedCapabilities?.length > 0 && <List title="Capabilities" values={c.demonstratedCapabilities} />}
                  {c.costDrivers?.length > 0 && <List title="Cost Drivers" values={c.costDrivers} />}
                  {c.automationClaims?.length > 0 && <List title="Automation Claims" values={c.automationClaims} />}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">Pricing: {c.pricingPosture?.replaceAll('_',' ')}</span>
                <span className={`rounded px-2 py-1 text-[10px] font-bold ${c.evidenceType === 'EXTERNAL_SOURCE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{c.evidenceType?.replaceAll('_',' ')}</span>
              </div>
            </article>
          )) : <p className="text-sm text-slate-500">No competitor reconstructions available.</p>}
        </div>
      </section>
    </div>
  );
}


function EvidenceView({ evidence, gaps }: { evidence: EvidenceItem[]; gaps: OpportunityAnalysis['gaps'] }) { return <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-end justify-between"><div><h2 className="text-sm font-black">Evidence ledger</h2><p className="mt-1 text-xs text-slate-400">Facts, external sources, and inference stay separate.</p></div><strong className="text-xs">{(evidence || []).length} items</strong></div><div className="mt-5 space-y-3">{(evidence || []).filter(Boolean).map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] font-black text-slate-400">{item.id}</span><EvidenceBadge type={item.type} /><span className="ml-auto text-[10px] font-black">{item.confidence}%</span></div><p className="mt-3 text-sm font-semibold leading-6">{item.claim}</p><p className="mt-2 text-xs text-slate-400">{item.sourceLabel}{item.section ? ` · ${item.section}` : ''}</p>{item.url && <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-600">Open source <ExternalLink className="h-3 w-3" /></a>}</article>)}</div></section><section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700" /><h2 className="text-sm font-black text-amber-950">Decision gaps</h2></div><div className="mt-4 space-y-3">{(gaps || []).filter(Boolean).map((gap,index) => <div key={index} className="rounded-xl bg-white/80 p-4"><span className="text-[10px] font-black text-amber-700">{gap.priority}</span><h3 className="mt-1 text-sm font-black">{gap.question}</h3><p className="mt-2 text-xs leading-5 text-slate-600">{gap.impact}</p></div>)}</div></section></div>; }

function List({title,values}:{title:string;values:string[]}) { return <div><h3 className="text-xs font-black uppercase tracking-wide text-blue-300">{title}</h3><ul className="mt-3 space-y-2">{values.map((value,index)=><li key={index} className="text-xs leading-5 text-slate-300">• {value}</li>)}</ul></div>; }
function EvidenceBadge({type}:{type:EvidenceItem['type']}) { const style=type==='SOLICITATION_FACT'?'bg-blue-100 text-blue-700':type==='EXTERNAL_SOURCE'?'bg-emerald-100 text-emerald-700':type==='ANALYST_INFERENCE'?'bg-amber-100 text-amber-800':'bg-slate-100 text-slate-600'; return <span className={`rounded px-2 py-1 text-[9px] font-black ${style}`}>{type?.replaceAll('_',' ')}</span>; }

function IntelligenceView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-black">Affordability & Budget</h2>
        {analysis.affordability ? (
          <div className="mt-4 space-y-4">
            {analysis.affordability.estimatedCeiling && (
              <MetricSmall label="Estimated Ceiling" value={money(analysis.affordability.estimatedCeiling)} />
            )}
            <div>
              <h3 className="text-xs font-black uppercase text-slate-500">Budget Signals</h3>
              <ul className="mt-2 space-y-2">
                {analysis.affordability.budgetSignals.map((sig, i) => (
                  <li key={i} className="text-sm text-slate-600">• {sig}</li>
                ))}
              </ul>
            </div>
            {analysis.affordability.obligationsHistory && (
               <div className="mt-2 text-sm text-slate-600">
                 <strong>History:</strong> {analysis.affordability.obligationsHistory}
               </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No specific affordability signals detected.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-black">Pre-RFP Signals</h2>
        {analysis.preRfpSignals?.length ? (
          <div className="mt-4 space-y-3">
            {analysis.preRfpSignals.map((sig, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-4">
                <span className="text-[10px] font-black text-blue-600">{sig.type} • {sig.date}</span>
                <p className="mt-1 text-sm font-bold">{sig.summary}</p>
                <p className="mt-2 text-xs text-slate-500">{sig.impact}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No pre-RFP signals detected.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
        <h2 className="text-sm font-black">GAO & Protest History</h2>
        {analysis.gaoFindings?.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {analysis.gaoFindings.map((gao, i) => (
              <div key={i} className="rounded-xl bg-amber-50 p-4 border border-amber-100">
                <h3 className="text-sm font-bold text-amber-900">{gao.topic}</h3>
                <p className="mt-2 text-xs text-amber-800">{gao.implication}</p>
                {gao.sourceUrl && (
                  <a href={gao.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-amber-700 underline">Source</a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No relevant GAO history detected.</p>
        )}
      </section>
    </div>
  );
}


function ValidationView({ analysis, onUpdate }: { analysis: OpportunityAnalysis; onUpdate?: (a: OpportunityAnalysis) => void }) {
  const [actualAward, setActualAward] = useState(analysis.validation?.actualValue?.toString() || '');
  const [actualValueType, setActualValueType] = useState<ValidationValueType>(analysis.validation?.actualValueType || 'TOTAL_AWARD_VALUE');
  const [actualAwardee, setActualAwardee] = useState(analysis.validation?.actualAwardee || '');
  const [notes, setNotes] = useState(analysis.validation?.retrospectiveNotes || '');
  const [comparable, setComparable] = useState(analysis.validation?.comparableToPrediction ?? false);

  const runValidation = async () => {
    if (!onUpdate) return;
    const val = Number(actualAward);
    if (!val || val <= 0) return;
    const position = analysis.marketPosition;
    const comparableToPrediction = comparable &&
      position.expected !== null &&
      position.aggressive !== null &&
      position.conservative !== null;
    const snapshot = JSON.stringify({
      runId: analysis.id,
      analyzedAt: analysis.meta.analyzedAt,
      formulaVersion: position.formulaVersion,
      aggressive: position.aggressive,
      expected: position.expected,
      conservative: position.conservative,
      evidenceIds: position.anchors.flatMap((anchor) => anchor.evidenceIds).sort(),
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshot));
    const predictionHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

    const validation: OpportunityAnalysis['validation'] = {
      frozenAt: new Date().toISOString(),
      predictionHash,
      predictedExpected: position.expected,
      predictedAggressive: position.aggressive,
      predictedConservative: position.conservative,
      actualValue: val,
      actualValueType,
      comparableToPrediction,
      actualAwardee,
      inRange: comparableToPrediction
        ? val >= (position.aggressive as number) && val <= (position.conservative as number)
        : null,
      expectedErrorPct: comparableToPrediction
        ? Math.round((Math.abs(val - (position.expected as number)) / (position.expected as number)) * 1000) / 10
        : null,
      retrospectiveNotes: notes,
    };

    onUpdate({ ...analysis, validation });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black">Retrospective Validation Harness</h2>
            <p className="mt-1 text-xs text-slate-500">Freeze the prediction and compare only like-for-like award measurements.</p>
          </div>
          {analysis.validation && <span className="rounded bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">FROZEN & RECORDED</span>}
        </div>
        
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_.75fr]">
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50 p-5">
             <h3 className="text-xs font-black uppercase text-slate-500">Input Actuals</h3>
             <div>
               <label className="block text-[10px] font-black uppercase text-slate-400">Actual Award Value ($)</label>
               <input type="number" value={actualAward} onChange={e => setActualAward(e.target.value)} disabled={!!analysis.validation} className="mt-1.5 w-full rounded border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100" />
             </div>
             <div>
               <label className="block text-[10px] font-black uppercase text-slate-400">Actual Value Type</label>
               <select value={actualValueType} onChange={e => setActualValueType(e.target.value as ValidationValueType)} disabled={!!analysis.validation} className="mt-1.5 w-full rounded border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100">
                 <option value="EVALUATED_PRICE">Evaluated price</option>
                 <option value="TOTAL_AWARD_VALUE">Total award value</option>
                 <option value="CONTRACT_CEILING">Contract ceiling</option>
                 <option value="INITIAL_OBLIGATION">Initial obligation</option>
                 <option value="CURRENT_OBLIGATIONS">Current obligations</option>
                 <option value="EVENTUAL_SPEND">Eventual spend</option>
               </select>
             </div>
             <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
               <input type="checkbox" checked={comparable} onChange={e => setComparable(e.target.checked)} disabled={!!analysis.validation} className="mt-1" />
               I verified that this actual value covers the same scope, period, and measurement basis as the predicted Market Position.
             </label>
             <div>
               <label className="block text-[10px] font-black uppercase text-slate-400">Winning Vendor (Optional)</label>
               <input type="text" value={actualAwardee} onChange={e => setActualAwardee(e.target.value)} disabled={!!analysis.validation} className="mt-1.5 w-full rounded border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100" />
             </div>
             <div>
               <label className="block text-[10px] font-black uppercase text-slate-400">Retrospective Notes</label>
               <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={!!analysis.validation} rows={2} className="mt-1.5 w-full rounded border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100" />
             </div>
             {!analysis.validation && (
               <button onClick={runValidation} className="mt-2 w-full rounded bg-[#10243e] py-2.5 text-xs font-black text-white hover:bg-slate-800">
                 FREEZE & RECORD COMPARISON
               </button>
             )}
          </div>
          
          <div>
            <h3 className="text-xs font-black uppercase text-slate-500">Prediction Results</h3>
            {analysis.validation ? (
              <div className="mt-4 space-y-3">
                 <MetricSmall label="Predicted Expected" value={money(analysis.validation.predictedExpected)} />
                 <MetricSmall label={analysis.validation.actualValueType.replaceAll('_', ' ')} value={money(analysis.validation.actualValue)} />
                 <div className={`rounded-xl border p-4 ${analysis.validation.comparableToPrediction ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <span className={`text-[10px] font-black ${analysis.validation.comparableToPrediction ? 'text-emerald-600' : 'text-amber-700'}`}>VALIDATION RESULT</span>
                    <strong className={`mt-1 block text-xl font-black ${analysis.validation.comparableToPrediction ? 'text-emerald-900' : 'text-amber-950'}`}>
                      {analysis.validation.comparableToPrediction
                        ? analysis.validation.inRange ? 'ACTUAL WITHIN RANGE' : 'ACTUAL OUTSIDE RANGE'
                        : 'NOT SCOREABLE'}
                    </strong>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      {analysis.validation.expectedErrorPct !== null
                        ? `Expected error: ${analysis.validation.expectedErrorPct}%`
                        : 'The actual value was preserved but not compared because its measurement basis was not verified.'}
                    </p>
                    <p className="mt-3 break-all font-mono text-[9px] text-slate-400">SHA-256 {analysis.validation.predictionHash}</p>
                 </div>
              </div>
            ) : (
              <div className="mt-4 flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Submit actuals to record a like-for-like comparison.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}


function MetricSmall({label,value}:{label:string;value:string}) { return <div className="rounded-xl bg-slate-50 p-4"><span className="text-[10px] font-black uppercase text-slate-400">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div>; }
