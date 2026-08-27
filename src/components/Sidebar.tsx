import React from 'react';
import { LayoutDashboard, FileText, Settings, Database, Briefcase } from 'lucide-react';

export default function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full border-r border-slate-800">
      <div className="p-6 flex items-center gap-3 text-white">
        <Briefcase className="w-6 h-6 text-blue-400" />
        <span className="text-xl font-semibold tracking-tight">PTW Studio</span>
      </div>
      
      <nav className="flex-1 px-4 space-y-2 mt-4">
        <button 
          onClick={onNavigate}
          className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md bg-blue-500/10 text-blue-400"
        >
          <LayoutDashboard className="w-4 h-4" />
          Opportunities
        </button>
        <button className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <FileText className="w-4 h-4" />
          Solicitations
        </button>
        <button className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <Database className="w-4 h-4" />
          Pricing Rates
        </button>
      </nav>
      
      <div className="p-4 border-t border-slate-800">
        <button className="flex items-center gap-3 w-full px-3 py-2 text-sm font-medium rounded-md hover:bg-slate-800 hover:text-white transition-colors">
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
