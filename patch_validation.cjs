const fs = require('fs');
let code = fs.readFileSync('src/components/Workspace.tsx', 'utf8');

const validationRegex = /function ValidationView.*?\{.*?return \((.*?)\);\n\}/s;

const newValidationView = `
function ValidationView({ analysis, onUpdate }: { analysis: OpportunityAnalysis; onUpdate?: (a: OpportunityAnalysis) => void }) {
  const [actualAward, setActualAward] = useState(analysis.validation?.actualAwardValue?.toString() || '');
  const [actualAwardee, setActualAwardee] = useState(analysis.validation?.actualAwardee || '');
  const [notes, setNotes] = useState(analysis.validation?.retrospectiveNotes || '');

  const runValidation = () => {
    if (!onUpdate) return;
    const val = Number(actualAward);
    if (!val || val <= 0) return;
    
    // Very naive scoring for demonstration
    const target = analysis.marketPosition.target || 0;
    const diffPct = target > 0 ? Math.abs(val - target) / target : 1;
    let rangeScore = 0;
    if (diffPct < 0.05) rangeScore = 40;
    else if (diffPct < 0.10) rangeScore = 30;
    else if (diffPct < 0.20) rangeScore = 20;
    else rangeScore = 5;

    const validation: OpportunityAnalysis['validation'] = {
      predictedTarget: target,
      actualAwardValue: val,
      predictedPosture: analysis.marketPosition.posture,
      actualAwardee,
      retrospectiveNotes: notes,
      score: {
        range: rangeScore,
        posture: 20, // default placeholder
        structure: 15,
        reasoning: 15,
        evidence: 10,
        total: rangeScore + 60
      }
    };

    onUpdate({ ...analysis, validation });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black">Retrospective Validation Harness</h2>
            <p className="mt-1 text-xs text-slate-500">Record post-award actuals to calibrate the prediction model.</p>
          </div>
          {analysis.validation && <span className="rounded bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">FROZEN & SCORED</span>}
        </div>
        
        <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_.75fr]">
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50 p-5">
             <h3 className="text-xs font-black uppercase text-slate-500">Input Actuals</h3>
             <div>
               <label className="block text-[10px] font-black uppercase text-slate-400">Actual Award Value ($)</label>
               <input type="number" value={actualAward} onChange={e => setActualAward(e.target.value)} disabled={!!analysis.validation} className="mt-1.5 w-full rounded border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100" />
             </div>
             <div>
               <label className="block text-[10px] font-black uppercase text-slate-400">Winning Vendor (Optional)</label>
               <input type="text" value={actualAwardee} onChange={e => setActualAwardee(e.target.value)} disabled={!!analysis.validation} className="mt-1.5 w-full rounded border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100" />
             </div>
             <div>
               <label className="block text-[10px] font-black uppercase text-slate-400">Retrospective Notes</label>
               <textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={!!analysis.validation} rows={2} className="mt-1.5 w-full rounded border-slate-200 px-3 py-2 text-sm disabled:bg-slate-100" />
             </div>
             {!analysis.validation && (
               <button onClick={runValidation} className="mt-2 w-full rounded bg-[#10243e] py-2.5 text-xs font-black text-white hover:bg-slate-800">
                 LOCK & CALCULATE SCORE
               </button>
             )}
          </div>
          
          <div>
            <h3 className="text-xs font-black uppercase text-slate-500">Prediction Results</h3>
            {analysis.validation ? (
              <div className="mt-4 space-y-3">
                 <MetricSmall label="Predicted Target" value={money(analysis.validation.predictedTarget)} />
                 <MetricSmall label="Actual Award" value={money(analysis.validation.actualAwardValue)} />
                 <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <span className="text-[10px] font-black text-emerald-600">VALIDATION SCORE</span>
                    <strong className="mt-1 block text-3xl font-black text-emerald-900">{analysis.validation.score.total}<span className="text-lg text-emerald-700">/100</span></strong>
                    <div className="mt-3 flex gap-2 text-[10px] font-bold text-emerald-800">
                      <span>Range: {analysis.validation.score.range}/40</span>
                      <span>Posture: {analysis.validation.score.posture}/20</span>
                    </div>
                 </div>
              </div>
            ) : (
              <div className="mt-4 flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Submit actuals to reveal scoring comparison.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
`;

code = code.replace(validationRegex, newValidationView);

// We need to pass onUpdate to ValidationView in the main component.
code = code.replace(
  /\{tab === 'validation' && <ValidationView analysis=\{analysis\} \/>\}/,
  `{tab === 'validation' && <ValidationView analysis={analysis} onUpdate={onUpdate} />}`
);

fs.writeFileSync('src/components/Workspace.tsx', code);
