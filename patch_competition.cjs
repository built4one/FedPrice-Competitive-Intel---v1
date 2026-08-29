const fs = require('fs');
let code = fs.readFileSync('src/components/Workspace.tsx', 'utf8');

// The CompetitionView function needs to be rewritten to support the expanded competitor reconstruction.
const oldCompViewRegex = /function CompetitionView.*?<\/[a-z]+>; \}/s;
const newCompView = `
function CompetitionView({ analysis }: { analysis: OpportunityAnalysis }) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-[#10243e] p-6 text-white">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-300" />
          <h2 className="text-lg font-black">Incumbent Assessment: {analysis.incumbent.name || 'Unknown'}</h2>
        </div>
        <p className="mt-2 text-sm text-slate-300">{analysis.incumbent.status} · {analysis.incumbent.confidence}% confidence · {analysis.incumbent.transitionRisk} transition risk</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <List title="Demonstrated Strengths" values={analysis.incumbent.strengths} />
          <List title="Potential Vulnerabilities" values={analysis.incumbent.vulnerabilities} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-black text-slate-900">Competitor Reconstruction</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {analysis.competitors.length ? analysis.competitors.map((c) => (
            <article key={c.name} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wide text-blue-600">{c.role.replaceAll('_',' ')}</span>
                    <h3 className="mt-1 text-lg font-black text-slate-900">{c.name}</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{c.confidence}% Conf</span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{c.rationale}</p>
                
                <div className="mt-5 grid grid-cols-2 gap-4">
                  {c.techPlatform && (
                    <div>
                      <span className="block text-[10px] font-black uppercase text-slate-400">Tech Platform</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-700">{c.techPlatform}</span>
                    </div>
                  )}
                  {c.deliveryModel && (
                    <div>
                      <span className="block text-[10px] font-black uppercase text-slate-400">Delivery Model</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-700">{c.deliveryModel}</span>
                    </div>
                  )}
                  {c.laborShape && (
                    <div className="col-span-2">
                      <span className="block text-[10px] font-black uppercase text-slate-400">Labor Shape</span>
                      <span className="mt-1 block text-xs font-semibold text-slate-700">{c.laborShape}</span>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  {c.demonstratedCapabilities?.length > 0 && <List title="Capabilities" values={c.demonstratedCapabilities} />}
                  {c.costDrivers?.length > 0 && <List title="Cost Drivers" values={c.costDrivers} />}
                  {c.automationClaims?.length > 0 && <List title="Automation Claims" values={c.automationClaims} />}
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700">Pricing: {c.pricingPosture.replaceAll('_',' ')}</span>
                <span className={\`rounded px-2 py-1 text-[10px] font-bold \${c.evidenceType === 'EXTERNAL_SOURCE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}\`}>{c.evidenceType.replaceAll('_',' ')}</span>
              </div>
            </article>
          )) : <p className="text-sm text-slate-500">No competitor reconstructions available.</p>}
        </div>
      </section>
    </div>
  );
}
`;

code = code.replace(oldCompViewRegex, newCompView);
fs.writeFileSync('src/components/Workspace.tsx', code);
