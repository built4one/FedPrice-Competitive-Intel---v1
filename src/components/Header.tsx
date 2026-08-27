import { BarChart3, FolderOpen, Plus, ShieldCheck } from 'lucide-react';

interface Props { view: string; activeTitle?: string; onNavigate: (view: 'home' | 'runs' | 'intake' | 'workspace') => void; }
export default function Header({ view, activeTitle, onNavigate }: Props) {
  return <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
      <button onClick={() => onNavigate('home')} className="flex min-w-0 items-center gap-3 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#10243e] text-white shadow-sm"><BarChart3 className="h-4 w-4" /></span>
        <span className="min-w-0"><span className="block truncate text-sm font-black tracking-tight">FedPrice Competitive Intel</span><span className="hidden text-[10px] font-bold uppercase tracking-[.18em] text-slate-400 sm:block">Evidence-led market positioning</span></span>
      </button>
      {activeTitle && view === 'workspace' && <span className="hidden max-w-xs truncate border-l border-slate-200 pl-4 text-xs font-semibold text-slate-500 lg:block">{activeTitle}</span>}
      <nav className="ml-auto flex items-center gap-1.5">
        <button onClick={() => onNavigate('runs')} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${view === 'runs' || view === 'workspace' ? 'bg-slate-100 text-slate-950' : 'text-slate-500 hover:bg-slate-50'}`}><FolderOpen className="h-4 w-4" /><span className="hidden sm:inline">RUNS</span></button>
        <button onClick={() => onNavigate('intake')} className="inline-flex items-center gap-2 rounded-lg bg-[#1167e8] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"><Plus className="h-4 w-4" /><span className="hidden sm:inline">NEW ANALYSIS</span></button>
        <ShieldCheck className="ml-1 hidden h-4 w-4 text-emerald-600 sm:block" />
      </nav>
    </div>
  </header>;
}
