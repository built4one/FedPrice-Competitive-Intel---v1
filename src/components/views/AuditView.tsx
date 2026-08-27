import React from 'react';
import { Activity, ShieldCheck, HelpCircle } from 'lucide-react';

export default function AuditView() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-slate-900">Price Sensitivities</h3>
          </div>
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-700">Fringe Rate (+/- 2%)</span>
                <span className="text-slate-500">High Impact</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-purple-600 h-2 rounded-full" style={{ width: '85%' }}></div>
              </div>
              <p className="text-xs text-slate-500">Moves total price by ~3.4% ($1.2M)</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-700">Fee (+/- 1%)</span>
                <span className="text-slate-500">Medium Impact</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{ width: '45%' }}></div>
              </div>
              <p className="text-xs text-slate-500">Moves total price by ~1.0% ($350k)</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-700">Escalation (+/- 1%)</span>
                <span className="text-slate-500">Medium Impact</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-purple-400 h-2 rounded-full" style={{ width: '40%' }}></div>
              </div>
              <p className="text-xs text-slate-500">Moves total price by ~0.8% ($280k)</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-lg font-semibold text-slate-900">Governance & Audit Log</h3>
          </div>
          <div className="space-y-6">
            <div className="relative pl-6 border-l-2 border-slate-200">
              <div className="absolute w-3 h-3 bg-emerald-500 rounded-full -left-[7px] top-1 border-2 border-white"></div>
              <p className="text-sm font-medium text-slate-900">Scenarios Generated</p>
              <p className="text-xs text-slate-500 mt-1">System • Today, 2:45 PM</p>
              <p className="text-sm text-slate-600 mt-2 bg-slate-50 p-2 rounded border border-slate-100">
                Generated Aggressive, Target, and Conservative scenarios based on Version 4.1 of Pricing Engine.
              </p>
            </div>
            <div className="relative pl-6 border-l-2 border-slate-200">
              <div className="absolute w-3 h-3 bg-blue-500 rounded-full -left-[7px] top-1 border-2 border-white"></div>
              <p className="text-sm font-medium text-slate-900">Labor Categories Benchmarked</p>
              <p className="text-xs text-slate-500 mt-1">MCP Tool: benchmark_labor • Today, 2:44 PM</p>
              <p className="text-sm text-slate-600 mt-2">
                Normalized 6 labor categories against internal historicals and GSA schedules.
              </p>
            </div>
            <div className="relative pl-6 border-l-2 border-transparent">
              <div className="absolute w-3 h-3 bg-slate-400 rounded-full -left-[7px] top-1 border-2 border-white"></div>
              <p className="text-sm font-medium text-slate-900">Solicitation Uploaded</p>
              <p className="text-xs text-slate-500 mt-1">Jane Doe • Today, 2:42 PM</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex items-start gap-4">
        <HelpCircle className="w-6 h-6 text-blue-600 flex-shrink-0" />
        <div>
          <h4 className="font-semibold text-blue-900 mb-1">Agent Recommendation</h4>
          <p className="text-sm text-blue-800 leading-relaxed">
            The Target scenario ($43.5M) aligns with historical incumbent bids while preserving a 7% fee margin. 
            Consider applying the Aggressive overhead wrap if the competitor analysis confirms Acme Corp is bidding. 
            Labor category 'Senior Cloud Architect' is currently priced at the 75th percentile and is the primary cost driver.
          </p>
        </div>
      </div>
    </div>
  );
}
