import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, FileText, Loader2, Search, ShieldCheck, UploadCloud, X } from 'lucide-react';
import type { OpportunityAnalysis } from '../types';

interface Props { onBack: () => void; onSuccess: (analysis: OpportunityAnalysis) => void; }

export default function IntakeNode({ onBack, onSuccess }: Props) {
  const [opportunityRef, setOpportunityRef] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [statusText, setStatusText] = useState('Resolving the official opportunity and building the evidence package.');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const maxUploadBytes = 4 * 1024 * 1024;

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
    if (nextFiles.length > 10) return setError('Add no more than 10 files. SAM.gov documents retrieved automatically do not count against this limit.');
    if (combined > maxUploadBytes) return setError('For the hosted demo, uploaded files must total 4 MB or less. SAM.gov documents are retrieved separately.');
    setError('');
    setFiles(nextFiles);
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const submitAnalysis = async (controller: AbortController, reference?: string) => {
    const body = new FormData();
    if (reference?.trim()) body.append('opportunityRef', reference.trim());
    files.forEach((file) => body.append('files', file));
    const response = await fetch('/api/analyze-solicitation', { method: 'POST', body, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) throw new Error('The production analysis API is not deployed. Verify the current Vercel deployment and retry.');
      if (response.status === 413) throw new Error('An uploaded file is too large for the hosted analysis endpoint.');
      if (response.status === 502) throw new Error(payload.error || 'SAM.gov could not assemble the opportunity package. Upload the official solicitation and retry.');
      if (response.status === 503) throw new Error(payload.error || 'The production analysis service is not configured. Verify the server-side keys.');
      if ([408, 504].includes(response.status)) throw new Error('The analysis exceeded the hosting time limit. No completed run was saved.');
      throw new Error(payload.error || `Analysis failed with server status ${response.status}.`);
    }
    return payload.data as OpportunityAnalysis;
  };

  const runAnalysis = async () => {
    const samReference = opportunityRef.trim();
    if (!samReference && files.length === 0) return setError('Upload a solicitation document or enter its SAM.gov URL / solicitation number.');
    setProcessing(true);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (samReference) {
        setStatusText('Resolving the SAM.gov opportunity, retrieving the official package, and building Market Position.');
        const analysis = await submitAnalysis(controller, samReference);
        onSuccess(analysis);
        return;
      }

      setStatusText('Reading the uploaded solicitation to identify the opportunity automatically.');
      const initialAnalysis = await submitAnalysis(controller);
      const extractedSolicitation = initialAnalysis.deal?.solicitationNumber?.trim();

      if (!extractedSolicitation || /^(unknown|n\/a|not provided|not found)$/i.test(extractedSolicitation)) {
        initialAnalysis.meta.warnings = [
          ...(initialAnalysis.meta.warnings || []),
          'The uploaded package did not expose a reliable solicitation number, so SAM.gov package completion could not run automatically.',
        ];
        onSuccess(initialAnalysis);
        return;
      }

      setStatusText(`Solicitation ${extractedSolicitation} identified. Retrieving the remaining official SAM.gov package and rebuilding the analysis.`);
      const completedAnalysis = await submitAnalysis(controller, extractedSolicitation);
      onSuccess(completedAnalysis);
    } catch (failure) {
      setError(failure instanceof DOMException && failure.name === 'AbortError'
        ? 'Analysis cancelled. Your opportunity reference and uploaded files are still available.'
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
        <p className="text-xs font-black uppercase tracking-[.18em] text-blue-600">New analysis · automatic opportunity intake</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Start with what you already have.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Upload the solicitation, paste its SAM.gov URL, or enter the solicitation number. Federal Market Position identifies the opportunity, fills official metadata such as NAICS and agency, retrieves accessible SAM.gov documents, and analyzes the complete package automatically.</p>
      </div>

      <div className="mt-8 max-w-3xl space-y-5">
        <section className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[.12em] text-slate-700">Upload solicitation</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Preferred when you already have the RFP, RFI, solicitation, amendment, or other official package. FMP will read the identifier and use it to complete the package from SAM.gov.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700">No manual lookup needed</span>
          </div>

          <div role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFiles(event.dataTransfer.files); }} onClick={() => inputRef.current?.click()} className={`mt-4 grid min-h-40 cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 text-center transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${dragging ? 'border-blue-500 bg-blue-50' : files.length > 0 ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-300 bg-slate-50/50 hover:border-blue-400'}`}>
            <input ref={inputRef} className="hidden" type="file" multiple accept=".pdf,.doc,.docx,.txt,.xlsx" onChange={(event) => chooseFiles(event.target.files)} />
            <div>
              {files.length > 0 ? <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /> : <UploadCloud className="mx-auto h-8 w-8 text-slate-400" />}
              <h2 className="mt-3 text-xs font-black uppercase tracking-[.12em]">{files.length > 0 ? `${files.length} file(s) ready` : 'Drop solicitation here'}</h2>
              <p className="mt-1.5 text-[11px] leading-5 text-slate-500">PDF, DOCX, DOC, TXT, or XLSX · up to 10 files / 4 MB combined</p>
            </div>
          </div>

          {files.length > 0 && <div className="mt-4 space-y-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate text-slate-700">{file.name}</span></div>
            <button aria-label={`Remove ${file.name}`} onClick={(event) => { event.stopPropagation(); removeFile(index); }} className="rounded-md p-1 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
          </div>)}</div>}
        </section>

        <div className="flex items-center gap-3 px-2"><div className="h-px flex-1 bg-slate-200" /><span className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">or identify it directly</span><div className="h-px flex-1 bg-slate-200" /></div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100"><Search className="h-5 w-5 text-slate-700" /></div>
            <div className="min-w-0 flex-1">
              <label htmlFor="opportunity-reference" className="text-xs font-black uppercase tracking-[.12em] text-slate-700">SAM.gov URL or solicitation number</label>
              <p className="mt-1 text-xs leading-5 text-slate-500">Use this when you do not want to upload a solicitation first. NAICS is collected automatically from the official record.</p>
              <input
                id="opportunity-reference"
                value={opportunityRef}
                onChange={(event) => { setOpportunityRef(event.target.value); setError(''); }}
                placeholder="Example: FA875026S7002 or https://sam.gov/opp/.../view"
                autoComplete="off"
                className="mt-4 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
              />
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {['Resolve official notice', 'Retrieve public documents', 'Auto-fill NAICS + agency'].map((item) => <div key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-700"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />{item}</div>)}
          </div>
        </section>

        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-700"><ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" /> Official SAM documents, analyst-provided material, inferences, and unresolved gaps remain visibly separated.</div>
      </div>

      {error && <div className="mt-5 max-w-3xl flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <div className="mt-6 max-w-3xl flex items-center justify-between gap-4">
        <p className="text-[11px] leading-5 text-slate-400">One identifier is enough. Uploading a solicitation and entering a SAM reference are both valid starting paths.</p>
        <button onClick={runAnalysis} className="shrink-0 rounded-xl bg-[#10243e] px-6 py-3 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50" disabled={!canRun}>BUILD MARKET POSITION</button>
      </div>
    </> : <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="flex items-start gap-3"><Loader2 className="mt-0.5 h-5 w-5 animate-spin text-blue-600" /><div className="flex-1"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">Building the opportunity intelligence package</p><span className="font-mono text-xs font-bold text-slate-400">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{statusText}</p></div></div>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">{['Identify opportunity', 'Retrieve official documents', 'Read the complete package', 'Search comparable evidence', 'Calculate Market Position'].map((label) => <div key={label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600"><span className="h-2 w-2 rounded-full bg-blue-500" />{label}</div>)}</div>
      <div className="mt-6 flex justify-end"><button onClick={() => abortRef.current?.abort()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">CANCEL ANALYSIS</button></div>
    </div>}
  </div>;
}
