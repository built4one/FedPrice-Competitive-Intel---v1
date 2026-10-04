import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Header from './components/Header';
import LandingHero from './components/LandingHero';
import OpportunityRuns from './components/OpportunityRuns';
import IntakeNode from './components/IntakeNode';
import Workspace from './components/Workspace';
import type { OpportunityAnalysis } from './types';

type View = 'home' | 'runs' | 'intake' | 'workspace';
type Session = { user: { username: string; workspace: string } | null; configured: boolean; accessMode?: 'vercel-preview' | 'password' };
const storageKey = 'federal-market-position-runs-v2';
const legacyStorageKey = 'fedprice-competitive-intel-runs-v1';

function oldBrowserRuns(): OpportunityAnalysis[] {
  try { return JSON.parse(localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey) || '[]').filter(Boolean); }
  catch { return []; }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [runs, setRuns] = useState<OpportunityAnalysis[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('home');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/session').then(async (response) => {
      if (!response.ok) throw new Error('Could not check private access.');
      setSession(await response.json());
    }).catch((error) => setSessionError(error.message));
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    setLoadingRuns(true);
    fetch('/api/runs').then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Saved analyses are unavailable.');
      setRuns(payload.data || []);
      setNotice('');
    }).catch((error) => setNotice(error.message)).finally(() => setLoadingRuns(false));
  }, [session?.user?.username, session?.user?.workspace]);

  const selected = useMemo(() => runs.find((run) => run?.id === selectedId), [runs, selectedId]);
  const openRun = (id: string) => { setSelectedId(id); setView('workspace'); };

  const saveRun = async (run: OpportunityAnalysis) => {
    const response = await fetch('/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The analysis could not be saved. Retry before leaving this page.');
    const saved = payload.data as OpportunityAnalysis;
    setRuns((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    openRun(saved.id);
  };

  const deleteRun = async (id: string) => {
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json()).error || 'Delete failed.');
      setRuns((current) => current.filter((run) => run.id !== id));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Delete failed.'); }
  };

  const importOldRuns = async () => {
    const existing = new Set(runs.map((run) => run.id));
    const pending = oldBrowserRuns().filter((run) => run.id && !existing.has(run.id));
    let count = 0;
    for (const oldRun of pending) {
      try {
        const response = await fetch('/api/runs', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...oldRun, storageVersion: 0 }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Import failed.');
        setRuns((current) => [payload.data, ...current.filter((item) => item.id !== payload.data.id)]);
        count++;
      } catch (error) {
        setNotice(`Imported ${count} of ${pending.length} browser runs. ${error instanceof Error ? error.message : 'Import stopped.'}`);
        return;
      }
    }
    setNotice(count ? `Imported ${count} saved run(s) into this private workspace.` : 'No new browser runs to import.');
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setSessionError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Sign-in failed.');
      setPassword('');
      setSession({ user: payload.user, configured: true });
    } catch (error) { setSessionError(error instanceof Error ? error.message : 'Sign-in failed.'); }
  };

  const signOut = async () => {
    await fetch('/api/session', { method: 'DELETE' });
    setSession({ user: null, configured: true });
    setRuns([]); setSelectedId(null); setView('home');
  };

  if (!session?.user) return <div className="grid min-h-screen place-items-center bg-[#f4f7fb] px-4">
    <form onSubmit={signIn} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
      <h1 className="text-2xl font-black text-slate-950">Federal Market Position</h1>
      <p className="mt-2 text-sm text-slate-600">Private opportunity intelligence</p>
      {!session && !sessionError ? <p className="mt-6 text-sm">Checking access…</p>
        : session?.configured === false ? <p role="alert" className="mt-6 text-sm text-amber-800">Private access is not configured for this deployment.</p>
        : <>
          <label className="mt-6 block text-sm font-semibold" htmlFor="username">Username</label>
          <input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required className="mt-1 w-full rounded-lg border p-3" />
          <label className="mt-4 block text-sm font-semibold" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="mt-1 w-full rounded-lg border p-3" />
          <button className="mt-6 w-full rounded-lg bg-[#1167e8] p-3 font-bold text-white">Sign in</button>
        </>}
      {sessionError && <p role="alert" className="mt-4 text-sm text-red-700">{sessionError}</p>}
    </form>
  </div>;

  return <div className="min-h-screen bg-[#f4f7fb] text-slate-950">
    <Header view={view} activeTitle={selected?.deal.solicitationNumber || selected?.deal.title} onNavigate={setView} />
    <div className="flex items-center justify-end gap-4 border-b bg-white px-6 py-2 text-xs text-slate-600">
      <span>{session.user.username}{session.accessMode === 'vercel-preview' ? ' · Private Vercel preview' : ''}</span>
      {session.accessMode !== 'vercel-preview' && <button onClick={signOut} className="font-bold text-blue-700">Sign out</button>}
    </div>
    {notice && <div role="alert" className="mx-auto mt-4 max-w-7xl rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</div>}
    <main>
      {loadingRuns ? <p className="mx-auto max-w-7xl p-8">Opening saved analyses…</p> : <>
        {view === 'home' && <LandingHero runCount={runs.length} onStart={() => setView('intake')} onOpenRuns={() => setView('runs')} />}
        {view === 'runs' && <OpportunityRuns runs={runs} onSelect={openRun} onNew={() => setView('intake')} onDelete={deleteRun} onImport={oldBrowserRuns().length ? importOldRuns : undefined} />}
        {view === 'intake' && <IntakeNode onBack={() => setView(runs.length ? 'runs' : 'home')} onSuccess={saveRun} />}
        {view === 'workspace' && selected && <Workspace analysis={selected} onBack={() => setView('runs')} onUpdate={saveRun} />}
        {view === 'workspace' && !selected && <OpportunityRuns runs={runs} onSelect={openRun} onNew={() => setView('intake')} onDelete={deleteRun} />}
      </>}
    </main>
  </div>;
}
