import React from 'react';
import { OpportunityAnalysis, MarketPosition } from '../../types';
import { ShieldAlert, AlertTriangle, Info, CheckCircle2, ChevronRight, CheckSquare, Activity, Shield, TrendingUp, Target, UserCheck } from 'lucide-react';

const money = (value: number | null | undefined) => value == null ? 'Insufficient evidence' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

interface Props {
  analysis: OpportunityAnalysis;
}

export const ExecutiveBrief: React.FC<Props> = ({ analysis }) => {
  const { deal, narrative, marketPosition: position, competitors, incumbent, affordability, gaps } = analysis;

  const score = position.evidenceReadiness.score;
  const confidenceLevel = score >= 80 ? 'High' : score >= 50 ? 'Moderate' : 'Low';
  const confidenceColor = score >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : score >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200' : 'text-rose-700 bg-rose-50 border-rose-200';

  const usedAnchors = position.anchors.filter(a => a.included);
  
  return (
    <div className="bg-white text-slate-900 font-sans p-8 w-[800px] mx-auto text-[13px] leading-relaxed">
      
      {/* HEADER */}
      <header className="border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Federal Market Position</h1>
            <h2 className="text-2xl font-black leading-tight text-[#10243e] max-w-xl">{deal.title}</h2>
          </div>
          <div className="text-right text-[10px] text-slate-500 uppercase font-bold text-right shrink-0">
            <div>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
          </div>
        </div>
        
        <div className="mt-4 grid grid-cols-4 gap-4 text-xs">
          <div>
            <div className="text-[9px] font-black uppercase text-slate-400">Agency</div>
            <div className="font-bold truncate">{deal.agency || 'Unknown'}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase text-slate-400">Solicitation</div>
            <div className="font-bold truncate">{deal.solicitationNumber || 'Pre-RFP'}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase text-slate-400">Contract Type</div>
            <div className="font-bold truncate">{deal.contractType || 'Unknown'}</div>
          </div>
          <div>
            <div className="text-[9px] font-black uppercase text-slate-400">Est. Value</div>
            <div className="font-bold truncate">{affordability?.estimatedCeiling || deal.estimatedValue || 'Not Published'}</div>
          </div>
        </div>
      </header>

      {/* A. EXECUTIVE READOUT */}
      <section className="mb-8">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-1">A. Executive Readout</h3>
        <p className="text-[15px] font-medium leading-relaxed text-[#10243e]">
          {narrative.headline} {narrative.rationale}
        </p>
      </section>

      {/* B. RECOMMENDED MARKET POSITION */}
      <section className="mb-8">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1">B. Recommended Market Position</h3>
        <div className="flex gap-4 mb-4">
          <div className="flex-1 bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col justify-between">
            <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Aggressive Target</div>
            <div className="text-xl font-black text-slate-700">{money(position.aggressive)}</div>
          </div>
          <div className="flex-1 bg-[#10243e] border border-[#10243e] p-4 rounded-lg flex flex-col justify-between shadow-sm">
            <div className="text-[10px] font-black uppercase text-blue-300 mb-1 flex items-center gap-1"><Target className="w-3 h-3"/> Expected Position</div>
            <div className="text-2xl font-black text-white">{money(position.expected)}</div>
          </div>
          <div className="flex-1 bg-slate-50 border border-slate-200 p-4 rounded-lg flex flex-col justify-between">
            <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Conservative Target</div>
            <div className="text-xl font-black text-slate-700">{money(position.conservative)}</div>
          </div>
        </div>
        
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
          <div className="text-[10px] font-black uppercase text-slate-500 mb-2">Why this position</div>
          <ul className="space-y-1.5">
            {position.drivers?.length > 0 ? (
               position.drivers.slice(0, 4).map((d, i) => (
                 <li key={i} className="flex items-start gap-2 text-xs">
                   <ChevronRight className="w-3.5 h-3.5 text-[#10243e] mt-0.5 shrink-0" />
                   <span><strong className="font-bold text-slate-800">{d.factor}:</strong> {d.impact}</span>
                 </li>
               ))
            ) : (
              position.basis.slice(0, 4).map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <ChevronRight className="w-3.5 h-3.5 text-[#10243e] mt-0.5 shrink-0" />
                  <span>{b}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      {/* C & D: SIDE BY SIDE FOR COMPACTNESS */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        
        {/* C. OPPORTUNITY AT A GLANCE */}
        <section>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1">C. Opportunity At A Glance</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-50 pb-1"><span className="text-slate-500">Period of Performance</span><span className="font-bold">{deal.periodOfPerformance || 'Unknown'}</span></div>
            <div className="flex justify-between border-b border-slate-50 pb-1"><span className="text-slate-500">Award Structure</span><span className="font-bold">{deal.awardStructure || 'Unknown'}</span></div>
            <div className="flex justify-between border-b border-slate-50 pb-1"><span className="text-slate-500">NAICS / PSC</span><span className="font-bold">{deal.naics || 'Unknown'} {deal.psc ? `/ ${deal.psc}` : ''}</span></div>
            <div className="flex justify-between border-b border-slate-50 pb-1"><span className="text-slate-500">Set-Aside</span><span className="font-bold">{deal.setAside || 'None / Unrestricted'}</span></div>
            <div className="flex justify-between border-b border-slate-50 pb-1"><span className="text-slate-500">Incumbent</span><span className="font-bold truncate max-w-[150px] text-right">{incumbent?.name || 'Unknown / None'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Vehicle</span><span className="font-bold">{deal.vehicle || 'Open Market'}</span></div>
          </div>
        </section>

        {/* D. MARKET & COMPETITIVE SIGNALS */}
        <section>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1">D. Market & Competitive Signals</h3>
          <div className="space-y-3">
            {incumbent?.name && (
              <div className="text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-slate-400" /> Incumbent Vulnerability</div>
                <div className="text-slate-600 mt-0.5">Risk: <span className="font-bold">{incumbent.transitionRisk}</span>. {incumbent.weaknesses?.[0] || 'No specific weaknesses identified.'}</div>
              </div>
            )}
            
            {competitors?.length > 0 && (
              <div className="text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5 text-slate-400" /> Key Competitor Signals</div>
                <div className="text-slate-600 mt-0.5"><span className="font-bold">{competitors[0].name}</span>: {competitors[0].rationale}</div>
              </div>
            )}
            
            {affordability?.fundingAvailability && (
              <div className="text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-slate-400" /> Agency Affordability</div>
                <div className="text-slate-600 mt-0.5">Availability: <span className="font-bold">{affordability.fundingAvailability}</span>. {affordability.budgetSignals?.[0]}</div>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* E. WHAT COULD MOVE THE POSITION? */}
      <section className="mb-8">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1">E. What Could Move The Position?</h3>
        <div className="grid grid-cols-2 gap-4">
          {narrative.guardrails.slice(0, 4).map((guardrail, idx) => (
            <div key={idx} className="bg-slate-50 border-l-2 border-amber-400 p-3 text-xs">
              <span className="text-slate-800">{guardrail}</span>
            </div>
          ))}
          {narrative.guardrails.length === 0 && position.assumptions.slice(0, 4).map((assumption, idx) => (
             <div key={idx} className="bg-slate-50 border-l-2 border-blue-400 p-3 text-xs">
               <span className="text-slate-800">{assumption}</span>
             </div>
          ))}
        </div>
      </section>

      {/* F & G: SIDE BY SIDE */}
      <div className="grid grid-cols-2 gap-8 mb-8" style={{ pageBreakInside: 'avoid' }}>
        
        {/* F. CONFIDENCE & GAPS */}
        <section>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1">F. Confidence & Gaps</h3>
          <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded border text-[11px] font-black uppercase mb-3 ${confidenceColor}`}>
            <Activity className="w-3.5 h-3.5" />
            Confidence: {confidenceLevel} ({score}/100)
          </div>
          <p className="text-xs text-slate-600 mb-3">{position.summary}</p>
          
          {gaps.length > 0 && (
            <div>
              <div className="text-[10px] font-black uppercase text-slate-500 mb-1">Critical Intelligence Gaps</div>
              <ul className="space-y-1.5 text-xs text-slate-700">
                {gaps.slice(0, 2).map((gap, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-500 font-black mt-0.5">•</span>
                    <span><strong className="font-bold">{gap.question}</strong> {gap.impact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* G. RECOMMENDED NEXT ACTIONS */}
        <section>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3 border-b border-slate-100 pb-1">G. Recommended Next Actions</h3>
          <ul className="space-y-3">
            {narrative.nextActions.slice(0, 3).map((action, idx) => (
              <li key={idx} className="flex items-start gap-2.5 bg-blue-50/50 p-3 rounded-lg border border-blue-100/50 text-xs">
                <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] shrink-0">{idx + 1}</div>
                <div className="text-slate-800 pt-0.5">{action}</div>
              </li>
            ))}
          </ul>
        </section>

      </div>

      {/* EVIDENCE & SOURCES (END) */}
      <section className="pt-6 border-t border-slate-200" style={{ pageBreakInside: 'avoid' }}>
        <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Evidence & Sources</h3>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] text-slate-500">
          <div><strong className="font-bold text-slate-700 uppercase">Used Anchors:</strong> {usedAnchors.length} of {position.anchors.length} evaluated</div>
          <div><strong className="font-bold text-slate-700 uppercase">Calculation Basis:</strong> {position.formulaVersion}</div>
          <div><strong className="font-bold text-slate-700 uppercase">Data Posture:</strong> {position.posture.replaceAll('_', ' ')}</div>
        </div>
        
        {usedAnchors.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {usedAnchors.slice(0, 6).map((a, i) => (
              <div key={i} className="text-[10px] truncate text-slate-600 flex justify-between border-b border-slate-50 pb-1">
                <span className="truncate pr-2">{a.sourceLabel}</span>
                <span className="font-bold text-slate-800">{money(a.normalizedValue || a.originalValue)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-[9px] text-slate-400 uppercase tracking-widest text-center">
          Generated securely by Federal Market Position • Proprietary & Confidential
        </div>
      </section>

    </div>
  );
};
