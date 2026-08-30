import { AlertTriangle, CheckCircle2, FileSearch, Gauge, Scale, Target, FileText, ExternalLink } from 'lucide-react';
import type { EvaluatedNumericAnchor, OpportunityAnalysis } from '../../types';
import { authoritativeScenarioValues } from '../../domain/marketPosition/authoritative';

const money = (value: number | null) => value === null
  ? 'Insufficient evidence'
  : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const compactMoney = (value: number | null) => value === null
  ? '—'
  : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

function anchorValue(anchor: EvaluatedNumericAnchor, normalized = false) {
  const value = normalized ? anchor.normalizedValue : anchor.originalValue;
  if (value === null) return '—';
  if (anchor.units === 'TOTAL_USD') return money(value);
  if (anchor.units === 'USD_PER_HOUR') return `${money(value)}/hr`;
  if (anchor.units === 'PERCENT') return `${value}%`;
  return String(value);
}

export default function DecisionCenter({ analysis }: { analysis: OpportunityAnalysis }) {
  const position = analysis.marketPosition;
  const scenario = authoritativeScenarioValues(position);
  const narrative = analysis.narrative;
  const included = position.anchors.filter((anchor) => anchor.included);
  const excluded = position.anchors.filter((anchor) => !anchor.included);
  const supported = position.rangeStatus === 'SUPPORTED';
  const directional = position.rangeStatus === 'DIRECTIONAL';

  const samConnector = analysis.meta.connectors?.find(c => c.name === 'SAM.gov');
  const samDocs = samConnector?.samDocuments || [];
  const missingDocs = samDocs.filter(d => !d.provided);
  const providedDocs = samDocs.filter(d => d.provided);
  const samFailed = samConnector?.status === 'ERROR' || samConnector?.status === 'UNAVAILABLE' || samConnector?.status === 'TIMEOUT';
  
  return (
    <div className="space-y-6">
      {(missingDocs.length > 0 || samFailed) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <h3 className="text-sm font-black text-amber-900">
                {samFailed ? 'SAM.gov verification unavailable' : 'Incomplete Opportunity Package'}
              </h3>
              <p className="mt-1 text-xs text-amber-800">
                {samFailed 
                  ? `SAM.gov could not be reached (${samConnector?.status}). The Market Position may be limited due to unverified metadata and attachments.`
                  : `You uploaded a partial solicitation. Missing official documents may contain pricing constraints or key scope changes.`
                }
              </p>
              {missingDocs.length > 0 && (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {missingDocs.map((doc, idx) => (
                    <a key={idx} href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-white p-2.5 text-xs text-slate-700 shadow-sm border border-slate-200 hover:border-blue-400">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate flex-1">{doc.name}</span>
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {providedDocs.length > 0 && !samFailed && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="text-xs font-black text-emerald-900">Verified against SAM.gov</h3>
              <p className="text-[10px] text-emerald-700">{providedDocs.length} of {samDocs.length} official documents provided</p>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-[#10243e] p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-300">Authoritative Expected Market Position</p>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">{narrative.headline}</h2>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${
            supported ? 'bg-emerald-100 text-emerald-700' : directional ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {position.rangeStatus.replaceAll('_', ' ')}
          </span>
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">{narrative.rationale}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <DarkMetric label="Aggressive" value={money(scenario.aggressive)} />
          <DarkMetric label="Expected" value={money(scenario.expected)} />
          <DarkMetric label="Conservative" value={money(scenario.conservative)} />
        </div>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
          One source of truth · {position.formulaVersion}
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Target} label="Expected" value={money(scenario.expected)} detail={position.rangeStatus.replaceAll('_', ' ')} />
        <Metric
          icon={Scale}
          label="Supported band"
          value={scenario.aggressive !== null && scenario.conservative !== null
            ? `${compactMoney(scenario.aggressive)} – ${compactMoney(scenario.conservative)}`
            : 'Not supportable'}
          detail={`${position.rangeWidthPct}% half-width`}
        />
        <Metric icon={Gauge} label="Evidence readiness" value={`${position.evidenceReadiness.score}/100`} detail="Deterministic evidence measure" />
        <Metric icon={FileSearch} label="Eligible anchors" value={String(included.length)} detail={`Effective sample ${position.effectiveSampleSize}`} />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <NarrativeList title="Decision factors" values={narrative.decisionFactors} tone="blue" />
        <NarrativeList title="Guardrails" values={narrative.guardrails} tone="amber" />
        <NarrativeList title="Next actions" values={narrative.nextActions} tone="emerald" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-black">Evidence Readiness breakdown</h3>
          <p className="mt-1 text-xs text-slate-400">Quantity, quality, comparability, consistency, and gaps—not probability of win.</p>
          <div className="mt-5 space-y-4">
            {[
              ['Comparability', position.evidenceReadiness.comparability],
              ['Evidence quality', position.evidenceReadiness.evidenceQuality],
              ['Normalization', position.evidenceReadiness.normalizationConfidence],
              ['Effective quantity', position.evidenceReadiness.effectiveQuantity],
              ['Source diversity', position.evidenceReadiness.sourceDiversity],
              ['Consistency', position.evidenceReadiness.consistency],
              ['Gap resolution', position.evidenceReadiness.gapResolution],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="flex justify-between text-xs"><span className="font-bold">{label}</span><strong>{value}</strong></div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, Number(value)))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-black">Analytical drivers</h3>
          <p className="mt-1 text-xs text-slate-400">Qualitative inference explains or challenges the calculation; it does not change dollars.</p>
          <div className="mt-4 space-y-3">
            {position.drivers.length ? position.drivers.map((driver) => (
              <article key={driver.name} className="rounded-xl bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-black">{driver.name}</h4>
                  <span className="rounded bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-800">
                    {driver.inference ? 'ANALYTICAL INFERENCE' : 'EVIDENCE FACTOR'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{driver.assessment}</p>
                {driver.evidenceIds.length > 0 && <p className="mt-2 font-mono text-[9px] text-slate-400">{driver.evidenceIds.join(' · ')}</p>}
              </article>
            )) : <p className="text-sm text-slate-500">No qualitative drivers were supportable.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-black">Why the engine arrived here</h3>
            <p className="mt-1 text-xs text-slate-400">Collect → Normalize → Score → Weight → Range → Explain</p>
          </div>
          <span className="text-xs font-black text-slate-500">{included.length} used · {excluded.length} excluded</span>
        </div>
        {position.anchors.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-3">Evidence</th>
                  <th className="px-3 py-3">Value type</th>
                  <th className="px-3 py-3">Original</th>
                  <th className="px-3 py-3">Normalized</th>
                  <th className="px-3 py-3">Comparable</th>
                  <th className="px-3 py-3">Quality</th>
                  <th className="px-3 py-3">Weight</th>
                  <th className="px-3 py-3">Decision</th>
                </tr>
              </thead>
              <tbody>
                {position.anchors.map((anchor) => (
                  <tr key={anchor.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-4">
                      <strong className="block">{anchor.evidenceId}</strong>
                      <span className="mt-1 block max-w-48 text-[10px] text-slate-400">{anchor.sourceLabel}</span>
                    </td>
                    <td className="px-3 py-4">
                      <span className="block font-bold">{anchor.valueType.replaceAll('_', ' ')}</span>
                      <span className="mt-1 block text-[10px] text-slate-400">{anchor.role.replaceAll('_', ' ')}</span>
                    </td>
                    <td className="px-3 py-4 font-semibold">{anchorValue(anchor)}</td>
                    <td className="px-3 py-4 font-semibold">{anchorValue(anchor, true)}</td>
                    <td className="px-3 py-4">{Math.round(anchor.comparabilityScore * 100)}</td>
                    <td className="px-3 py-4">{Math.round(anchor.evidenceQuality * 100)}</td>
                    <td className="px-3 py-4">{anchor.weight.toFixed(2)}</td>
                    <td className="px-3 py-4">
                      <span className={`rounded px-2 py-1 text-[9px] font-black ${anchor.included ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {anchor.included ? 'USED' : 'EXCLUDED'}
                      </span>
                      <p className="mt-2 max-w-64 text-[10px] leading-4 text-slate-500">
                        {anchor.included ? anchor.inclusionRationale : anchor.exclusionReasons.join(' ')}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            No typed numeric evidence was available. The engine correctly withheld a dollar range.
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <MethodList title="Factors that widened or narrowed the range" values={position.rangeFactors} />
        <MethodList title="Assumptions and constraints" values={[...position.assumptions, ...position.constraints]} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-black">Position basis</h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {position.basis.map((item, index) => (
            <li key={index} className="flex gap-3 text-sm leading-6 text-slate-600">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />{item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Target; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Icon className="h-5 w-5 text-blue-600" /><span className="mt-4 block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span><strong className="mt-1 block text-lg">{value}</strong><span className="mt-1 block text-[10px] font-bold text-slate-400">{detail}</span></div>;
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[.06] p-4"><span className="text-[10px] font-black text-slate-400">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div>;
}

function NarrativeList({ title, values, tone }: { title: string; values: string[]; tone: 'blue' | 'amber' | 'emerald' }) {
  const color = tone === 'blue' ? 'text-blue-600' : tone === 'amber' ? 'text-amber-600' : 'text-emerald-600';
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className={`text-sm font-black ${color}`}>{title}</h3><ol className="mt-4 space-y-3">{values.map((value, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-slate-600"><span className="font-mono text-xs font-black text-slate-300">{String(index + 1).padStart(2, '0')}</span>{value}</li>)}</ol></section>;
}

function MethodList({ title, values }: { title: string; values: string[] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-black">{title}</h3><ul className="mt-4 space-y-3">{values.length ? values.map((value, index) => <li key={index} className="flex gap-3 text-sm leading-6 text-slate-600"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-blue-500" />{value}</li>) : <li className="text-sm text-slate-500">No additional factors were identified.</li>}</ul></section>;
}
