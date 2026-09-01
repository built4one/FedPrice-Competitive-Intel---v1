import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FileCheck2,
  Lightbulb,
  MoveRight,
  Target,
} from 'lucide-react';
import type { EvaluatedNumericAnchor, OpportunityAnalysis } from '../../types';
import { authoritativeScenarioValues } from '../../domain/marketPosition/authoritative';

const money = (value: number | null) => value === null
  ? 'Not supportable'
  : new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

function anchorValue(anchor: EvaluatedNumericAnchor, normalized = false) {
  const value = normalized ? anchor.normalizedValue : anchor.originalValue;
  if (value === null) return '-';
  if (anchor.units === 'TOTAL_USD') return money(value);
  if (anchor.units === 'USD_PER_HOUR') return `${money(value)}/hr`;
  if (anchor.units === 'PERCENT') return `${value}%`;
  return String(value);
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

export default function DecisionCenter({ analysis }: { analysis: OpportunityAnalysis }) {
  const position = analysis.marketPosition;
  const scenario = authoritativeScenarioValues(position);
  const included = position.anchors.filter((anchor) => anchor.included);
  const excluded = position.anchors.filter((anchor) => !anchor.included);
  const sam = analysis.meta.connectors?.find((connector) => connector.name === 'SAM.gov');
  const samDocuments = sam?.samDocuments || [];
  const reviewedDocuments = samDocuments.filter((document) => ['RETRIEVED', 'PROVIDED'].includes(document.retrievalStatus || ''));
  const unresolvedDocuments = samDocuments.filter((document) =>
    document.retrievalStatus && !['RETRIEVED', 'PROVIDED', 'DISCOVERED'].includes(document.retrievalStatus),
  );
  const samUnavailable = Boolean(sam && !['SUCCESS', 'CACHED', 'ZERO_RESULTS'].includes(sam.status));

  const why = unique([
    ...analysis.narrative.decisionFactors,
    ...position.basis,
  ]).slice(0, 3);
  const movers = unique([
    ...position.sensitivities,
    ...analysis.narrative.guardrails,
    ...analysis.gaps.filter((gap) => gap.priority === 'HIGH').map((gap) => `${gap.question} ${gap.impact}`),
  ]).slice(0, 3);
  const nextActions = unique(analysis.narrative.nextActions).slice(0, 3);
  const supported = position.rangeStatus === 'SUPPORTED';
  const directional = position.rangeStatus === 'DIRECTIONAL';
  const recommendation = scenario.expected === null
    ? 'No responsible dollar recommendation is supportable yet.'
    : `Plan around ${money(scenario.expected)} within the current ${money(scenario.aggressive)} to ${money(scenario.conservative)} market range.`;

  return (
    <div className="space-y-5">
      {(samUnavailable || unresolvedDocuments.length > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <strong className="block">Official package review is partial</strong>
            <span>
              {samUnavailable
                ? `SAM.gov returned ${sam?.status?.replaceAll('_', ' ') || 'an unavailable status'}, so the analysis continued with the evidence already available.`
                : `${unresolvedDocuments.length} official document${unresolvedDocuments.length === 1 ? '' : 's'} could not be retrieved automatically.`}
            </span>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-3xl bg-[#10243e] text-white shadow-[0_18px_50px_rgba(15,35,60,.18)]">
        <div className="border-b border-white/10 px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-400/15 px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-blue-200">Working Market Position</span>
            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[.1em] ${supported ? 'bg-emerald-300 text-emerald-950' : directional ? 'bg-amber-200 text-amber-950' : 'bg-white/10 text-slate-200'}`}>
              {position.rangeStatus.replaceAll('_', ' ')}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.1em] text-slate-200">
              {position.confidence} confidence
            </span>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-xs font-bold text-blue-200">{position.methodLabel}</p>
              <h2 className="mt-2 max-w-4xl text-xl font-black leading-tight sm:text-2xl">{recommendation}</h2>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300">{analysis.narrative.headline}</p>
            </div>
            {reviewedDocuments.length > 0 && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-3 py-2 text-[10px] font-bold text-slate-300">
                <FileCheck2 className="h-4 w-4 text-emerald-300" />
                {reviewedDocuments.length} official document{reviewedDocuments.length === 1 ? '' : 's'} reviewed
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-px bg-white/10 sm:grid-cols-[1fr_1.35fr_1fr]">
          <Scenario label="Aggressive" value={money(scenario.aggressive)} />
          <Scenario label="Expected" value={money(scenario.expected)} emphasized />
          <Scenario label="Conservative" value={money(scenario.conservative)} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <DecisionList icon={Target} title="Why this position" values={why} empty="The calculation basis is available in Analysis Details." tone="blue" />
        <DecisionList icon={Lightbulb} title="What could move it" values={movers} empty="No material sensitivities were identified." tone="amber" />
        <DecisionList icon={MoveRight} title="Recommended next actions" values={nextActions} empty="Continue validating the highest-impact open evidence." tone="emerald" numbered />
      </section>

      <details className="group rounded-2xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Analysis details</h3>
            <p className="mt-1 text-xs text-slate-500">{included.length} input{included.length === 1 ? '' : 's'} used, {excluded.length} excluded · Evidence readiness {position.evidenceReadiness.score}/100. Open for evidence, assumptions, and lineage.</p>
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
        </summary>

        <div className="space-y-7 border-t border-slate-100 px-5 py-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <MethodList title="Verified inputs" values={position.verifiedInputs} />
            <MethodList title="Assumptions" values={position.assumptions} />
            <MethodList title="Range factors and constraints" values={[...position.rangeFactors, ...position.constraints]} />
          </div>

          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h4 className="text-sm font-black text-slate-900">Calculation lineage</h4>
                <p className="mt-1 text-xs text-slate-500">Every value is typed before it can influence the recommendation.</p>
              </div>
              <span className="text-[10px] font-black text-slate-400">{position.formulaVersion}</span>
            </div>
            {position.anchors.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[880px] w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-3">Evidence</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Original</th>
                      <th className="px-3 py-3">Normalized</th>
                      <th className="px-3 py-3">Comparable</th>
                      <th className="px-3 py-3">Quality</th>
                      <th className="px-3 py-3">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {position.anchors.map((anchor) => (
                      <tr key={anchor.id} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-4"><strong className="block">{anchor.evidenceId}</strong><span className="mt-1 block max-w-48 text-[10px] text-slate-400">{anchor.sourceLabel}</span></td>
                        <td className="px-3 py-4"><span className="font-bold">{anchor.valueType.replaceAll('_', ' ')}</span><span className="mt-1 block text-[10px] text-slate-400">{anchor.role.replaceAll('_', ' ')}</span></td>
                        <td className="px-3 py-4 font-semibold">{anchorValue(anchor)}</td>
                        <td className="px-3 py-4 font-semibold">{anchorValue(anchor, true)}</td>
                        <td className="px-3 py-4">{Math.round(anchor.comparabilityScore * 100)}</td>
                        <td className="px-3 py-4">{Math.round(anchor.evidenceQuality * 100)}</td>
                        <td className="px-3 py-4">
                          <span className={`rounded px-2 py-1 text-[9px] font-black ${anchor.included ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{anchor.included ? 'USED' : 'EXCLUDED'}</span>
                          <p className="mt-2 max-w-64 text-[10px] leading-4 text-slate-500">{anchor.included ? anchor.inclusionRationale : anchor.exclusionReasons.join(' ')}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />No typed numeric evidence was available.
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function Scenario({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <div className={`${emphasized ? 'bg-blue-600' : 'bg-[#10243e]'} px-5 py-5 text-center sm:px-6 sm:py-6`}>
      <span className={`text-[10px] font-black uppercase tracking-[.13em] ${emphasized ? 'text-blue-100' : 'text-slate-400'}`}>{label}</span>
      <strong className={`mt-2 block tracking-tight ${emphasized ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'}`}>{value}</strong>
    </div>
  );
}

function DecisionList({
  icon: Icon,
  title,
  values,
  empty,
  tone,
  numbered = false,
}: {
  icon: typeof Target;
  title: string;
  values: string[];
  empty: string;
  tone: 'blue' | 'amber' | 'emerald';
  numbered?: boolean;
}) {
  const styles = tone === 'blue'
    ? 'bg-blue-50 text-blue-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-emerald-50 text-emerald-700';
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${styles}`}><Icon className="h-4 w-4" /></div>
      <h3 className="mt-4 text-sm font-black text-slate-900">{title}</h3>
      <ol className="mt-4 space-y-3">
        {values.length ? values.map((value, index) => (
          <li key={index} className="flex gap-2.5 text-xs leading-5 text-slate-600">
            {numbered
              ? <span className="font-mono text-[10px] font-black text-slate-300">{String(index + 1).padStart(2, '0')}</span>
              : <CircleDot className="mt-1 h-3 w-3 shrink-0 text-slate-300" />}
            {value}
          </li>
        )) : <li className="text-xs leading-5 text-slate-500">{empty}</li>}
      </ol>
    </section>
  );
}

function MethodList({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="rounded-xl bg-slate-50 p-4">
      <h4 className="text-xs font-black text-slate-800">{title}</h4>
      <ul className="mt-3 space-y-2">
        {values.length ? values.map((value, index) => (
          <li key={index} className="flex gap-2 text-[11px] leading-5 text-slate-600"><CheckCircle2 className="mt-1 h-3 w-3 shrink-0 text-blue-500" />{value}</li>
        )) : <li className="text-[11px] text-slate-400">None recorded.</li>}
      </ul>
    </section>
  );
}
