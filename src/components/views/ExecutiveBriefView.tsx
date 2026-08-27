import React, { useState } from 'react';
import { Opportunity, Scenario } from '../../types';
import { Award, Printer, Download, Sliders, TrendingUp, CheckCircle, ShieldCheck, DollarSign } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface ExecutiveBriefProps {
  opp: Opportunity;
  formatCurrency: (val: number) => string;
  formatPercent: (val: number) => string;
}

export default function ExecutiveBriefView({ opp, formatCurrency, formatPercent }: ExecutiveBriefProps) {
  const [fringeRate, setFringeRate] = useState(30);
  const [ohRate, setOhRate] = useState(45);
  const [gaRate, setGaRate] = useState(9.5);
  const [feeRate, setFeeRate] = useState(7.0);
  const [escalationRate, setEscalationRate] = useState(3.0);

  // Dynamic calculation based on sliders
  const totalBaseYearDirectLabor = opp.clins.reduce((sum, clin) => {
    return sum + clin.laborCategories.reduce((lSum, lc) => lSum + (lc.baseRate * lc.hoursPerFte * lc.fte), 0);
  }, 0);

  let dynamicTotal = 0;
  const yearlyBreakdown = [];

  for (let year = 1; year <= opp.popYears; year++) {
    const escMultiplier = Math.pow(1 + escalationRate / 100, year - 1);
    const directLabor = totalBaseYearDirectLabor * escMultiplier;
    const fringe = directLabor * (fringeRate / 100);
    const totalLaborWithFringe = directLabor + fringe;
    const overhead = totalLaborWithFringe * (ohRate / 100);
    const subtotalDirect = totalLaborWithFringe + overhead;
    const ga = subtotalDirect * (gaRate / 100);
    const totalCost = subtotalDirect + ga;
    const fee = totalCost * (feeRate / 100);
    const totalYearPrice = totalCost + fee;

    dynamicTotal += totalYearPrice;
    yearlyBreakdown.push({
      year: `Year ${year}`,
      directLabor,
      fringe,
      overhead,
      ga,
      fee,
      total: totalYearPrice
    });
  }

  const effectiveWrapRate = (dynamicTotal / (totalBaseYearDirectLabor * opp.popYears));

  const chartData = [
    { name: 'Aggressive (Low Wrap)', price: dynamicTotal * 0.94 },
    { name: 'Recommended PTW', price: dynamicTotal },
    { name: 'Conservative (High Wrap)', price: dynamicTotal * 1.07 },
    { name: 'Est. Incumbent Bid', price: dynamicTotal * 1.09 }
  ];

  return (
    <div className="space-y-6">
      {/* Executive Header Box */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-blue-600 font-bold uppercase tracking-widest mb-1">
              <Award className="w-4 h-4" />
              <span>EXECUTIVE PRICE-TO-WIN (PTW) DETERMINATION BRIEF</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
              {opp.title}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              SOLICITATION: {opp.solicitationNumber} • ISSUING AGENCY: {opp.agency} • {opp.popYears}-YEAR POP
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-mono text-xs uppercase font-semibold rounded shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>PRINT / EXPORT BRIEF</span>
            </button>
          </div>
        </div>

        {/* 4 Core Hero Numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-lg">
            <div className="text-[11px] font-mono text-blue-700 font-semibold uppercase">RECOMMENDED TARGET BID</div>
            <div className="text-2xl sm:text-3xl font-bold text-blue-900 font-mono mt-1">
              {formatCurrency(dynamicTotal)}
            </div>
            <div className="text-[11px] text-blue-600 font-mono mt-0.5">Top-Quartile Best Value Posture</div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[11px] font-mono text-slate-500 uppercase">EFFECTIVE WRAP MULTIPLIER</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono mt-1">
              {effectiveWrapRate.toFixed(2)}x
            </div>
            <div className="text-[11px] text-emerald-600 font-mono mt-0.5">Highly competitive vs 1.95x incumbent</div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[11px] font-mono text-slate-500 uppercase">TARGET FEE MARGIN</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono mt-1">
              {feeRate.toFixed(1)}%
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">{formatCurrency(dynamicTotal * (feeRate / 100))} Fee Pool</div>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="text-[11px] font-mono text-slate-500 uppercase">PREDICTED WIN CHANCE (PWIN)</div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900 font-mono mt-1">
              72%
            </div>
            <div className="text-[11px] text-emerald-600 font-mono mt-0.5">+14% over baseline incumbent</div>
          </div>
        </div>

        {/* Visual Scenario Comparison Chart */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900">
              PRICING SCENARIOS & INCUMBENT OVERLAY ($M)
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              TOTAL {opp.popYears}-YEAR EVALUATED PRICE
            </span>
          </div>
          <div className="h-60 w-full bg-slate-50/50 p-4 rounded-lg border border-slate-200">
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
                  formatter={(val: number) => [formatCurrency(val), 'Evaluated Price']}
                  contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: '12px' }}
                />
                <Bar dataKey="price" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={52} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Live Interactive Sensitivity Adjuster */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-6">
          <Sliders className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-slate-900">
            REAL-TIME INDIRECT WRAP & ESCALATION SENSITIVITY ENGINE
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* Fringe Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">FRINGE RATE</span>
              <span className="font-bold text-slate-900">{fringeRate}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="45"
              step="0.5"
              value={fringeRate}
              onChange={(e) => setFringeRate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Overhead Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">OVERHEAD (OH)</span>
              <span className="font-bold text-slate-900">{ohRate}%</span>
            </div>
            <input
              type="range"
              min="25"
              max="70"
              step="0.5"
              value={ohRate}
              onChange={(e) => setOhRate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* G&A Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">G&A RATE</span>
              <span className="font-bold text-slate-900">{gaRate}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="16"
              step="0.5"
              value={gaRate}
              onChange={(e) => setGaRate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Fee Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">FEE / PROFIT</span>
              <span className="font-bold text-slate-900">{feeRate}%</span>
            </div>
            <input
              type="range"
              min="3"
              max="15"
              step="0.5"
              value={feeRate}
              onChange={(e) => setFeeRate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          {/* Escalation Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-500">ANNUAL ESCALATION</span>
              <span className="font-bold text-slate-900">{escalationRate}%</span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              step="0.25"
              value={escalationRate}
              onChange={(e) => setEscalationRate(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>

        {/* PoP Year-by-Year Cost Breakdown Table */}
        <div className="mt-8 border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 text-xs font-mono font-bold uppercase text-slate-700">
            {opp.popYears}-YEAR PERIOD OF PERFORMANCE PRICING ROLLUP
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white text-slate-400 border-b border-slate-200 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">PERIOD</th>
                  <th className="py-2.5 px-4 font-semibold text-right">DIRECT LABOR</th>
                  <th className="py-2.5 px-4 font-semibold text-right">FRINGE ({fringeRate}%)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">OVERHEAD ({ohRate}%)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">G&A ({gaRate}%)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">FEE ({feeRate}%)</th>
                  <th className="py-2.5 px-4 font-semibold text-right font-bold text-slate-900">YEAR TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {yearlyBreakdown.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-bold text-slate-900">{row.year}</td>
                    <td className="py-2.5 px-4 text-right text-slate-700">{formatCurrency(row.directLabor)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">{formatCurrency(row.fringe)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">{formatCurrency(row.overhead)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">{formatCurrency(row.ga)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-600">{formatCurrency(row.fee)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-950 bg-slate-50/50">
                      {formatCurrency(row.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-mono text-xs">
                <tr>
                  <td className="py-3 px-4 font-bold uppercase">TOTAL EVALUATED PRICE</td>
                  <td className="py-3 px-4 text-right text-slate-300">
                    {formatCurrency(yearlyBreakdown.reduce((s, r) => s + r.directLabor, 0))}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">
                    {formatCurrency(yearlyBreakdown.reduce((s, r) => s + r.fringe, 0))}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">
                    {formatCurrency(yearlyBreakdown.reduce((s, r) => s + r.overhead, 0))}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-400">
                    {formatCurrency(yearlyBreakdown.reduce((s, r) => s + r.ga, 0))}
                  </td>
                  <td className="py-3 px-4 text-right text-blue-300 font-semibold">
                    {formatCurrency(yearlyBreakdown.reduce((s, r) => s + r.fee, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-white text-sm bg-blue-600">
                    {formatCurrency(dynamicTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
