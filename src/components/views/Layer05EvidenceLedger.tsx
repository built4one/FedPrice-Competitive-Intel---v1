import React from 'react';
import { Opportunity, EvidenceItem } from '../../types';
import { FileText, CheckCircle2, ShieldCheck, Hash, ExternalLink } from 'lucide-react';

interface Layer05Props {
  opp: Opportunity;
}

export default function Layer05EvidenceLedger({ opp }: Layer05Props) {
  const evidence: EvidenceItem[] = opp.evidence || [];

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Layer 05: LLM Extracted Evidence Ledger
            </h2>
            <p className="text-xs text-slate-500 font-mono">
              VERIFIABLE SOURCE CITATIONS, EXTRACTED FACTS & AI CONFIDENCE
            </p>
          </div>
        </div>

        <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-3 py-1 rounded border border-emerald-200 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          CRYPTOGRAPHICALLY SEALED
        </span>
      </div>

      <div className="p-6 sm:p-8 space-y-6">
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] uppercase">
                <tr>
                  <th className="py-3 px-4 font-semibold">REF ID</th>
                  <th className="py-3 px-4 font-semibold">SOURCE CITATION</th>
                  <th className="py-3 px-4 font-semibold">EXTRACTED CONTRACT RULE / FACT</th>
                  <th className="py-3 px-4 font-semibold text-center">CONFIDENCE</th>
                  <th className="py-3 px-4 font-semibold text-right">HASH CHECKSUM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-sans text-xs">
                {evidence.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600 text-xs">
                      {item.id}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-900 text-[11px] max-w-xs">
                      {item.source}
                    </td>
                    <td className="py-3 px-4 text-slate-700 leading-relaxed font-sans text-xs max-w-md">
                      {item.extractedFact}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                        <CheckCircle2 className="w-3 h-3" />
                        {item.confidence}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-400 text-[11px]">
                      {item.checksum}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
