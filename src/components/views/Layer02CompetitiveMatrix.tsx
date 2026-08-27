import React from 'react';
import { Opportunity, CompetitorProfile } from '../../types';
import { Shield, Target, TrendingUp, Users, Award, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface Layer02Props {
  opp: Opportunity;
  formatCurrency: (val: number) => string;
  formatPercent: (val: number) => string;
}

export default function Layer02CompetitiveMatrix({ opp, formatCurrency, formatPercent }: Layer02Props) {
  const targetScenario = opp.scenarios.find(s => s.name === 'Target') || opp.scenarios[0];
  const targetPrice = targetScenario.totalPrice;

  const competitors: CompetitorProfile[] = opp.competitors || [];

  const chartData = competitors.map(c => ({
    name: c.name.split(' ')[0],
    fullName: c.name,
    bid: c.estimatedBid,
    winProb: c.winProbability
  }));

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Layer 02: Competitive Matrix & Win Probability
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              PREDICTIVE BID BANDS & INCUMBENT PRICE ELASTICITY
            </p>
          </div>
        </div>

        <span className="text-xs font-mono text-blue-700 bg-blue-50 px-3 py-1 rounded border border-blue-200">
          PTW OPTIMAL BAND: {formatCurrency(targetPrice * 0.95)} - {formatCurrency(targetPrice * 1.03)}
        </span>
      </div>

      <div className="p-6 sm:p-8 space-y-8">
        {/* Top Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Target Win Probability (PWin)</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">72%</div>
            <div className="text-xs text-emerald-600 font-medium mt-0.5">Top-quartile best value position</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Incumbent Bid Premium</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">+8.0%</div>
            <div className="text-xs text-amber-600 font-medium mt-0.5">Vulnerable to wrap-optimized challenge</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Evaluator Tradeoff Weight</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">60 / 40</div>
            <div className="text-xs text-blue-600 font-medium mt-0.5">Technical & Past Perf &gt; Price</div>
          </div>
        </div>

        {/* Competitor Grid Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 text-xs font-mono font-bold uppercase text-slate-700">
            COMPETITIVE FIELD ESTIMATES
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white text-slate-400 border-b border-slate-200 text-[10px] uppercase">
                <tr>
                  <th className="py-3 px-4 font-semibold">BIDDER / ENTITY</th>
                  <th className="py-3 px-4 font-semibold">POSTURE</th>
                  <th className="py-3 px-4 font-semibold text-right">ESTIMATED BID</th>
                  <th className="py-3 px-4 font-semibold text-right">DELTA TO TARGET</th>
                  <th className="py-3 px-4 font-semibold text-center">P(WIN)</th>
                  <th className="py-3 px-4 font-semibold">KEY STRATEGY / WEAKNESS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-sans text-xs">
                {competitors.map((c, idx) => {
                  const isUs = c.name.includes('Recommended');
                  const delta = ((c.estimatedBid - targetPrice) / targetPrice) * 100;
                  return (
                    <tr key={idx} className={`hover:bg-slate-50/80 ${isUs ? 'bg-blue-50/40 font-semibold' : ''}`}>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {c.name}
                        {isUs && <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-mono">OUR PTW</span>}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px]">
                        <span className={`px-2 py-0.5 rounded border ${
                          c.pricingPosture === 'Aggressive' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          c.pricingPosture === 'Premium' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {c.pricingPosture}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(c.estimatedBid)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs">
                        <span className={delta > 0 ? 'text-purple-600' : delta < 0 ? 'text-amber-600' : 'text-blue-600 font-bold'}>
                          {delta > 0 ? `+${delta.toFixed(1)}%` : delta < 0 ? `${delta.toFixed(1)}%` : '0.0% (BASELINE)'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${isUs ? 'bg-blue-600' : 'bg-slate-600'}`} 
                              style={{ width: `${c.winProbability}%` }}
                            />
                          </div>
                          <span>{c.winProbability}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-xs">
                        {c.keyDifferentiator}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visual Bid Distribution Chart */}
        <div>
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900 mb-4">
            BID BAND COMPARISON ACROSS COMPETITORS ($M)
          </h3>
          <div className="h-64 w-full bg-slate-50/50 p-4 rounded-lg border border-slate-200">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`}
                />
                <Tooltip 
                  formatter={(val: number) => [formatCurrency(val), 'Estimated Bid']}
                  contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '12px' }}
                />
                <Bar dataKey="bid" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
