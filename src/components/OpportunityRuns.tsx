import React, { useState } from 'react';
import { Opportunity } from '../types';
import { Plus, Search, ArrowRight, Clock, Trash2, FileSpreadsheet, Sparkles, Filter, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface OpportunityRunsProps {
  opportunities: Opportunity[];
  onSelectRun: (id: string) => void;
  onNewRun: () => void;
  onRefresh: () => void;
  onDeleteRun?: (id: string, e: React.MouseEvent) => void;
}

export default function OpportunityRuns({
  opportunities,
  onSelectRun,
  onNewRun,
  onRefresh,
  onDeleteRun
}: OpportunityRunsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Ready' | 'Processing' | 'Draft'>('All');

  const filteredRuns = opportunities.filter(opp => {
    const matchesSearch = 
      opp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.agency.toLowerCase().includes(searchTerm.toLowerCase()) ||
      opp.solicitationNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'All') return matchesSearch;
    if (statusFilter === 'Ready') return matchesSearch && (opp.status === 'Ready for Review' || opp.status === 'Analyzed' || opp.status === 'Approved');
    if (statusFilter === 'Processing') return matchesSearch && opp.status === 'Processing';
    if (statusFilter === 'Draft') return matchesSearch && opp.status === 'Draft';
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Ready for Review':
      case 'Analyzed':
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            READY FOR REVIEW
          </span>
        );
      case 'Processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-medium bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            PROCESSING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200 uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            NEEDS INPUT
          </span>
        );
    }
  };

  const getConfidenceText = (opp: Opportunity) => {
    if (opp.status === 'Processing') return <span className="text-amber-600 font-mono text-xs">Calculating</span>;
    if (opp.confidence) {
      return (
        <span className={`font-mono text-xs ${
          opp.confidence === 'High' ? 'text-slate-800 font-medium' : opp.confidence === 'Medium' ? 'text-slate-600' : 'text-slate-400'
        }`}>
          {opp.confidence}
        </span>
      );
    }
    return <span className="text-slate-700 font-mono text-xs">High</span>;
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} mins ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hrs ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays} days ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Title & Top Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-blue-50 border border-blue-200 text-blue-600 rounded flex items-center justify-center">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M9 21V9" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Opportunity Runs</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 font-normal">
            Manage your active bid intelligence workspaces and pricing scenarios.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onRefresh}
            title="Refresh runs"
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-md transition-colors shadow-xs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={onNewRun}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-semibold uppercase tracking-wider rounded-md shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>+ NEW RUN</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 my-6">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search solicitations, agencies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-md text-xs font-mono placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md border border-slate-200 self-start sm:self-auto">
          <button
            onClick={() => setStatusFilter('All')}
            className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
              statusFilter === 'All' ? 'bg-white text-slate-900 shadow-xs font-medium' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            ALL ({opportunities.length})
          </button>
          <button
            onClick={() => setStatusFilter('Ready')}
            className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
              statusFilter === 'Ready' ? 'bg-white text-slate-900 shadow-xs font-medium' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            READY
          </button>
          <button
            onClick={() => setStatusFilter('Processing')}
            className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
              statusFilter === 'Processing' ? 'bg-white text-slate-900 shadow-xs font-medium' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            PROCESSING
          </button>
        </div>
      </div>

      {/* Main Ledger Table (Desktop) & Cards (Mobile) */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden">
        {/* Mobile Cards View (< 640px) */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {filteredRuns.length === 0 ? (
            <div className="py-12 px-4 text-center text-slate-500">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mx-auto mb-3">
                <Search className="w-5 h-5" />
              </div>
              <p className="font-medium text-slate-700 text-sm">No opportunity runs found</p>
              <p className="text-xs text-slate-400 mt-1 mb-4">Upload a solicitation or start a new run.</p>
              <button
                onClick={onNewRun}
                className="w-full py-2.5 bg-blue-600 text-white font-mono text-xs rounded uppercase tracking-wider font-semibold"
              >
                + Initialize New Run
              </button>
            </div>
          ) : (
            filteredRuns.map((opp) => (
              <div
                key={opp.id}
                onClick={() => onSelectRun(opp.id)}
                className="p-4 hover:bg-slate-50 active:bg-slate-100 cursor-pointer transition-colors space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                      {opp.agency}
                    </span>
                    <h3 className="font-bold text-slate-900 text-sm truncate mt-0.5">
                      {opp.solicitationNumber || opp.title}
                    </h3>
                  </div>
                  <div className="shrink-0">
                    {getStatusBadge(opp.status)}
                  </div>
                </div>

                {opp.title !== opp.solicitationNumber && (
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {opp.title}
                  </p>
                )}

                <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1 border-t border-slate-50">
                  <div className="flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3" />
                    <span>{formatTimeAgo(opp.lastUpdated)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-600 font-semibold text-xs">
                    <span>Open Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table View (>= 640px) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-mono uppercase tracking-wider text-slate-500">
                <th className="py-3 px-6 font-semibold">SOLICITATION</th>
                <th className="py-3 px-6 font-semibold">AGENCY</th>
                <th className="py-3 px-6 font-semibold">STATUS</th>
                <th className="py-3 px-6 font-semibold">CONFIDENCE</th>
                <th className="py-3 px-6 font-semibold text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-slate-500">
                    <div className="max-w-sm mx-auto flex flex-col items-center">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
                        <Search className="w-5 h-5" />
                      </div>
                      <p className="font-medium text-slate-700 text-sm">No opportunity runs found</p>
                      <p className="text-xs text-slate-400 mt-1 mb-4">Upload a solicitation document or create your first workspace run.</p>
                      <button
                        onClick={onNewRun}
                        className="px-4 py-2 bg-blue-600 text-white font-mono text-xs rounded uppercase tracking-wider"
                      >
                        + Initialize New Run
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRuns.map((opp) => (
                  <tr
                    key={opp.id}
                    onClick={() => onSelectRun(opp.id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    {/* Solicitation Column */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {opp.solicitationNumber || opp.title}
                      </div>
                      <div className="text-xs text-slate-500 font-normal mt-0.5 truncate max-w-md">
                        {opp.title !== opp.solicitationNumber ? opp.title : ''}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono mt-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimeAgo(opp.lastUpdated)}</span>
                      </div>
                    </td>

                    {/* Agency Column */}
                    <td className="py-4 px-6 text-slate-600 font-normal text-sm max-w-xs truncate">
                      {opp.agency}
                    </td>

                    {/* Status Column */}
                    <td className="py-4 px-6 whitespace-nowrap">
                      {getStatusBadge(opp.status)}
                    </td>

                    {/* Confidence Column */}
                    <td className="py-4 px-6 whitespace-nowrap">
                      {getConfidenceText(opp)}
                    </td>

                    {/* Action Column */}
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <span className="p-1.5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all">
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Micro Status Summary Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4 text-xs font-mono text-slate-400">
        <div>
          SHOWING {filteredRuns.length} OF {opportunities.length} ACTIVE WORKSPACES
        </div>
        <div className="flex items-center gap-4">
          <span>POSTGRESQL CLOUD SQL • CONNECTED</span>
        </div>
      </div>
    </div>
  );
}
