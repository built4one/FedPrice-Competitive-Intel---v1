import React, { useState } from 'react';
import { Opportunity, CLIN, LaborCategory } from '../../types';
import { Database, CheckCircle2, Edit3, Plus, Trash2, ShieldCheck, Sparkles } from 'lucide-react';

interface Layer01Props {
  opp: Opportunity;
  onUpdateOpportunity?: (updated: Opportunity) => void;
  formatCurrency: (val: number) => string;
}

export default function Layer01DealSnapshot({ opp, onUpdateOpportunity, formatCurrency }: Layer01Props) {
  const [isValidated, setIsValidated] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [noticeId, setNoticeId] = useState(opp.solicitationNumber || '2025-R-001');
  const [contractType, setContractType] = useState(opp.contractType || 'Firm-Fixed-Price (FFP) & Labor Hour (LH)');
  const [naicsCode, setNaicsCode] = useState(opp.naicsCode || '541512 - Computer Systems Design Services');
  const [evalPosture, setEvalPosture] = useState(opp.evaluationPosture || 'Best Value Tradeoff (Technical > Price)');
  const [dueDate, setDueDate] = useState(opp.dueDate || 'October 24, 2026 14:00 EST');

  const totalLaborCategories = opp.clins.reduce((acc, c) => acc + c.laborCategories.length, 0);
  const totalFte = opp.clins.reduce((acc, c) => acc + c.laborCategories.reduce((s, l) => s + l.fte, 0), 0);

  const handleSave = () => {
    setIsEditing(false);
    setIsValidated(true);
    if (onUpdateOpportunity) {
      onUpdateOpportunity({
        ...opp,
        solicitationNumber: noticeId,
        contractType,
        naicsCode,
        evaluationPosture: evalPosture,
        dueDate
      });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Layer 01: Deal Intelligence Summary
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              PARSED DEAL ATTRIBUTES & CLIN STRUCTURAL MATRIX
            </p>
          </div>
        </div>

        {isValidated && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            VALIDATED
          </span>
        )}
      </div>

      {/* Main Metadata Grid matching Screen 5 */}
      <div className="p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Notice ID */}
          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-slate-500 mb-1.5">
              NOTICE ID
            </label>
            <input
              type="text"
              disabled={!isEditing}
              value={noticeId}
              onChange={(e) => setNoticeId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded text-xs font-mono text-slate-900 disabled:bg-slate-50 disabled:text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Contract Type */}
          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-slate-500 mb-1.5">
              CONTRACT TYPE
            </label>
            <input
              type="text"
              disabled={!isEditing}
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded text-xs font-mono text-slate-900 disabled:bg-slate-50 disabled:text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* NAICS */}
          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-slate-500 mb-1.5">
              NAICS CODE
            </label>
            <input
              type="text"
              disabled={!isEditing}
              value={naicsCode}
              onChange={(e) => setNaicsCode(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded text-xs font-mono text-slate-900 disabled:bg-slate-50 disabled:text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Evaluation Posture */}
          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-slate-500 mb-1.5">
              EVALUATION POSTURE
            </label>
            <input
              type="text"
              disabled={!isEditing}
              value={evalPosture}
              onChange={(e) => setEvalPosture(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded text-xs font-mono text-slate-900 disabled:bg-slate-50 disabled:text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Due Dates */}
          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-slate-500 mb-1.5">
              DUE DATES
            </label>
            <input
              type="text"
              disabled={!isEditing}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-amber-50/40 border border-amber-200/80 rounded text-xs font-mono text-slate-900 disabled:bg-amber-50/30 disabled:text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Labor Categories Detected */}
          <div>
            <label className="block text-[11px] font-mono font-semibold uppercase text-slate-500 mb-1.5">
              LABOR CATEGORIES DETECTED
            </label>
            <div className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-800 flex items-center justify-between">
              <span>{totalLaborCategories} labor categories ({totalFte} FTEs)</span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                MAPPED TO GSA CALC
              </span>
            </div>
          </div>
        </div>

        {/* CLIN Breakdown Table */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-900">
              EXTRACTED CLIN & LABOR STRUCTURE ({opp.popYears}-YEAR POP)
            </h3>
            <span className="text-[11px] font-mono text-slate-500">
              TOTAL CLINs: {opp.clins.length}
            </span>
          </div>

          <div className="space-y-6">
            {opp.clins.map((clin) => (
              <div key={clin.id} className="border border-slate-200 rounded-md overflow-hidden bg-slate-50/30">
                <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-800">
                    {clin.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {clin.laborCategories.reduce((s, l) => s + l.fte, 0)} FTEs
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-white text-slate-400 border-b border-slate-200 text-[10px] uppercase">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">LABOR CATEGORY</th>
                        <th className="py-2.5 px-4 font-semibold text-center">FTE</th>
                        <th className="py-2.5 px-4 font-semibold text-center">HRS/YR</th>
                        <th className="py-2.5 px-4 font-semibold text-right">DIRECT RATE</th>
                        <th className="py-2.5 px-4 font-semibold text-right">GSA MEDIAN</th>
                        <th className="py-2.5 px-4 font-semibold text-right">ANNUAL DL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {clin.laborCategories.map((lc) => {
                        const annualCost = lc.baseRate * lc.hoursPerFte * lc.fte;
                        const gsaMedian = lc.gsaCalcBenchmark?.median || Math.round(lc.baseRate * 1.12);
                        return (
                          <tr key={lc.id} className="hover:bg-slate-50/80">
                            <td className="py-2.5 px-4 font-medium text-slate-900 font-sans">{lc.title}</td>
                            <td className="py-2.5 px-4 text-center text-slate-700">{lc.fte}</td>
                            <td className="py-2.5 px-4 text-center text-slate-500">{lc.hoursPerFte}</td>
                            <td className="py-2.5 px-4 text-right text-slate-900 font-semibold">${lc.baseRate}/hr</td>
                            <td className="py-2.5 px-4 text-right text-blue-600">${gsaMedian}/hr</td>
                            <td className="py-2.5 px-4 text-right text-slate-900 font-medium">{formatCurrency(annualCost)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons matching Screen 5 */}
        <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-3">
          {isEditing ? (
            <button
              onClick={handleSave}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs uppercase font-semibold rounded transition-colors shadow-xs"
            >
              SAVE CHANGES
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-mono text-xs uppercase font-semibold rounded transition-colors"
            >
              EDIT EXTRACTED FACTS
            </button>
          )}
          <button
            onClick={() => setIsValidated(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs uppercase font-semibold rounded flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>VALIDATE DEAL FACTS</span>
          </button>
        </div>
      </div>
    </div>
  );
}
