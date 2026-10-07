// Opt-in, real public solicitation acceptance run. Runs inside the protected
// preview build, using configured credentials in place; no secret is exported.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {resolveSamOpportunityPackage} from '../src/adapters/sam';
import {analyzeFiles,normalizeAnalysisFiles,samMetadataFile} from '../server';
import {createExecutivePdf} from '../src/exports/executivePdf';
import {addCompetitiveWorkbook} from '../src/exports/competitiveWorkbook';
import {normalizePdfText} from '../src/server/pdfText';
import CompetitiveRecommendation from '../src/components/decision/CompetitiveRecommendation';
import {enforceAuthoritativeAnalysis} from '../src/domain/marketPosition/authoritative';

const refs=(process.env.FMP_VERIFY_EXECUTIVE||'').split('|').filter(Boolean);
const log=(stage:string,data:unknown)=>console.log('EXECUTIVE_ACCEPTANCE',JSON.stringify({stage,data}));
const summary:any[]=[];
await mkdir('dist/validation',{recursive:true});
for(const [index,reference] of refs.entries()){
  const started=Date.now(),id=`case-${index+1}`;
  try{
    log('start',{id,reference});
    const pack=await resolveSamOpportunityPackage(reference);
    const files=await normalizeAnalysisFiles([samMetadataFile(pack.opportunity),...pack.files]);
    const source=files.filter(f=>f.mimetype==='text/plain').map(f=>`DOCUMENT: ${f.originalname}\n${f.buffer.toString('utf8')}`).join('\n\n');
    const excerpts=source.split('\n').flatMap((line,i,all)=>/52\.212.2|evaluation|lowest priced|sealed bid|price realism|total evaluated|basis for award/i.test(line)?[all.slice(Math.max(0,i-2),i+12).join('\n')]:[]).slice(0,25).join('\n\n');
    const analysis=enforceAuthoritativeAnalysis(await analyzeFiles(files));
    analysis.meta.warnings.push(`Acceptance test from public Federal source ${reference}; not an award prediction.`,...pack.files.map(f=>`Package snapshot: ${f.originalname} SHA-256 ${createHash('sha256').update(f.buffer).digest('hex')}`));
    const p=analysis.competitivePosition!;
    const evidence={id,reference,solicitation:analysis.deal.solicitationNumber,title:analysis.deal.title,evaluation:analysis.deal.evaluationMethod,scheme:analysis.deal.evaluationScheme,basket:analysis.deal.evaluationPricing,files:pack.files.map(f=>f.originalname),status:p.status,confidence:p.confidenceLabel,assumptionShare:p.assumptionShare,range:[p.rangeLow,p.target,p.rangeHigh],runtimeMs:Date.now()-started,missing:p.missing,warnings:analysis.meta.warnings.filter(w=>!w.startsWith('Package snapshot:'))};
    await writeFile(`dist/validation/${id}.json`,JSON.stringify(analysis));
    await writeFile(`dist/validation/${id}-source.txt`,excerpts||source.slice(0,90000));
    await writeFile(`dist/validation/${id}-checks.json`,JSON.stringify(evidence,null,2));
    log('analysis',evidence);
    assert.ok(p.target && Number.isFinite(p.target) && p.target<1e13,'Recommendation must be finite and positive');
    assert.ok(p.rangeLow!<=p.target && p.target<=p.rangeHigh!,'Ordered corridor');
    assert.equal(p.unpricedRows.length,0,'All extracted labor is priced');
    assert.ok(p.basisReconstructed,'Evaluated basis reconstructed');
    assert.ok(analysis.deal.evaluationScheme?.sourceRefs.length,'Selection method cited');
    assert.notEqual(analysis.deal.evaluationScheme?.method,'UNKNOWN','Selection method resolved');
    assert.ok(Date.now()-started<285000,'Within hosting runtime budget');
    const sum=p.rows.reduce((n,r)=>n+r.target,0)+p.components.reduce((n,c)=>n+c.includedAmount,0);
    if(p.rows.length || p.components.length)assert.ok(Math.abs(sum-p.target)<.02,'Full basket reconciles');
    const ui=renderToStaticMarkup(React.createElement(CompetitiveRecommendation,{analysis}));
    const currency=(v:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
    for(const value of [p.rangeLow!,p.target,p.rangeHigh!])assert.ok(ui.includes(currency(value)),'UI contains authoritative price');
    const pdf=await createExecutivePdf(analysis);
    const parsed=await normalizePdfText({originalname:'brief.pdf',mimetype:'application/pdf',size:pdf.length,buffer:pdf});
    const pdfText=parsed.buffer.toString().replace(/\s+/g,'');
    for(const value of [p.rangeLow!,p.target,p.rangeHigh!])assert.ok(pdfText.includes(currency(value)),'PDF matches UI price');
    assert.ok(pdfText.includes(p.confidenceLabel),'PDF confidence agrees');
    const book=new ExcelJS.Workbook();book.addWorksheet('Executive Decision').columns=[{header:'Field',key:'field'},{header:'Value',key:'value'}];addCompetitiveWorkbook(book,analysis);
    const xlsx=await book.xlsx.writeBuffer(),read=new ExcelJS.Workbook();await read.xlsx.load(xlsx as never);
    assert.equal((read.getWorksheet('Competitive Strategies')!.getCell('D3').value as ExcelJS.CellFormulaValue).result,p.target,'Excel matches target');
    await writeFile(`dist/validation/${id}.pdf`,pdf);await writeFile(`dist/validation/${id}.xlsx`,Buffer.from(xlsx));
    summary.push({...evidence,automatedPass:true,sourceReview:'PENDING'});
    log('passed',{id,runtimeMs:Date.now()-started,target:p.target,pdfBytes:pdf.length,workbookBytes:xlsx.byteLength});
  }catch(error){const failed={id,reference,automatedPass:false,error:error instanceof Error?error.message:String(error),runtimeMs:Date.now()-started};summary.push(failed);log('failed',failed);}
}
await writeFile('dist/validation/index.json',JSON.stringify(summary,null,2));
log('complete',{passed:summary.filter(c=>c.automatedPass).length,total:refs.length});
// Preserve failed-run diagnostics in the protected preview for repair. A READY
// deployment is NOT an executive-readiness claim; all cases must pass review.
