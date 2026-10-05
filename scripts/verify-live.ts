// Opt-in preview build check. Uses the deployment's server credentials in place;
// never exports credentials, accesses saved user runs, or changes authentication.
if (process.env.FMP_VERIFY_SOLICITATION) {
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
  log('sam-package', {number:pack.opportunity.solicitationNumber,files:pack.files.map(f=>f.originalname),documents:pack.adapterResult.samDocuments});
  if (!pack.files.some(f => /\.pdf$/i.test(f.originalname))) throw new Error('Live check: no solicitation PDF was retrieved.');
  const files = await normalizeAnalysisFiles([samMetadataFile(pack.opportunity), ...pack.files]);
  const analysis = await analyzeFiles(files);
  log('analysis', {method:analysis.marketPosition.estimationMethod,range:[analysis.marketPosition.aggressive,analysis.marketPosition.expected,analysis.marketPosition.conservative],
    staffingComplete:analysis.deal.laborModelComplete,staffingSource:analysis.deal.laborModelSource,months:analysis.deal.performanceMonths,
    labor:analysis.deal.laborSignals.map(s=>({title:s.title,quantity:s.quantity,clearance:s.clearance,periods:s.periods})),
    connectors:analysis.meta.connectors,warnings:analysis.meta.warnings,gaps:analysis.gaps,
    rateMatches:analysis.evidence.filter(e=>e.id.startsWith('GSA-')).map(e=>({id:e.id,claim:e.claim,numeric:e.numeric}))});
  analysis.ptwStrategy = await synthesizePtwStrategy(analysis);
  log('strategy', analysis.ptwStrategy.status === 'DRAFT' ? {status:'DRAFT',options:analysis.ptwStrategy.strategy.options.map(o=>o.name),selected:analysis.ptwStrategy.strategy.recommendation.selectedOptionId} : analysis.ptwStrategy);
  const pdf = await createExecutivePdf(analysis);
  log('exports', {pdfBytes:pdf.length,assessmentIssues:assessmentIssues(analysis).length});
  if (analysis.ptwStrategy.status !== 'DRAFT') throw new Error('Live check: strategy did not validate.');
  if (!analysis.marketPosition.expected && !analysis.gaps.some(g=>g.priority==='HIGH')) throw new Error('Live check: missing numeric basis was not explained by actionable gaps.');
  log('passed', {number:analysis.deal.solicitationNumber,engine:analysis.marketPosition.formulaVersion});
}
