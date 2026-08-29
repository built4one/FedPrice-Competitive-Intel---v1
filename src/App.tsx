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
  try { return JSON.parse(localStorage.getItem(storageKey) || '[]').filter(Boolean); } catch { return []; }
}

export default function App() {
  const [runs, setRuns] = useState<OpportunityAnalysis[]>(loadRuns);
  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Sync with backend (Phase 2 simple implementation)
  useEffect(() => {
    fetch('/api/runs').then(res => res.json()).then(data => {
      if (data.data && data.data.length > 0) {
        setRuns(data.data);
      } else if (runs.length > 0) {
        // Migrate local storage to server
        runs.forEach(run => fetch('/api/runs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(run) }));
      }
    }).catch(console.error);
  }, []);

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(runs)), [runs]);

  const selected = useMemo(() => runs.find((run) => run?.id === selectedId), [runs, selectedId]);

  const openRun = (id: string) => { setSelectedId(id); setView('workspace'); };

  const saveRun = (run: OpportunityAnalysis) => {
    setRuns((current) => [run, ...current.filter((item) => item?.id !== run?.id)]);
    fetch('/api/runs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(run) }).catch(console.error);
    if (run?.id) openRun(run.id);
  };
  
  const deleteRun = (id: string) => {
    setRuns((current) => current.filter((run) => run.id !== id));
    fetch(`/api/runs/${id}`, { method: 'DELETE' }).catch(console.error);
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
      <Header view={view} activeTitle={selected?.deal.solicitationNumber || selected?.deal.title} onNavigate={setView} />
      <main>
        {view === 'home' && <LandingHero runCount={runs.length} onStart={() => setView('intake')} onOpenRuns={() => setView('runs')} />}
        {view === 'runs' && <OpportunityRuns runs={runs} onSelect={openRun} onNew={() => setView('intake')} onDelete={deleteRun} />}
        {view === 'intake' && <IntakeNode onBack={() => setView(runs.length ? 'runs' : 'home')} onSuccess={saveRun} />}
        {view === 'workspace' && selected && <Workspace analysis={selected} onBack={() => setView('runs')} onUpdate={saveRun} />}
        {view === 'workspace' && !selected && <OpportunityRuns runs={runs} onSelect={openRun} onNew={() => setView('intake')} onDelete={deleteRun} />}
      </main>
    </div>
  );
}
