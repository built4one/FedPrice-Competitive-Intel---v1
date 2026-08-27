import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import LandingHero from './components/LandingHero';
import OpportunityRuns from './components/OpportunityRuns';
import IntakeNode from './components/IntakeNode';
import Workspace from './components/Workspace';
import type { OpportunityAnalysis } from './types';

type View = 'home' | 'runs' | 'intake' | 'workspace';
const storageKey = 'fedprice-competitive-intel-runs-v1';

function loadRuns(): OpportunityAnalysis[] {
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
}

export default function App() {
  const [runs, setRuns] = useState<OpportunityAnalysis[]>(loadRuns);
  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(runs)), [runs]);
  const selected = useMemo(() => runs.find((run) => run && run.id === selectedId), [runs, selectedId]);

  const openRun = (id: string) => { setSelectedId(id); setView('workspace'); };
  const saveRun = (run: OpportunityAnalysis) => {
    if (!run || !run.id) return;
    setRuns((current) => [run, ...current.filter((item) => item && item.id !== run.id)]);
    openRun(run.id);
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <Header view={view} activeTitle={selected?.deal.solicitationNumber || selected?.deal.title} onNavigate={setView} />
      <main>
        {view === 'home' && <LandingHero runCount={runs.length} onStart={() => setView('intake')} onOpenRuns={() => setView('runs')} />}
        {view === 'runs' && <OpportunityRuns runs={runs.filter(Boolean)} onSelect={openRun} onNew={() => setView('intake')} onDelete={(id) => setRuns((current) => current.filter((run) => run && run.id !== id))} />}
        {view === 'intake' && <IntakeNode onBack={() => setView(runs.length ? 'runs' : 'home')} onSuccess={saveRun} />}
        {view === 'workspace' && selected && <Workspace analysis={selected} onBack={() => setView('runs')} onUpdate={saveRun} />}
        {view === 'workspace' && !selected && <OpportunityRuns runs={runs.filter(Boolean)} onSelect={openRun} onNew={() => setView('intake')} onDelete={(id) => setRuns((current) => current.filter((run) => run && run.id !== id))} />}
      </main>
    </div>
  );
}
