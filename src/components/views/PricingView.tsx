import React from 'react';
import { Opportunity } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Percent } from 'lucide-react';

export default function PricingView({ 
  opp, 
  chartData, 
  colors, 
  formatCurrency, 
  formatPercent 
}: { 
  opp: Opportunity, 
  chartData: any[], 
  colors: Record<string, string>, 
  formatCurrency: (v: number) => string,
  formatPercent: (v: number) => string
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">Price to Win Scenarios</h3>
        <div className="h-80 w-full -ml-4 sm:ml-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
              <YAxis 
                tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b' }}
              />
              <RechartsTooltip 
                formatter={(value: number) => formatCurrency(value)}
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="Direct Labor" stackId="a" fill={colors['Direct Labor']} />
              <Bar dataKey="Fringe & Overhead" stackId="a" fill={colors['Fringe & Overhead']} />
              <Bar dataKey="G&A" stackId="a" fill={colors['G&A']} />
              <Bar dataKey="Fee" stackId="a" fill={colors['Fee']} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {opp.scenarios.map(scenario => (
          <div key={scenario.name} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-slate-900">{scenario.name}</h4>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                scenario.name === 'Target' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
              }`}>
                {scenario.name === 'Target' ? 'Recommended' : 'Alternative'}
              </span>
            </div>
            
            <div className="text-3xl font-bold text-slate-900 mb-6">
              {formatCurrency(scenario.totalPrice)}
            </div>

            <div className="space-y-3 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Wrap Rate</span>
                <span className="font-medium text-slate-900">
                  {((((1 + scenario.assumptions.fringe) * (1 + scenario.assumptions.overhead) * (1 + scenario.assumptions.ga)) - 1) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Fee</span>
                <span className="font-medium text-slate-900">{formatPercent(scenario.assumptions.fee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Escalation</span>
                <span className="font-medium text-slate-900">{formatPercent(scenario.assumptions.escalation)}</span>
              </div>
            </div>

            <button className="mt-6 w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-sm font-medium transition-colors">
              View Breakdown
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
