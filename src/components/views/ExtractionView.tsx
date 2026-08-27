import React from 'react';
import { Opportunity } from '../../types';
import { FileText, Users } from 'lucide-react';

export default function ExtractionView({ opp, formatCurrency }: { opp: Opportunity, formatCurrency: (v: number) => string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900">Extracted Requirements</h3>
          </div>
          <div className="space-y-4 text-sm text-slate-600">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="font-medium text-slate-900">Period of Performance</span>
              <span>{opp.popYears} Years (Base + {opp.popYears - 1} Option Years)</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="font-medium text-slate-900">Pricing Strategy</span>
              <span>CPFF / T&M</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="font-medium text-slate-900">Clearance Required</span>
              <span>Top Secret / SCI</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900">Total Staffing (FTE)</h3>
          </div>
          <div className="text-4xl font-bold text-slate-900 mb-2">
            {opp.clins.reduce((acc, clin) => acc + clin.laborCategories.reduce((a, lc) => a + lc.fte, 0), 0)}
          </div>
          <p className="text-sm text-slate-500">Full-Time Equivalents across all CLINs</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-900">Contract Line Item Numbers (CLINs)</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {opp.clins.map(clin => (
            <div key={clin.id} className="p-4 sm:p-6">
              <h4 className="font-medium text-slate-900 mb-4">{clin.name}</h4>
              <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-4 py-2 font-medium">Labor Category</th>
                      <th className="px-4 py-2 font-medium">FTE</th>
                      <th className="px-4 py-2 font-medium">Hours/FTE</th>
                      <th className="px-4 py-2 font-medium">Base Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clin.laborCategories.map(lc => (
                      <tr key={lc.id} className="bg-white">
                        <td className="px-4 py-3 font-medium text-slate-900">{lc.title}</td>
                        <td className="px-4 py-3 text-slate-600">{lc.fte}</td>
                        <td className="px-4 py-3 text-slate-600">{lc.hoursPerFte}</td>
                        <td className="px-4 py-3 text-slate-600">{formatCurrency(lc.baseRate)}/hr</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
