import React from 'react';
import { Opportunity } from '../../types';
import { Printer, TrendingDown, Target, Shield, Users } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function BriefingView({ 
  opp, 
  formatCurrency,
  formatPercent
}: { 
  opp: Opportunity;
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
}) {
  const targetScenario = opp.scenarios.find(s => s.name === 'Target') || opp.scenarios[0];
  const aggressiveScenario = opp.scenarios.find(s => s.name === 'Aggressive');
  const conservativeScenario = opp.scenarios.find(s => s.name === 'Conservative');

  const totalFtes = opp.clins.reduce((sum, clin) => 
    sum + clin.laborCategories.reduce((s, lc) => s + lc.fte, 0)
  , 0);

  const chartData = opp.scenarios.map(s => ({
    name: s.name,
    Price: s.totalPrice
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 sm:p-10 border-b border-slate-200 bg-slate-900 text-white flex justify-between items-start">
        <div>
          <div className="text-blue-400 font-semibold tracking-wider text-xs uppercase mb-2">Executive PTW Briefing</div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-2">{opp.title}</h2>
          <div className="text-slate-300 flex items-center gap-4 text-sm sm:text-base">
            <span>{opp.agency}</span>
            <span>•</span>
            <span>{opp.solicitationNumber}</span>
            <span>•</span>
            <span>{opp.popYears} Year PoP</span>
          </div>
        </div>
        <button 
          onClick={() => window.print()}
          className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors border border-white/20"
        >
          <Printer className="w-4 h-4" />
          <span>Print</span>
        </button>
      </div>

      <div className="p-6 sm:p-10 space-y-10">
        
        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
            <Target className="w-8 h-8 text-blue-600 mb-3" />
            <div className="text-slate-500 text-sm font-medium mb-1">Recommended Target Price</div>
            <div className="text-3xl font-bold text-slate-900">{formatCurrency(targetScenario.totalPrice)}</div>
          </div>
          
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
            <Users className="w-8 h-8 text-emerald-600 mb-3" />
            <div className="text-slate-500 text-sm font-medium mb-1">Required Workforce</div>
            <div className="text-3xl font-bold text-slate-900">{totalFtes} <span className="text-lg text-slate-500 font-normal">FTEs</span></div>
          </div>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
            <TrendingDown className="w-8 h-8 text-purple-600 mb-3" />
            <div className="text-slate-500 text-sm font-medium mb-1">Target Profit Margin (Fee)</div>
            <div className="text-3xl font-bold text-slate-900">{formatPercent(targetScenario.assumptions.fee)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Scenario Overview */}
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">Scenario Analysis</h3>
            <div className="h-64 w-full mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b' }}
                    tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatCurrency(value), 'Total Price']}
                    cursor={{fill: 'transparent'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="Price" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdown Table */}
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">Pricing Comparison</h3>
            <div className="overflow-x-auto mt-6">
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="pb-3 font-medium">Cost Element</th>
                    <th className="pb-3 font-medium text-right">Aggressive</th>
                    <th className="pb-3 font-medium text-right text-blue-600">Target</th>
                    <th className="pb-3 font-medium text-right">Conservative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3 font-medium text-slate-900">Direct Labor</td>
                    <td className="py-3 text-right text-slate-600">{aggressiveScenario ? formatCurrency(aggressiveScenario.breakdown.directLabor) : '-'}</td>
                    <td className="py-3 text-right font-medium text-blue-900">{formatCurrency(targetScenario.breakdown.directLabor)}</td>
                    <td className="py-3 text-right text-slate-600">{conservativeScenario ? formatCurrency(conservativeScenario.breakdown.directLabor) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-slate-900">Wrap Rates (Fr, OH, G&A)</td>
                    <td className="py-3 text-right text-slate-600">{aggressiveScenario ? formatCurrency(aggressiveScenario.breakdown.fringeCost + aggressiveScenario.breakdown.overheadCost + aggressiveScenario.breakdown.gaCost) : '-'}</td>
                    <td className="py-3 text-right font-medium text-blue-900">{formatCurrency(targetScenario.breakdown.fringeCost + targetScenario.breakdown.overheadCost + targetScenario.breakdown.gaCost)}</td>
                    <td className="py-3 text-right text-slate-600">{conservativeScenario ? formatCurrency(conservativeScenario.breakdown.fringeCost + conservativeScenario.breakdown.overheadCost + conservativeScenario.breakdown.gaCost) : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium text-slate-900">Fee Amount</td>
                    <td className="py-3 text-right text-slate-600">{aggressiveScenario ? formatCurrency(aggressiveScenario.breakdown.feeAmount) : '-'}</td>
                    <td className="py-3 text-right font-medium text-blue-900">{formatCurrency(targetScenario.breakdown.feeAmount)}</td>
                    <td className="py-3 text-right text-slate-600">{conservativeScenario ? formatCurrency(conservativeScenario.breakdown.feeAmount) : '-'}</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="py-4 text-slate-900 rounded-l-lg px-2">Total Price</td>
                    <td className="py-4 text-right text-slate-900">{aggressiveScenario ? formatCurrency(aggressiveScenario.totalPrice) : '-'}</td>
                    <td className="py-4 text-right text-blue-700 bg-blue-50/50">{formatCurrency(targetScenario.totalPrice)}</td>
                    <td className="py-4 text-right text-slate-900 rounded-r-lg">{conservativeScenario ? formatCurrency(conservativeScenario.totalPrice) : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
