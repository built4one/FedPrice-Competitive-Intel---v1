import React from 'react';
import { Database, ShieldCheck, User, Menu } from 'lucide-react';

interface HeaderProps {
  currentView: 'hero' | 'runs' | 'intake' | 'workspace';
  onNavigate: (view: 'hero' | 'runs' | 'intake') => void;
  activeRunTitle?: string;
}

export default function Header({ currentView, onNavigate, activeRunTitle }: HeaderProps) {
  return (
    <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <button 
            onClick={() => onNavigate('hero')}
            className="flex items-center gap-2.5 sm:gap-3 group text-left focus:outline-none shrink-0"
          >
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-xs tracking-wider shadow-xs group-hover:bg-blue-700 transition-colors">
              PTW
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] sm:text-xs font-bold tracking-widest text-slate-900 uppercase font-mono leading-tight">
                INTELLIGENCE SUITE
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono tracking-wider leading-tight">
                FED PRICE-TO-WIN LAB
              </span>
            </div>
          </button>

          {/* Breadcrumb if active in workspace */}
          {activeRunTitle && currentView === 'workspace' && (
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 font-mono pl-4 border-l border-slate-200 min-w-0">
              <span className="shrink-0">WORKSPACE</span>
              <span>/</span>
              <span className="text-slate-700 font-semibold truncate max-w-xs">{activeRunTitle}</span>
            </div>
          )}
        </div>

        {/* Center / Right Nav */}
        <div className="flex items-center gap-2 sm:gap-6">
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => onNavigate('hero')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-mono font-medium transition-colors whitespace-nowrap ${
                currentView === 'hero' 
                  ? 'bg-slate-100 text-slate-900 font-semibold' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              OVERVIEW
            </button>
            <button
              onClick={() => onNavigate('runs')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-mono font-medium transition-colors whitespace-nowrap ${
                currentView === 'runs' || currentView === 'workspace' || currentView === 'intake'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200/80 font-semibold' 
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              RUNS
            </button>
          </nav>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* User profile */}
          <div className="flex items-center gap-2 pl-1 sm:pl-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-900 text-white text-[11px] sm:text-xs font-mono font-semibold flex items-center justify-center border border-slate-700 shadow-2xs">
              NA
            </div>
            <div className="hidden md:flex flex-col text-left">
              <span className="text-xs font-medium text-slate-800 font-mono leading-tight">N. ALAMIN</span>
              <span className="text-[10px] text-emerald-600 font-mono font-medium flex items-center gap-1 leading-tight">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                CLEARANCE ACTIVE
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
