import React from 'react';
import { ArrowRight, Sparkles, Database, Layers, ShieldCheck, TrendingUp, BarChart3 } from 'lucide-react';

interface LandingHeroProps {
  onOpenWorkspace: () => void;
}

export default function LandingHero({ onOpenWorkspace }: LandingHeroProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-between bg-white selection:bg-blue-100">
      {/* Hero Section */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-16 text-center flex-1 flex flex-col items-center justify-center">
        {/* Eyebrow Tag */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded border border-blue-200 bg-blue-50/50 text-blue-700 text-xs font-mono tracking-widest uppercase mb-8 shadow-xs">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>AI-POWERED BID INTELLIGENCE</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-slate-950 max-w-4xl leading-[1.08] mb-6">
          Know how to price <br className="hidden sm:inline" />
          before you bid.
        </h1>

        {/* Hero Subtitle */}
        <p className="text-lg sm:text-xl text-slate-600 max-w-2xl font-normal leading-relaxed mb-10">
          The AI-powered bid intelligence platform for government contractors. Upload a solicitation, 
          assess the competitive field, benchmark the market, and develop a defensible price-to-win strategy.
        </p>

        {/* CTA Button */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={onOpenWorkspace}
            className="flex items-center gap-3 px-8 py-4 bg-slate-950 hover:bg-slate-800 text-white font-mono text-sm tracking-wider uppercase rounded-md shadow-md hover:shadow-lg transition-all transform active:scale-98 group"
          >
            <span>OPEN WORKSPACE</span>
            <ArrowRight className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Value Props Mini Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 max-w-4xl w-full text-left">
          <div className="p-5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-slate-200 transition-colors">
            <div className="text-blue-600 text-xs font-mono font-semibold uppercase mb-1">01 • REQ EXTRACTION</div>
            <div className="font-semibold text-slate-900 text-sm mb-1">Automated CLIN & Labor Mapping</div>
            <div className="text-slate-500 text-xs leading-relaxed">
              Instant Section L/M parsing and labor category normalization directly to GSA CALC baselines.
            </div>
          </div>

          <div className="p-5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-slate-200 transition-colors">
            <div className="text-blue-600 text-xs font-mono font-semibold uppercase mb-1">02 • COMPETITIVE INTEL</div>
            <div className="font-semibold text-slate-900 text-sm mb-1">Incumbent Rate Friction & Win Probabilities</div>
            <div className="text-slate-500 text-xs leading-relaxed">
              Historical wrap analysis, wage turnover risk modeling, and defensible win-theme synthesis.
            </div>
          </div>

          <div className="p-5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-slate-200 transition-colors">
            <div className="text-blue-600 text-xs font-mono font-semibold uppercase mb-1">03 • DETERMINISTIC MATH</div>
            <div className="font-semibold text-slate-900 text-sm mb-1">Live Escalated Cost Modeling</div>
            <div className="text-slate-500 text-xs leading-relaxed">
              Real-time multi-scenario wrap simulations (Aggressive, Target, Conservative) with instant Excel export.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Ticker */}
      <div className="w-full border-t border-slate-200 bg-slate-50 py-4 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] font-mono text-slate-500 uppercase tracking-widest text-center md:text-left">
          <span className="font-semibold text-slate-700">THE 5 CORE INTELLIGENCE LAYERS:</span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>01 DEAL SNAPSHOT</span>
            <span>•</span>
            <span>02 COMPETITIVE MATRIX</span>
            <span>•</span>
            <span>03 MARKET BENCHMARKS</span>
            <span>•</span>
            <span>04 INCUMBENT VULNERABILITY</span>
            <span>•</span>
            <span>05 EVIDENCE LEDGER</span>
          </div>
        </div>
      </div>
    </div>
  );
}
