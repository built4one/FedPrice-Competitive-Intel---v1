import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import LandingHero from './components/LandingHero';
import OpportunityRuns from './components/OpportunityRuns';
import IntakeNode from './components/IntakeNode';
import Workspace from './components/Workspace';
import { Opportunity } from './types';

export default function App() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [currentView, setCurrentView] = useState<'hero' | 'runs' | 'intake' | 'workspace'>('hero');
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);

  const fetchOpportunities = async () => {
    try {
      const res = await fetch('/api/opportunities');
      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setOpportunities(data);
          }
        }
      }
    } catch (e) {
      console.error("Failed to load opportunities:", e);
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const handleSelectRun = (id: string) => {
    setSelectedOppId(id);
    setCurrentView('workspace');
  };

  const handleCreateRunSuccess = (newOpp: Opportunity) => {
    setOpportunities(prev => [newOpp, ...prev.filter(o => o.id !== newOpp.id)]);
    setSelectedOppId(newOpp.id);
    setCurrentView('workspace');
  };

  const handleUpdateOpportunity = (updated: Opportunity) => {
    setOpportunities(prev => prev.map(o => o.id === updated.id ? updated : o));
  };

  const selectedOpp = opportunities.find(o => o.id === selectedOppId) || opportunities[0];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatPercent = (val: number) => {
    return `${(val * 100).toFixed(1)}%`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col selection:bg-blue-100">
      {/* Global Brand Header matching screenshots */}
      <Header
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'runs' && opportunities.length === 0) {
            fetchOpportunities();
          }
          setCurrentView(view);
        }}
        activeRunTitle={selectedOpp?.solicitationNumber || selectedOpp?.title}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {currentView === 'hero' && (
          <LandingHero onOpenWorkspace={() => setCurrentView('runs')} />
        )}

        {currentView === 'runs' && (
          <OpportunityRuns
            opportunities={opportunities}
            onSelectRun={handleSelectRun}
            onNewRun={() => setCurrentView('intake')}
            onRefresh={fetchOpportunities}
          />
        )}

        {currentView === 'intake' && (
          <IntakeNode
            onBack={() => setCurrentView('runs')}
            onSuccess={handleCreateRunSuccess}
          />
        )}

        {currentView === 'workspace' && selectedOpp && (
          <Workspace
            opp={selectedOpp}
            onBack={() => setCurrentView('runs')}
            onUpdateOpportunity={handleUpdateOpportunity}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
          />
        )}
      </main>
    </div>
  );
}
