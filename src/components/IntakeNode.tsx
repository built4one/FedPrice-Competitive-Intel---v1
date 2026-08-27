import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, FileText, Loader2, ShieldCheck, UploadCloud } from 'lucide-react';
import type { CompanyContext, OpportunityAnalysis } from '../types';

interface Props { onBack: () => void; onSuccess: (analysis: OpportunityAnalysis) => void; }
const blankCompany: CompanyContext = { companyName: '', riskPosture: 'BALANCED', differentiators: '', constraints: '' };
const steps = ['Read solicitation and extract deal facts', 'Build evidence ledger and pricing signals', 'Research market, competitors, and incumbent', 'Score recommendation drivers and confidence', 'Generate positioning guidance'];

export default function IntakeNode({ onBack, onSuccess }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [includeCompany, setIncludeCompany] = useState(false);
  const [company, setCompany] = useState<CompanyContext>(blankCompany);
  const [processing, setProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!processing) return;
    const interval = window.setInterval(() => setActiveStep((current) => Math.min(current + 1, steps.length - 1)), 3500);
    return () => window.clearInterval(interval);
  }, [processing]);

  const chooseFile = (next?: File) => {
    if (!next) return;
    if (next.size > 25 * 1024 * 1024) return setError('File must be 25 MB or smaller.');
    setError(''); setFile(next);
  };
  const updateCompany = (key: keyof CompanyContext, value: string | number | undefined) => setCompany((current) => ({ ...current, [key]: value }));

  const runAnalysis = async () => {
    if (!file) return setError('Choose a solicitation file first.');
    if (includeCompany && !company.companyName.trim()) return setError('Add the company name or turn off company positioning.');
    setProcessing(true); setError(''); setActiveStep(0);
    try {
      const body = new FormData(); body.append('file', file);
      if (includeCompany) body.append('companyContext', JSON.stringify(company));
      const response = await fetch('/api/analyze-solicitation', { method: 'POST', body });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Analysis failed.');
      if (!payload.data) throw new Error('Analysis completed but returned no data.');
      onSuccess(payload.data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The analysis could not be completed.');
      setProcessing(false);
    }
  };

  return <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
    <button onClick={onBack} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-slate-500 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back</button>
    {!processing ? <>
      <div className="mt-8 max-w-2xl"><p className="text-xs font-black uppercase tracking-[.18em] text-blue-600">New analysis</p><h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Start with the solicitation.</h1><p className="mt-3 text-sm leading-6 text-slate-500">The market position is complete on its own. Company inputs are optional and only refine the final position for your specific bid.</p></div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }} onClick={() => inputRef.current?.click()} className={`grid min-h-64 cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : file ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-300 bg-slate-50/50 hover:border-blue-400'}`}>
          <input ref={inputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.txt" onChange={(event) => chooseFile(event.target.files?.[0])} />
          <div>{file ? <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /> : <UploadCloud className="mx-auto h-10 w-10 text-blue-600" />}<h2 className="mt-4 text-sm font-black uppercase tracking-[.12em]">{file ? file.name : 'Secure solicitation upload'}</h2><p className="mt-2 text-xs leading-5 text-slate-500">PDF, DOCX, DOC, or TXT · up to 25 MB</p>{file && <p className="mt-3 text-[11px] font-bold text-emerald-700">Ready for analysis · click to replace</p>}</div>
        </div><div className="mt-4 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-900"><ShieldCheck className="h-4 w-4 shrink-0" /> Facts, inferences, external sources, and data gaps remain visibly separated.</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-black">Company position</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Optional. Skip this to receive a market-only recommendation.</p></div><button type="button" onClick={() => setIncludeCompany((value) => !value)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${includeCompany ? 'bg-blue-600' : 'bg-slate-200'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${includeCompany ? 'left-6' : 'left-1'}`} /></button></div>
          {includeCompany ? <div className="mt-5 space-y-3"><Input label="Company name" value={company.companyName} onChange={(v) => updateCompany('companyName', v)} /><div className="grid grid-cols-2 gap-3"><NumberInput label="Estimated price" value={company.estimatedPrice} onChange={(v) => updateCompany('estimatedPrice', v)} /><NumberInput label="Cost baseline" value={company.costBaseline} onChange={(v) => updateCompany('costBaseline', v)} /></div><div className="grid grid-cols-2 gap-3"><NumberInput label="Target margin %" value={company.targetMarginPct} onChange={(v) => updateCompany('targetMarginPct', v)} /><label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Risk posture<select value={company.riskPosture} onChange={(e) => updateCompany('riskPosture', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm normal-case text-slate-900"><option>CONSERVATIVE</option><option>BALANCED</option><option>AGGRESSIVE</option></select></label></div><TextArea label="Differentiators" value={company.differentiators} onChange={(v) => updateCompany('differentiators', v)} /><TextArea label="Constraints" value={company.constraints} onChange={(v) => updateCompany('constraints', v)} /></div> : <div className="mt-8 rounded-xl border border-dashed border-slate-200 p-5 text-center"><FileText className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-xs font-bold text-slate-500">Market-only mode selected</p></div>}
        </section>
      </div>
      {error && <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      <div className="mt-6 flex justify-end"><button onClick={runAnalysis} className="rounded-xl bg-[#10243e] px-6 py-3 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50" disabled={!file}>GENERATE {includeCompany ? 'MARKET + COMPANY' : 'MARKET'} POSITION</button></div>
    </> : <div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"><div className="flex items-center gap-3 border-b border-slate-100 pb-5"><Loader2 className="h-5 w-5 animate-spin text-blue-600" /><div><p className="text-sm font-black">Building decision-grade intelligence</p><p className="mt-1 text-xs text-slate-400">Keep this window open. Grounded research may take a few minutes.</p></div></div><div className="mt-6 space-y-4">{steps.map((step, index) => <div key={step} className="flex items-center gap-3"><span className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-black ${index < activeStep ? 'bg-emerald-500 text-white' : index === activeStep ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{index < activeStep ? '✓' : index + 1}</span><span className={`text-sm ${index <= activeStep ? 'font-bold text-slate-900' : 'text-slate-400'}`}>{step}</span></div>)}</div></div>}
  </div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm normal-case text-slate-900" /></label>; }
function NumberInput({ label, value, onChange }: { label: string; value?: number; onChange: (value?: number) => void }) { return <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}<input type="number" min="0" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm normal-case text-slate-900" /></label>; }
function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}<textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm normal-case text-slate-900" /></label>; }
