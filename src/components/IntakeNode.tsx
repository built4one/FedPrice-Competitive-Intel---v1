import React, { useState, useRef } from 'react';
import { Opportunity } from '../types';
import { ArrowLeft, UploadCloud, FileText, Loader2, CheckCircle2, ShieldCheck, Sparkles, Terminal, Search, Database, AlertCircle } from 'lucide-react';

interface IntakeNodeProps {
  onBack: () => void;
  onSuccess: (opp: Opportunity) => void;
}

export default function IntakeNode({ onBack, onSuccess }: IntakeNodeProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [samNoticeId, setSamNoticeId] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processingSteps = [
    'PARSING SOLICITATION MATERIALS...',
    'EXTRACTING CORE DEAL FACTS...',
    'BENCHMARKING LABOR CATEGORIES TO GSA CALC...',
    'SYNTHESIZING COMPETITIVE MATRIX...',
    'INITIALIZING PTW WORKSPACE...'
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setActiveStep(0);
    setErrorMsg(null);
    setLogLines(['Uploading document to server...', 'Extracting core facts using Gemini AI...']);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const uploadRes = await fetch('/api/upload-solicitation', {
        method: 'POST',
        body: formData,
      });

      const contentType = uploadRes.headers.get("content-type");
      if (!uploadRes.ok || !contentType?.includes("application/json")) {
        throw new Error("Failed to process document. Please ensure it is a valid text or PDF file.");
      }

      const json = await uploadRes.json();
      const extractedData = json.data;

      setLogLines(prev => [...prev, 'Extraction complete. Saving to PostgreSQL database...']);

      const saveRes = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...extractedData,
          status: 'Ready for Review'
        })
      });

      if (!saveRes.ok) {
         throw new Error("Failed to save opportunity to database.");
      }

      const savedOpp: Opportunity = await saveRes.json();
      setIsProcessing(false);
      onSuccess(savedOpp);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred during extraction.");
      setIsProcessing(false);
    }
  };

  const handleSampleSelect = (sampleOpp: Opportunity) => {
    setIsProcessing(true);
    setActiveStep(0);
    setLogLines(['0x43DAF ... [OK]', '0x8DE0 ... [OK]', '0x375A ... [OK]']);

    let step = 0;
    const interval = setInterval(() => {
      step++;
      setActiveStep(step);
      if (step === 1) setLogLines(p => [...p, `PARSING SECTIONS L & M FOR ${sampleOpp.solicitationNumber}`, 'CLIN MATRIX INITIALIZED']);
      if (step === 2) setLogLines(p => [...p, 'GSA CALC MEDIAN BENCHMARKS LOADED', 'WRAPS CALCULATED']);
      if (step === 3) setLogLines(p => [...p, 'COMPETITOR PRICE BANDS SYNTHESIZED', 'INCUMBENT TURNOVER RISK 22%']);
      if (step === 4) {
        clearInterval(interval);
        setTimeout(() => {
          setIsProcessing(false);
          onSuccess(sampleOpp);
        }, 600);
      }
    }, 700);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Top Breadcrumb Navigation matching Screen 3 */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 text-xs font-mono">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-950 uppercase tracking-widest transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK TO DASHBOARD</span>
        </button>

        <div className="flex items-center gap-2 text-slate-500 uppercase tracking-widest">
          <Database className="w-3.5 h-3.5 text-blue-600" />
          <span>INTAKE NODE</span>
        </div>
      </div>

      {!isProcessing ? (
        <div className="pt-12 sm:pt-16 text-center">
          {/* Main Title & Description */}
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mb-3">
            Create Opportunity Run
          </h1>
          <p className="text-slate-500 text-sm max-w-lg mx-auto mb-10">
            Upload solicitation materials to initialize a new pricing intelligence workspace.
          </p>

          {/* Large Dashed Dropzone matching Screen 3 */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 sm:p-14 text-center cursor-pointer transition-all bg-white ${
              dragActive 
                ? 'border-blue-500 bg-blue-50/50 shadow-md' 
                : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.txt"
              onChange={handleFileInput}
            />

            {/* Circular Cloud Icon */}
            <div className="w-14 h-14 mx-auto rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600 mb-5 shadow-2xs">
              <UploadCloud className="w-6 h-6 text-slate-700" />
            </div>

            <h3 className="text-base font-bold text-slate-900 tracking-wider uppercase font-mono mb-2">
              SECURE FILE DROP
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Drop a SAM.gov Solicitation, Draft RFP, PWS, or SOW document here.
            </p>

          </div>
        </div>
      ) : (
        /* Real-time Processing Agent Node Visualizer matching Screen 4 */
        <div className="pt-16 max-w-2xl mx-auto">
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
            {/* Header with spinner and telemetry label */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="text-xs font-mono font-bold tracking-widest text-blue-600 uppercase">
                  LAYER 01 EXTRACTION ACTIVE
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-400">
                AI MCP PIPELINE • GEMINI 2.5
              </div>
            </div>

            {/* Step list & Terminal Stream */}
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                {processingSteps.map((stepText, idx) => {
                  const isDone = activeStep > idx;
                  const isCurrent = activeStep === idx;
                  return (
                    <div key={idx} className="flex items-start gap-3.5">
                      <div className="mt-0.5">
                        {isDone ? (
                          <div className="w-3.5 h-3.5 rounded-full bg-blue-600 flex items-center justify-center text-white">
                            <span className="text-[9px] font-bold">✓</span>
                          </div>
                        ) : isCurrent ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-600 bg-blue-500 animate-pulse" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-300 bg-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className={`text-xs font-mono tracking-wider uppercase font-semibold ${
                          isDone || isCurrent ? 'text-slate-900' : 'text-slate-400'
                        }`}>
                          {stepText}
                        </div>

                        {/* Hex stream & terminal output for step 0 */}
                        {idx === 0 && (
                          <div className="mt-2 bg-slate-950 text-slate-300 font-mono text-[11px] p-3 rounded-md space-y-1 shadow-inner">
                            {logLines.map((line, lIdx) => (
                              <div key={lIdx} className="flex items-center justify-between text-slate-400">
                                <span>{line}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
