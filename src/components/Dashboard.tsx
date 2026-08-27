import React, { useState, useRef, useEffect } from 'react';
import { Opportunity } from '../types';
import { Plus, Search, FileUp, Loader2 } from 'lucide-react';

export default function Dashboard({ 
  opportunities, 
  onSelect,
  onAdd,
  onRefresh
}: { 
  opportunities: Opportunity[], 
  onSelect: (id: string) => void,
  onAdd: (opp: Opportunity) => void,
  onRefresh: () => void
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStep('Analyzing Solicitation via MCP...');
    setUploadProgress(20);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadStep('Extracting Section L/M & CLINs (Agent 1)...');
      setUploadProgress(40);
      
      const uploadRes = await fetch('/api/upload-solicitation', {
        method: 'POST',
        body: formData,
      });
      
      const uploadContentType = uploadRes.headers.get("content-type");
      if (!uploadRes.ok || !uploadContentType?.includes("application/json")) {
        throw new Error('Upload failed or received invalid response from server.');
      }
      const { data } = await uploadRes.json();
      
      setUploadStep('Benchmarking Labor Categories (Agent 3)...');
      setUploadProgress(70);

      // Save to database
      setUploadStep('Generating Deterministic Scenarios...');
      setUploadProgress(90);

      const saveRes = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const saveContentType = saveRes.headers.get("content-type");
      if (!saveRes.ok || !saveContentType?.includes("application/json")) {
        throw new Error('Failed to save opportunity or received invalid response from server.');
      }
      const newOpp = await saveRes.json();
      
      setUploadProgress(100);
      setTimeout(() => {
        onAdd(newOpp);
        setIsUploading(false);
        setUploadProgress(0);
        onSelect(newOpp.id);
      }, 500);

    } catch (err) {
      console.error(err);
      alert('Failed to process solicitation');
      setIsUploading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Opportunities</h1>
          <p className="text-slate-500 mt-1">Manage and analyze your active price-to-win scenarios.</p>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,.docx,.doc,.txt"
          onChange={handleFileChange}
        />
        <button 
          onClick={handleUploadClick}
          disabled={isUploading}
          className="flex w-full sm:w-auto justify-center items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-sm disabled:opacity-70"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {isUploading ? 'Analyzing...' : 'New Solicitation'}
        </button>
      </div>

      {isUploading && (
        <div className="mb-8 p-6 bg-white border border-blue-100 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <FileUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Processing Solicitation Package</h3>
              <p className="text-sm text-slate-500">{uploadStep}</p>
            </div>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search opportunities..." 
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {opportunities.map(opp => (
            <div 
              key={opp.id} 
              onClick={() => onSelect(opp.id)}
              className="p-4 sm:p-6 hover:bg-slate-50 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors group"
            >
              <div>
                <div className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">{opp.title}</div>
                <div className="text-slate-500 text-xs sm:text-sm mt-1">{opp.solicitationNumber} • {opp.agency}</div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-8">
                <div className="text-left sm:text-right">
                  <div className="text-xs text-slate-500 sm:hidden mb-0.5">Target Price</div>
                  <div className="font-medium text-slate-900">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(opp.scenarios.find(s => s.name === 'Target')?.totalPrice || 0)}
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  opp.status === 'Analyzed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-800'
                }`}>
                  {opp.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
