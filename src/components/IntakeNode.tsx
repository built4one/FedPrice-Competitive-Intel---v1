import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, Loader2, Search, ShieldCheck, UploadCloud, X } from 'lucide-react';
import type { OpportunityAnalysis } from '../types';

interface Props { onBack: () => void; onSuccess: (analysis: OpportunityAnalysis) => void; }

export default function IntakeNode({ onBack, onSuccess }: Props) {
  const [opportunityRef, setOpportunityRef] = useState('');
  const [naicsOverride, setNaicsOverride] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const maxSupplementalBytes = 4 * 1024 * 1024;

  useEffect(() => {
    if (!processing) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [processing]);

  const chooseFiles = (newFiles?: FileList | null) => {
    if (!newFiles) return;
    const added = Array.from(newFiles);
    const nextFiles = [...files, ...added];
    const combined = nextFiles.reduce((sum, file) => sum + file.size, 0);
    if (nextFiles.length > 10) return setError('Add no more than 10 supplemental files. SAM.gov documents are retrieved separately and do not count against this limit.');
    if (combined > maxSupplementalBytes) return setError('For the hosted demo, supplemental uploads must total 4 MB or less. SAM.gov documents are retrieved separately.');
    setError('');
    setFiles(nextFiles);
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const runAnalysis = async () => {
    const samReference = opportunityRef.trim();
    const naics = naicsOverride.trim();
    if (!samReference && files.length === 0) return setError('Enter a solicitation number or SAM.gov opportunity URL. You can also use manual upload as a fallback.');
    if (naics && !/^\d{6}$/.test(naics)) return setError('NAICS override must be a 6-digit code. Leave it blank to use SAM.gov.');
    setProcessing(true);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = new FormData();
      if (samReference) body.append('opportunityRef', samReference);
      if (naics) body.append('naicsOverride', naics);
      files.forEach((file) => body.append('files', file));
      const response = await fetch('/api/analyze-solicitation', { method: 'POST', body, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) throw new Error('The production analysis API is not deployed. Verify the current Vercel deployment and retry.');
        if (response.status === 413) throw new Error('A supplemental upload is too large for the hosted analysis endpoint.');
        if (response.status === 502) throw new Error(payload.error || 'SAM.gov could not assemble the opportunity package. Add the official files below to use the manual fallback.');
        if (response.status === 503) throw new Error(payload.error || 'The production analysis service is not configured. Verify the server-side keys.');
        if ([408, 504].includes(response.status)) throw new Error('The analysis exceeded the hosting time limit. No completed run was saved.');
        throw new Error(payload.error || `Analysis failed with server status ${response.status}.`);
      }
      onSuccess(payload.data);
    } catch (failure) {
      setError(failure instanceof DOMException && failure.name === 'AbortError'
        ? 'Analysis cancelled. Your opportunity reference and supplemental files are still available.'
        : failure instanceof Error ? failure.message : 'The analysis could not be completed.');
      setProcessing(false);
    } finally {
      abortRef.current = null;
    }
  };

  const canRun = opportunityRef.trim().length > 0 || files.length > 0;

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-slate-500 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back</button>
    {!processing ? <>
      <div className="mt-8 max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[.18em] text-blue-600">New analysis · SAM-first intake</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Start with the federal opportunity.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Enter the solicitation number or paste its SAM.gov opportunity URL. Federal Market Position will identify the official notice, pull the opportunity metadata, retrieve accessible solicitation documents, and analyze the package before calculating Market Position.</p>
      </div>

      <div className="mt-8 max-w-3xl space-y-5">
        <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50"><Search className="h-5 w-5 text-blue-700" /></div>
            <div className="min-w-0 flex-1">
              <label htmlFor="opportunity-reference" className="text-xs font-black uppercase tracking-[.12em] text-slate-700">SAM.gov opportunity</label>
              <p className="mt-1 text-xs leading-5 text-slate-500">Use the solicitation number or the full SAM.gov opportunity URL. This is the preferred intake path.</p>
              <input
                id="opportunity-reference"
                value={opportunityRef}
                onChange={(event) => { setOpportunityRef(event.target.value); setError(''); }}
                placeholder="Example: 80TECH24R0001 or https://sam.gov/opp/.../view"
                autoComplete="off"
                className="mt-4 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label htmlFor="naics-override" className="text-[10px] font-black uppercase tracking-[.12em] text-slate-500">NAICS override · optional</label>
                  <input
                    id="naics-override"
                    value={naicsOverride}
                    onChange={(event) => setNaicsOverride(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="SAM.gov normally supplies this"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold outline-none focus:border-blue-500"
                  />
                </div>
                <p className="pb-2 text-[10px] leading-4 text-slate-400 sm:max-w-48">Only use this when you know the correct NAICS and want to override a missing SAM value.</p>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {['Resolve official notice', 'Retrieve public documents', 'Auto-fill NAICS + agency'].map((item) => <div key={item} className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-900"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />{item}</div>)}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.12em] text-slate-700">Supplemental documents</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Optional. Add internal capture material, private analysis, or official files SAM.gov cannot retrieve.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500">Fallback + private intel</span>
          </div>

          <div role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFiles(event.dataTransfer.files); }} onClick={() => inputRef.current?.click()} className={`mt-4 grid min-h-40 cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 text-center transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${dragging ? 'border-blue-500 bg-blue-50' : files.length > 0 ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-300 bg-slate-50/50 hover:border-blue-400'}`}>
            <input ref={inputRef} className="hidden" type="file" multiple accept=".pdf,.doc,.docx,.txt,.xlsx" onChange={(event) => chooseFiles(event.target.files)} />
            <div>
              {files.length > 0 ? <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /> : <UploadCloud className="mx-auto h-8 w-8 text-slate-400" />}
              <h2 className="mt-3 text-xs font-black uppercase tracking-[.12em]">{files.length > 0 ? `${files.length} supplemental file(s)` : 'Add supplemental files'}</h2>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-500">PDF, DOCX, DOC, TXT, or XLSX · up to 10 files / 4 MB combined</p>
            </div>
          </div>

          {files.length > 0 && <div className="mt-4 space-y-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate text-slate-700">{file.name}</span></div>
            <button aria-label={`Remove ${file.name}`} onClick={(event) => { event.stopPropagation(); removeFile(index); }} className="rounded-md p-1 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
          </div>)}</div>}

          <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-700"><ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" /> Official SAM documents, analyst-provided material, inferences, and unresolved gaps remain visibly separated.</div>
        </section>
      </div>

      {error && <div className="mt-5 max-w-3xl flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <div className="mt-6 max-w-3xl flex items-center justify-between gap-4">
        <p className="text-[11px] leading-5 text-slate-400">If SAM.gov is unavailable, adding the official package here preserves the manual fallback.</p>
        <button onClick={runAnalysis} className="shrink-0 rounded-xl bg-[#10243e] px-6 py-3 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50" disabled={!canRun}>BUILD MARKET POSITION</button>
      </div>
    </> : <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="flex items-start gap-3"><Loader2 className="mt-0.5 h-5 w-5 animate-spin text-blue-600" /><div className="flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">Building the opportunity intelligence package</p><span className="font-mono text-xs font-bold text-slate-400">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">The app is resolving the official opportunity, reviewing accessible documents, and building the evidence set before the deterministic Market Position calculation.</p></div></div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">{['Resolving SAM.gov opportunity', 'Retrieving official documents', 'Reading the complete package', 'Searching comparable evidence', 'Calculating Market Position'].map((label) => <div key={label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-500" />{label}</div>)}</div>
      <div className="mt-6 flex justify-end"><button onClick={() => abortRef.current?.abort()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">CANCEL ANALYSIS</button></div>
    </div>}
  </div>;
}
