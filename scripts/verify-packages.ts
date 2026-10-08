// Public original-source acceptance, with credentials used only in the deployment runtime.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PackageJobs} from '../src/server/packageJobs';
import {RecordStore} from '../src/server/store';
import {PACKAGE_LIMITS} from '../src/packageTypes';
import {extractSolicitation,enrichSolicitation,priceSolicitation,normalizeAnalysisFiles} from '../server';
import {createExecutivePdf} from '../src/exports/executivePdf';
import {addCompetitiveWorkbook} from '../src/exports/competitiveWorkbook';
import {normalizePdfText} from '../src/server/pdfText';
import CompetitiveRecommendation from '../src/components/decision/CompetitiveRecommendation';
const log=(stage:string,data:unknown)=>console.log('PACKAGE_ACCEPTANCE',JSON.stringify({stage,data}));
const cases=JSON.parse(await readFile('acceptance/sources.json','utf8'));
const summary:any[]=[];
await mkdir('dist/validation',{recursive:true});
for(const c of cases){
 const started=Date.now();const store=new RecordStore({url:undefined,file:`/tmp/fmp-validation-${randomUUID()}.sqlite`,hosted:false});
 const timings:any[]=[];
 try{
  const z=new JSZip(),sources:any[]=[];
  for(const f of c.files){const response=await fetch(f.url,{signal:AbortSignal.timeout(60000)});assert.ok(response.ok,`${f.name} download HTTP ${response.status}`);const b=Buffer.from(await response.arrayBuffer());assert.ok(b.length>100&&b.length<25*1024*1024,'Original document size');z.file(f.name,b);sources.push({...f,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
  // Explicitly injected failure, never represented as a source document.
  if(c.id==='court-refurbishment')z.file('TEST-ONLY-unreadable-attachment.pdf',Buffer.from('Injected unreadable-file acceptance fixture'));
  const buffer=await z.generateAsync({type:'nodebuffer'});
  const jobs=new PackageJobs(store,{normalize:normalizeAnalysisFiles,extract:extractSolicitation,research:enrichSolicitation,price:priceSolicitation});
  let job=await jobs.create('acceptance',{files:[{name:c.id+'.zip',size:buffer.length}],mode:'HISTORICAL'});
  for(let i=0;i<job.files[0].chunks;i++)job=await jobs.chunk('acceptance',job.id,'input-0',i,buffer.subarray(i*PACKAGE_LIMITS.chunkBytes,(i+1)*PACKAGE_LIMITS.chunkBytes));
  for(let n=0;n<40&&job.status!=='COMPLETE';n++){
   const begin=Date.now(),stage=job.stage;job=await jobs.advance('acceptance',job.id);timings.push({stage,ms:Date.now()-begin,status:job.status});log('stage',{id:c.id,...timings.at(-1),message:job.message});
   if(job.status==='PAUSED')throw new Error(job.message);
  }
  assert.equal(job.status,'COMPLETE');
  const a=(await store.get<any>('acceptance','analysis',job.runId!))!.value,p=a.competitivePosition;
  const record={id:c.id,title:a.deal.title,solicitation:a.deal.solicitationNumber,sources,scheme:a.deal.evaluationScheme,basket:a.deal.evaluationPricing,range:[p.rangeLow,p.target,p.rangeHigh],confidence:p.confidenceLabel,mode:'HISTORICAL',timings,runtimeMs:Date.now()-started,sourceReview:'PENDING'};
  await writeFile(`dist/validation/${c.id}.json`,JSON.stringify(a));await writeFile(`dist/validation/${c.id}-checks.json`,JSON.stringify(record,null,2));
  assert.ok(p.target>0&&Number.isFinite(p.target)&&p.target<1e13,'Finite positive target');assert.ok(p.rangeLow<=p.target&&p.target<=p.rangeHigh,'Ordered corridor');assert.ok(p.basisReconstructed,'Reconstructed evaluated price basis');assert.equal(p.unpricedRows.length,0,'No omitted extracted labor');assert.ok(timings.every(t=>t.ms<175000),'Every request within stage lease');
  const sum=p.rows.reduce((n:number,r:any)=>n+r.target,0)+p.components.reduce((n:number,r:any)=>n+r.includedAmount,0);
  if(p.rows.length||p.components.length)assert.ok(Math.abs(sum-p.target)<.02,'Component arithmetic reconciles');
  if(c.id.startsWith('court-'))assert.equal(a.deal.evaluationScheme.method,'LPTA','Court stated LPTA preserved');
  const ui=renderToStaticMarkup(React.createElement(CompetitiveRecommendation,{analysis:a}));
  const money=(v:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
  const pdf=await createExecutivePdf(a),parsed=await normalizePdfText({originalname:'brief.pdf',mimetype:'application/pdf',size:pdf.length,buffer:pdf}),text=parsed.buffer.toString().replace(/\s+/g,'');
  for(const v of [p.rangeLow,p.target,p.rangeHigh]){assert.ok(ui.includes(money(v)),'UI price parity');assert.ok(text.includes(money(v)),'PDF price parity');}
  assert.ok(text.includes(p.confidenceLabel),'PDF confidence parity');
  const book=new ExcelJS.Workbook();book.addWorksheet('Executive Decision').columns=[{header:'Field',key:'field'},{header:'Value',key:'value'}];addCompetitiveWorkbook(book,a);const xlsx=await book.xlsx.writeBuffer();const read=new ExcelJS.Workbook();await read.xlsx.load(xlsx as never);assert.equal((read.getWorksheet('Competitive Strategies')!.getCell('D3').value as ExcelJS.CellFormulaValue).result,p.target,'Excel price parity');assert.ok(read.getWorksheet('Package Coverage'),'Workbook source coverage');
  await writeFile(`dist/validation/${c.id}.pdf`,pdf);await writeFile(`dist/validation/${c.id}.xlsx`,Buffer.from(xlsx));
  summary.push({...record,automatedPass:true});log('passed',{id:c.id,range:record.range,confidence:p.confidenceLabel,runtimeMs:Date.now()-started});
 }catch(error){const record={id:c.id,automatedPass:false,error:error instanceof Error?error.message:String(error),timings,runtimeMs:Date.now()-started};summary.push(record);log('failed',record);}
 finally{await store.close();}
 await writeFile('dist/validation/index.json',JSON.stringify(summary,null,2));
}
log('complete',{passed:summary.filter(c=>c.automatedPass).length,total:cases.length});
