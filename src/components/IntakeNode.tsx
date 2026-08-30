import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck, UploadCloud, FileText, X } from 'lucide-react';
import type { OpportunityAnalysis } from '../types';

interface Props { onBack: () => void; onSuccess: (analysis: OpportunityAnalysis) => void; }

export default function IntakeNode({ onBack, onSuccess }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const maxPackageBytes = 4 * 1024 * 1024;

  useEffect(() => {
    if (!processing) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [processing]);

  const chooseFiles = (newFiles?: FileList | null) => {
    if (!newFiles) return;
    const added = Array.from(newFiles);
    const combined = [...files, ...added].reduce((sum, file) => sum + file.size, 0);
    if (combined > maxPackageBytes) return setError('For the hosted demo, the combined package must be 4 MB or smaller. Remove a file or use a compressed PDF.');
    setError('');
    setFiles(prev => [...prev, ...added]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const runAnalysis = async () => {
    if (files.length === 0) return setError('Choose at least one solicitation file first.');
    setProcessing(true); setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = new FormData();
      files.forEach(f => body.append('files', f));
      const response = await fetch('/api/analyze-solicitation', { method: 'POST', body, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) throw new Error('The production analysis API is not deployed. Verify the current Vercel deployment and retry.');
        if (response.status === 413) throw new Error('The uploaded package is too large for the hosted analysis endpoint. Use a package under 4 MB.');
        if (response.status === 503) throw new Error(payload.error || 'The production analysis service is not configured. Verify the server-side Gemini key.');
        if ([408, 504].includes(response.status)) throw new Error('The analysis exceeded the hosting time limit. Your documents were not treated as a completed run.');
        throw new Error(payload.error || `Analysis failed with server status ${response.status}.`);
      }
      onSuccess(payload.data);
    } catch (failure) {
      setError(failure instanceof DOMException && failure.name === 'AbortError'
        ? 'Analysis cancelled. Your selected files are still available.'
        : failure instanceof Error ? failure.message : 'The analysis could not be completed.');
      setProcessing(false);
    } finally {
      abortRef.current = null;
    }
  };

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-slate-500 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back</button>
    {!processing ? <>
      <div className="mt-8 max-w-2xl"><p className="text-xs font-black uppercase tracking-[.18em] text-blue-600">New analysis</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Start with the solicitation.</h1><p className="mt-3 text-sm leading-6 text-slate-500">Upload the complete solicitation package (PDFs, Pricing Schedules, IDIQ docs, SOW). The app extracts facts, identifies missing SAM.gov documents, and generates a Market Position.</p></div>
      <div className="mt-8 max-w-2xl">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFiles(event.dataTransfer.files); }} onClick={() => inputRef.current?.click()} className={`grid min-h-64 cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 text-center transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${dragging ? 'border-blue-500 bg-blue-50' : files.length > 0 ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-300 bg-slate-50/50 hover:border-blue-400'}`}>
            <input ref={inputRef} className="hidden" type="file" multiple accept=".pdf,.doc,.docx,.txt" onChange={(event) => chooseFiles(event.target.files)} />
            <div>
              {files.length > 0 ? <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /> : <UploadCloud className="mx-auto h-10 w-10 text-blue-600" />}
              <h2 className="mt-4 text-sm font-black uppercase tracking-[.12em]">{files.length > 0 ? `${files.length} file(s) selected` : 'Secure solicitation upload'}</h2>
              <p className="mt-2 text-xs leading-5 text-slate-500">PDF, DOCX, DOC, or TXT · up to 10 files / 4 MB combined</p>
              {files.length > 0 && <p className="mt-3 text-[11px] font-bold text-emerald-700">Ready for analysis · click to add more</p>}
            </div>
          </div>
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate text-slate-700">{f.name}</span>
                  </div>
                  <button aria-label={`Remove ${f.name}`} onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="p-1 hover:bg-slate-200 rounded-md text-slate-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-900"><ShieldCheck className="h-4 w-4 shrink-0" /> Facts, inferences, external sources, and data gaps remain visibly separated.</div>
        </section>
      </div>
      {error && <div className="mt-5 max-w-2xl flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <div className="mt-6 max-w-2xl flex justify-end"><button onClick={runAnalysis} className="rounded-xl bg-[#10243e] px-6 py-3 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50" disabled={files.length === 0}>GENERATE MARKET POSITION</button></div>
    </> : <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="flex items-start gap-3"><Loader2 className="mt-0.5 h-5 w-5 animate-spin text-blue-600" /><div className="flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">Building decision-grade intelligence</p><span className="font-mono text-xs font-bold text-slate-400">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">Most packages finish in 45–120 seconds. Slow or unavailable public sources will degrade honestly instead of stopping the run.</p></div></div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">{['Reading the solicitation', 'Checking the official package', 'Searching comparable evidence', 'Calculating the Market Position'].map((label) => <div key={label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-500" />{label}</div>)}</div>
      <div className="mt-6 flex justify-end"><button onClick={() => abortRef.current?.abort()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">CANCEL ANALYSIS</button></div>
    </div>}
  </div>;
}
