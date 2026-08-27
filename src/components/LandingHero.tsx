import { ArrowRight, Database, FileSearch, Gauge, Layers3, ShieldCheck } from 'lucide-react';
interface Props { runCount: number; onStart: () => void; onOpenRuns: () => void; }
export default function LandingHero({ runCount, onStart, onOpenRuns }: Props) {
  const stages = [
    ['01', 'Solicitation facts', 'Extract scope, evaluation, staffing, and pricing signals.'],
    ['02', 'Market intelligence', 'Map competitors, incumbent posture, public evidence, and gaps.'],
    ['03', 'Market position', 'Produce the defensible range, posture, drivers, and confidence.'],
    ['04', 'Optional company position', 'Compare internal price and cost only when you choose to add them.'],
  ];
  return <div>
    <section className="relative overflow-hidden bg-[#0a182b] text-white">
      <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.08fr_.92fr] lg:px-8">
        <div><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.18em] text-blue-200"><ShieldCheck className="h-3.5 w-3.5" /> Federal capture decision support</div>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.04] tracking-[-.04em] sm:text-6xl">Know the market position <span className="text-[#60a5fa]">before</span> you price the bid.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">Upload the solicitation. The app separates facts from inference, researches the competitive field, scores the decision drivers, and returns a market position that works with or without internal company data.</p>
          <div className="mt-8 flex flex-wrap gap-3"><button onClick={onStart} className="inline-flex items-center gap-2 rounded-xl bg-[#2f80ff] px-5 py-3 text-sm font-black shadow-lg shadow-blue-950/30 hover:bg-blue-400">ANALYZE A SOLICITATION <ArrowRight className="h-4 w-4" /></button>{runCount > 0 && <button onClick={onOpenRuns} className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold text-slate-200 hover:bg-white/5">OPEN {runCount} SAVED {runCount === 1 ? 'RUN' : 'RUNS'}</button>}</div>
        </div>
        <div className="self-end rounded-2xl border border-white/10 bg-white/[.06] p-5 shadow-2xl backdrop-blur"><div className="mb-5 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">Golden path</span><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">MARKET-FIRST</span></div><div className="space-y-3">{stages.map(([number, title, description]) => <div key={number} className="grid grid-cols-[34px_1fr] gap-3 rounded-xl border border-white/10 bg-slate-950/20 p-3"><span className="font-mono text-xs font-bold text-blue-300">{number}</span><span><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-400">{description}</span></span></div>)}</div></div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[[FileSearch,'Solicitation-grounded'],[Database,'Evidence ledger'],[Gauge,'Confidence scored'],[Layers3,'Company inputs optional']].map(([Icon,label]) => { const C=Icon as typeof FileSearch; return <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><C className="h-5 w-5 text-blue-600" /><p className="mt-4 text-sm font-black">{String(label)}</p></div>; })}</div></section>
  </div>;
}
