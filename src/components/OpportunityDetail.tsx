import React, { useState } from 'react';
import { Opportunity } from '../types';
import { ArrowLeft, Download, FileSpreadsheet } from 'lucide-react';
import ExtractionView from './views/ExtractionView';
import PricingView from './views/PricingView';
import AuditView from './views/AuditView';
import BriefingView from './views/BriefingView';

export default function OpportunityDetail({ opp, onBack }: { opp: Opportunity, onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'extraction' | 'pricing' | 'audit' | 'briefing'>('briefing');

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  const formatPercent = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(val);

  const chartData = opp.scenarios.map(s => ({
    name: s.name,
    'Direct Labor': s.breakdown.directLabor,
    'Fringe & Overhead': s.breakdown.fringeCost + s.breakdown.overheadCost,
    'G&A': s.breakdown.gaCost,
    'Fee': s.breakdown.feeAmount,
    total: s.totalPrice
  }));

  const colors = {
    'Direct Labor': '#3b82f6',
    'Fringe & Overhead': '#6366f1',
    'G&A': '#8b5cf6',
    'Fee': '#10b981'
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in duration-300">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 pt-4 sm:pt-6 flex-shrink-0 sticky top-0 z-10">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Opportunities
        </button>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-1">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">{opp.title}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                {opp.solicitationNumber}
              </span>
            </div>
            <p className="text-sm sm:text-base text-slate-500">{opp.agency} • {opp.popYears} Year PoP</p>
          </div>
          <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
            <button 
              onClick={() => window.location.href = `/api/opportunities/${opp.id}/export`}
              className="flex-1 sm:flex-none justify-center items-center flex gap-2 px-3 sm:px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm sm:text-base font-medium transition-colors shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="truncate">Export Model</span>
            </button>
            <button 
              onClick={() => setActiveTab('briefing')}
              className="flex-1 sm:flex-none justify-center items-center flex gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm sm:text-base font-medium transition-colors shadow-sm">
              <Download className="w-4 h-4 shrink-0" />
              <span className="truncate">Executive Brief</span>
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-4 sm:gap-6 mt-6 sm:mt-8 border-b border-slate-200 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <TabButton active={activeTab === 'briefing'} onClick={() => setActiveTab('briefing')}>
            Executive Brief
          </TabButton>
          <TabButton active={activeTab === 'extraction'} onClick={() => setActiveTab('extraction')}>
            Extracted Requirements
          </TabButton>
          <TabButton active={activeTab === 'pricing'} onClick={() => setActiveTab('pricing')}>
            Pricing Scenarios
          </TabButton>
          <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')}>
            Audit & Sensitivities
          </TabButton>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'briefing' && (
             <BriefingView opp={opp} formatCurrency={formatCurrency} formatPercent={formatPercent} />
          )}
          {activeTab === 'extraction' && (
             <ExtractionView opp={opp} formatCurrency={formatCurrency} />
          )}
          {activeTab === 'pricing' && (
             <PricingView opp={opp} chartData={chartData} colors={colors} formatCurrency={formatCurrency} formatPercent={formatPercent} />
          )}
          {activeTab === 'audit' && (
             <AuditView />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }: { active: boolean, children: React.ReactNode, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
        active 
          ? 'border-blue-600 text-blue-600' 
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
