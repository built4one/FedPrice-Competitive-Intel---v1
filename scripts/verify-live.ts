// Opt-in preview build check. Uses the deployment's server credentials in place;
// never exports credentials, accesses saved user runs, or changes authentication.
if (process.env.FMP_VERIFY_SOLICITATION === 'WEB_RESEARCH') {
  const {OpenAIIntelligence}=await import('../src/server/openaiIntelligence');
  const result=await new OpenAIIntelligence(undefined,undefined,fetch,90_000).research<{summary:string}>('Using official GSA public documentation, explain in one sentence what CALC+ labor ceiling rates represent. Return JSON with one summary string. Do not research a specific solicitation or call the SAM API.');
  if (!result.analysis.summary || !result.sources.length) throw new Error('Live web research did not return a summary with sources.');
  console.log('FMP_LIVE_CHECK',JSON.stringify({stage:'web-research-passed',sources:result.sources.map(s=>s.url),summary:result.analysis.summary}));
} else if (process.env.FMP_VERIFY_SOLICITATION) {
  const reference = process.env.FMP_VERIFY_SOLICITATION;
  const { resolveSamOpportunityPackage, lookupSamOpportunity } = await import('../src/adapters/sam');
  const { analyzeFiles, normalizeAnalysisFiles, samMetadataFile } = await import('../server');
  const { synthesizePtwStrategy } = await import('../src/server/ptwSynthesis');
  const { createExecutivePdf } = await import('../src/exports/executivePdf');
  const { assessmentIssues } = await import('../src/domain/analysisQuality');
  const log = (stage: string, result: unknown) => console.log('FMP_LIVE_CHECK', JSON.stringify({stage,result}));
  log('start', {reference});
  const pack = await resolveSamOpportunityPackage(reference);
  const urlMatch = await lookupSamOpportunity(pack.opportunity.uiUrl!);
  if (urlMatch.solicitationNumber !== pack.opportunity.solicitationNumber) throw new Error('SAM URL and number resolved to different solicitations.');
  log('url-and-number', {sameOpportunity:true,number:urlMatch.solicitationNumber});
  log('sam-package', {number:pack.opportunity.solicitationNumber,files:pack.files.map(f=>f.originalname)});
  if (!pack.files.some(f => /\.pdf$/i.test(f.originalname))) throw new Error('Live check: no solicitation PDF was retrieved.');
  const files = await normalizeAnalysisFiles([samMetadataFile(pack.opportunity), ...pack.files]);
  log('normalized-files', files.map(f=>({name:f.originalname,bytes:f.size,type:f.mimetype})));
  const analysis = await analyzeFiles(files);
  log('analysis', {method:analysis.marketPosition.estimationMethod,range:[analysis.marketPosition.aggressive,analysis.marketPosition.expected,analysis.marketPosition.conservative],
    staffingComplete:analysis.deal.laborModelComplete,staffingSource:analysis.deal.laborModelSource,months:analysis.deal.performanceMonths,
    laborRoles:analysis.deal.laborSignals.length,researchStatus:analysis.meta.researchStatus, connectors:analysis.meta.connectors?.map(c=>({name:c.name,status:c.status,records:c.recordsFound})),warnings:analysis.meta.warnings});
  analysis.deal.laborSignals.forEach(s=>log('labor-role',{title:s.title,quantity:s.quantity,clearance:s.clearance,periods:s.periods}));
  analysis.gaps.forEach(g=>log('gap',g));
  analysis.evidence.filter(e=>e.id.startsWith('GSA-')).forEach(e=>log('rate-match',{id:e.id,claim:e.claim,numeric:e.numeric}));
  analysis.ptwStrategy = await synthesizePtwStrategy(analysis);
  log('strategy', analysis.ptwStrategy.status === 'DRAFT' ? {status:'DRAFT',options:analysis.ptwStrategy.strategy.options.map(o=>o.name),selected:analysis.ptwStrategy.strategy.recommendation.selectedOptionId} : analysis.ptwStrategy);
  const pdf = await createExecutivePdf(analysis);
  log('exports', {pdfBytes:pdf.length,assessmentIssues:assessmentIssues(analysis).length});
  if (analysis.ptwStrategy.status !== 'DRAFT') throw new Error('Live check: strategy did not validate.');
  if (analysis.meta.researchStatus !== 'GROUNDED') throw new Error('Live check: public web research did not return grounded sources.');
  if (!analysis.marketPosition.expected && !analysis.gaps.some(g=>g.priority==='HIGH')) throw new Error('Live check: missing numeric basis was not explained by actionable gaps.');
  log('passed', {number:analysis.deal.solicitationNumber,engine:analysis.marketPosition.formulaVersion});
}
