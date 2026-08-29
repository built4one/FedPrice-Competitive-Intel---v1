import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import LandingHero from './components/LandingHero';
import OpportunityRuns from './components/OpportunityRuns';
import IntakeNode from './components/IntakeNode';
import Workspace from './components/Workspace';
import type { OpportunityAnalysis } from './types';
import { createLegacyPosition, isCurrentEngine, sanitizeNarrative } from './domain/marketPosition/authoritative';

type View = 'home' | 'runs' | 'intake' | 'workspace';
const storageKey = 'federal-market-position-runs-v2';
const legacyStorageKey = 'fedprice-competitive-intel-runs-v1';

function loadRuns(): OpportunityAnalysis[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey) || '[]').filter(Boolean);
    return parsed.map((run: any) => isCurrentEngine(run.marketPosition) ? run : {
      ...run,
      marketPosition: createLegacyPosition(run.marketPosition),
      narrative: sanitizeNarrative({
        headline: run.narrative?.headline || run.guidance?.headline || 'Legacy analysis',
        rationale: run.narrative?.rationale || run.guidance?.rationale || 'Recalculate this run under the current methodology.',
        decisionFactors: run.narrative?.decisionFactors || run.guidance?.winConditions || [],
        guardrails: run.narrative?.guardrails || run.guidance?.guardrails || [],
        nextActions: run.narrative?.nextActions || run.guidance?.nextActions || [],
      }),
    });
  } catch {
    return [];
  }
}

export default function App() {
  const [runs, setRuns] = useState<OpportunityAnalysis[]>(loadRuns);
  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Sync with backend (Phase 2 simple implementation)
  useEffect(() => {
    fetch('/api/runs').then(res => res.json()).then(async data => {
      if (data.data && data.data.length > 0) {
        setRuns(data.data);
      } else if (runs.length > 0) {
        const migrated = await Promise.all(runs.map(async run => {
          const response = await fetch('/api/runs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(run) });
          const payload = await response.json();
          return payload.data || run;
        }));
        setRuns(migrated);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(runs)), [runs]);

  const selected = useMemo(() => runs.find((run) => run?.id === selectedId), [runs, selectedId]);

  const openRun = (id: string) => { setSelectedId(id); setView('workspace'); };

  const saveRun = async (run: OpportunityAnalysis) => {
    let authoritative = run;
    try {
      const response = await fetch('/api/runs', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(run) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Run could not be saved.');
      authoritative = payload.data || run;
    } catch (error) {
      console.error(error);
    }
    setRuns((current) => [authoritative, ...current.filter((item) => item?.id !== authoritative?.id)]);
    if (authoritative?.id) openRun(authoritative.id);
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
