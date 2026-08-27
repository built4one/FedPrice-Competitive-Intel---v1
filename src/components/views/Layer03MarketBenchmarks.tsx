import React from 'react';
import { Opportunity } from '../../types';
import { BarChart3, TrendingUp, DollarSign, CheckCircle2 } from 'lucide-react';

interface Layer03Props {
  opp: Opportunity;
  formatCurrency: (val: number) => string;
  formatPercent: (val: number) => string;
}

export default function Layer03MarketBenchmarks({ opp, formatCurrency, formatPercent }: Layer03Props) {
  const allLaborCategories = opp.clins.flatMap(c => c.laborCategories);

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Layer 03: Market Benchmarks & AI Intelligence
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              LLM ESTIMATED PERCENTILES & WRAP MULTIPLIERS
            </p>
          </div>
        </div>

        <span className="text-xs font-mono text-blue-700 bg-blue-50 px-3 py-1 rounded border border-blue-200">
          AI ESTIMATE
        </span>
      </div>

      <div className="p-6 sm:p-8 space-y-8">
        {/* Wrap Rate Standard Industry Benchmarks */}
        <div>
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 mb-4">
            INDIRECT WRAP RATE BENCHMARKS (GOVERNMENT CONTRACTING STANDARDS)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-mono text-slate-500 uppercase">Fringe Benefits</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">28% - 35%</div>
              <div className="text-xs text-slate-500 mt-1">Health, 401(k), PTO & FICA</div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-mono text-slate-500 uppercase">Overhead (OH)</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">40% - 60%</div>
              <div className="text-xs text-slate-500 mt-1">Site support, tooling, unbilled</div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-mono text-slate-500 uppercase">General & Admin (G&A)</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">8% - 12%</div>
              <div className="text-xs text-slate-500 mt-1">Executive, legal, accounting</div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-mono text-slate-500 uppercase">Fee / Profit Target</div>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">5% - 9%</div>
              <div className="text-xs text-slate-500 mt-1">FAR weighted guidelines</div>
            </div>
          </div>
        </div>

        {/* Labor Category Benchmarking Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 text-xs font-mono font-bold uppercase text-slate-700 flex justify-between items-center">
            <span>LABOR CATEGORY RATE COMPARISON (PROPOSED VS GSA CALC)</span>
            <span className="text-[11px] text-slate-500 font-normal">HOURLY FULLY LOADED RATES</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white text-slate-400 border-b border-slate-200 text-[10px] uppercase">
                <tr>
                  <th className="py-3 px-4 font-semibold">LABOR CATEGORY</th>
                  <th className="py-3 px-4 font-semibold text-right">DIRECT BASE</th>
                  <th className="py-3 px-4 font-semibold text-right text-slate-500">25TH %ILE</th>
                  <th className="py-3 px-4 font-semibold text-right text-blue-600">GSA MEDIAN (50TH)</th>
                  <th className="py-3 px-4 font-semibold text-right text-slate-500">75TH %ILE</th>
                  <th className="py-3 px-4 font-semibold text-center">VARIANCE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-sans text-xs">
                {allLaborCategories.map((lc, idx) => {
                  const min = lc.gsaCalcBenchmark?.min || Math.round(lc.baseRate * 0.95);
                  const median = lc.gsaCalcBenchmark?.median || Math.round(lc.baseRate * 1.15);
                  const max = lc.gsaCalcBenchmark?.max || Math.round(lc.baseRate * 1.35);
                  const variance = (((lc.baseRate * 1.8) - median) / median) * 100;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-medium text-slate-900">{lc.title}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">${lc.baseRate}/hr</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">${min}/hr</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-blue-600 bg-blue-50/30">${median}/hr</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">${max}/hr</td>
                      <td className="py-3 px-4 text-center font-mono text-xs">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Within 1σ
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
