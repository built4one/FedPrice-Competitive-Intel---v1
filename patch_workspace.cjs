const fs = require('fs');
let code = fs.readFileSync('src/components/Workspace.tsx', 'utf8');

code = code.replace(
  /type Tab = 'decision-center' \| 'deal' \| 'competition' \| 'evidence';/,
  `type Tab = 'decision-center' | 'deal' | 'intelligence' | 'competition' | 'evidence' | 'validation';`
);

code = code.replace(
  /const tabs: \[Tab, string\]\[\] = \[/,
  `const tabs: [Tab, string][] = [\n  ['decision-center', 'Decision Center'],\n  ['deal', 'Deal facts'],\n  ['intelligence', 'Intelligence'],\n  ['competition', 'Competition'],\n  ['evidence', 'Evidence'],\n  ['validation', 'Validation']\n];\n// `
);

// We need to add the render for the new tabs in Workspace component
code = code.replace(
  /\{tab === 'evidence' && <EvidenceView evidence=\{analysis.evidence\} gaps=\{analysis.gaps\} \/>\}/,
  `{tab === 'evidence' && <EvidenceView evidence={analysis.evidence} gaps={analysis.gaps} />}\n      {tab === 'intelligence' && <IntelligenceView analysis={analysis} />}\n      {tab === 'validation' && <ValidationView analysis={analysis} />}`
);

// Add the IntelligenceView and ValidationView components at the end of the file
code += `
function IntelligenceView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-black">Affordability & Budget</h2>
        {analysis.affordability ? (
          <div className="mt-4 space-y-4">
            {analysis.affordability.estimatedCeiling && (
              <MetricSmall label="Estimated Ceiling" value={money(analysis.affordability.estimatedCeiling)} />
            )}
            <div>
              <h3 className="text-xs font-black uppercase text-slate-500">Budget Signals</h3>
              <ul className="mt-2 space-y-2">
                {analysis.affordability.budgetSignals.map((sig, i) => (
                  <li key={i} className="text-sm text-slate-600">• {sig}</li>
                ))}
              </ul>
            </div>
            {analysis.affordability.obligationsHistory && (
               <div className="mt-2 text-sm text-slate-600">
                 <strong>History:</strong> {analysis.affordability.obligationsHistory}
               </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No specific affordability signals detected.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-black">Pre-RFP Signals</h2>
        {analysis.preRfpSignals?.length ? (
          <div className="mt-4 space-y-3">
            {analysis.preRfpSignals.map((sig, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-4">
                <span className="text-[10px] font-black text-blue-600">{sig.type} • {sig.date}</span>
                <p className="mt-1 text-sm font-bold">{sig.summary}</p>
                <p className="mt-2 text-xs text-slate-500">{sig.impact}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No pre-RFP signals detected.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
        <h2 className="text-sm font-black">GAO & Protest History</h2>
        {analysis.gaoFindings?.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {analysis.gaoFindings.map((gao, i) => (
              <div key={i} className="rounded-xl bg-amber-50 p-4 border border-amber-100">
                <h3 className="text-sm font-bold text-amber-900">{gao.topic}</h3>
                <p className="mt-2 text-xs text-amber-800">{gao.implication}</p>
                {gao.sourceUrl && (
                  <a href={gao.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-amber-700 underline">Source</a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No relevant GAO history detected.</p>
        )}
      </section>
    </div>
  );
}

function ValidationView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-black">Retrospective Validation Harness</h2>
        <p className="mt-2 text-sm text-slate-600">Freeze prediction against actual award (Phase 7).</p>
        {analysis.validation ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
             <MetricSmall label="Predicted Target" value={money(analysis.validation.predictedTarget)} />
             <MetricSmall label="Actual Award" value={money(analysis.validation.actualAwardValue)} />
             <MetricSmall label="Validation Score" value={\`\${analysis.validation.score.total}/100\`} />
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No retrospective validation available yet. Waiting for post-award phase.
          </div>
        )}
      </section>
    </div>
  );
}
`;

fs.writeFileSync('src/components/Workspace.tsx', code);
