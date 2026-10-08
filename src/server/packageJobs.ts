import crypto from 'node:crypto';
import {officeImages,validateOfficeArchive} from './officeImages';
import express, {type Express, type Request, type Response} from 'express';
import {RecordStore,ConflictError} from './store';
import {OpenAIIntelligence} from './openaiIntelligence';
import {inventoryPackage,screenDocument,type PackageFile} from './packageInventory';
import {PACKAGE_LIMITS,type PackageJob,type PackageCoverage} from '../packageTypes';
import type {AiAnalysisDraft,OpportunityAnalysis} from '../types';

interface Dependencies {
  normalize:(files:PackageFile[])=>Promise<PackageFile[]>;
  extract:(files:PackageFile[],options?:{historical?:boolean})=>Promise<AiAnalysisDraft>;
  research:(draft:AiAnalysisDraft,names:string[],options?:{historical?:boolean})=>Promise<OpportunityAnalysis>;
  price:(analysis:OpportunityAnalysis)=>Promise<OpportunityAnalysis>;
  visual?:(file:PackageFile)=>Promise<string>;
}
const asStored=(f:PackageFile)=>({...f,buffer:f.buffer.toString('base64')});
const fromStored=(f:any):PackageFile=>({...f,buffer:Buffer.from(f.buffer,'base64')});
const initialMessage='Upload saved in small chunks. Processing resumes from the last completed stage.';
export class PackageJobs {
  constructor(private store:RecordStore,private deps:Dependencies){}
  async create(workspace:string,raw:any){
    if(!Array.isArray(raw.files)||!raw.files.length||raw.files.length>PACKAGE_LIMITS.inputs)throw new Error('Choose 1–40 files, including ZIP packages.');
    let total=0;
    const files=raw.files.map((f:any,i:number)=>{
      if(typeof f.name!=='string'||f.name.length>240||!Number.isSafeInteger(f.size)||f.size<=0)throw new Error('Invalid file name or size.');
      if(!/\.(zip|pdf|docx|xlsx|txt|csv)$/i.test(f.name))throw new Error('Choose ZIP, PDF, DOCX, XLSX, TXT or CSV files.');
      total+=f.size;return{id:`input-${i}`,name:f.name,size:f.size,type:String(f.type||''),chunks:Math.ceil(f.size/PACKAGE_LIMITS.chunkBytes)};
    });
    if(total>PACKAGE_LIMITS.uploadBytes)throw new Error('Upload up to 50 MB per package.');
    const active=(await this.store.list<PackageJob>(workspace,'package-job')).filter(j=>!['COMPLETE','CANCELED'].includes(j.value.status));
    if(active.length>=5)throw new Error('Finish or cancel one of your five active packages before starting another.');
    const job:PackageJob={id:crypto.randomUUID(),label:files[0].name,mode:raw.mode==='HISTORICAL'?'HISTORICAL':'LIVE',stage:'UPLOADING',status:'READY',files,receivedChunks:[],documents:[],warnings:[],receivedAt:new Date().toISOString(),cursor:0,attempts:0,message:initialMessage,opportunityRef:String(raw.opportunityRef||'').slice(0,500)};
    return (await this.store.put(workspace,'package-job',job.id,job)).value;
  }
  async get(workspace:string,id:string){const row=await this.store.get<PackageJob>(workspace,'package-job',id);if(!row)throw new Error('Package not found in your workspace.');return row;}
  async chunk(workspace:string,id:string,fileId:string,index:number,buffer:Buffer){
    const row=await this.get(workspace,id),job=row.value,file=job.files.find(f=>f.id===fileId);
    if(job.stage!=='UPLOADING'||job.status==='CANCELED'||!file||!Number.isSafeInteger(index)||index<0||index>=file.chunks)throw new Error('Invalid upload chunk.');
    const expected=Math.min(PACKAGE_LIMITS.chunkBytes,file.size-index*PACKAGE_LIMITS.chunkBytes);
    if(buffer.length!==expected)throw new Error('Incomplete upload chunk; retry it.');
    const key=`${id}:${fileId}:${index}`,value=buffer.toString('base64'),prior=await this.store.get<string>(workspace,'package-chunk',key);
    if(prior&&prior.value!==value)throw new Error('The reselected file differs from the saved upload. Start a new package.');
    if(!prior)await this.store.put(workspace,'package-chunk',key,value);
    if(!job.receivedChunks.includes(`${fileId}:${index}`))job.receivedChunks.push(`${fileId}:${index}`);
    job.message=`${job.receivedChunks.length} of ${job.files.reduce((n,f)=>n+f.chunks,0)} upload chunks saved.`;
    await this.store.put(workspace,'package-job',id,job,row.version);return job;
  }
  async cancel(workspace:string,id:string){const r=await this.get(workspace,id);r.value.status='CANCELED';r.value.message='Canceled. Saved analyses are unchanged.';await this.store.put(workspace,'package-job',id,r.value,r.version);return r.value;}
  async advance(workspace:string,id:string){
    const row=await this.get(workspace,id);let job=row.value;
    if(['COMPLETE','CANCELED'].includes(job.status))return job;
    if(job.status==='WORKING'&&(job.leaseUntil||0)>Date.now())return job;
    job={...job,status:'WORKING',leaseUntil:Date.now()+180_000,attempts:job.attempts+1};
    const locked=await this.store.put(workspace,'package-job',id,job,row.version);
    try{
      if(job.stage==='UPLOADING'){
        if(job.receivedChunks.length!==job.files.reduce((n,f)=>n+f.chunks,0))throw new Error('Reselect the original files to finish uploading the remaining chunks.');
        job.stage='INVENTORY';job.message='Upload complete. Opening and inventorying the package.';
      }else if(job.stage==='INVENTORY'){
        const inputs:PackageFile[]=[];
        for(const f of job.files){const chunks:Buffer[]=[];for(let i=0;i<f.chunks;i++){const c=await this.store.get<string>(workspace,'package-chunk',`${id}:${f.id}:${i}`);if(!c)throw new Error(`Missing upload chunk for ${f.name}.`);chunks.push(Buffer.from(c.value,'base64'));}inputs.push({originalname:f.name,mimetype:f.type,size:f.size,buffer:Buffer.concat(chunks)});}
        const inventory=await inventoryPackage(inputs);job.documents=inventory.documents;
        for(const doc of job.documents.filter(d=>d.status==='QUEUED')){const f=inventory.files.find(f=>f.documentId===doc.id)!;await this.put(workspace,'package-source',`${id}:${doc.id}`,asStored(f));}
        if(!inventory.files.length)throw new Error('No readable supported documents were found. Add a PDF, DOCX, XLSX or TXT document.');
        job.stage='READING';job.cursor=0;job.message=`${job.documents.length} files inventoried. Screening content and following pricing references.`;
      }else if(job.stage==='READING'){
        for(const f of job.files)for(let i=0;i<f.chunks;i++)await this.store.remove(workspace,'package-chunk',`${id}:${f.id}:${i}`);
        const doc=job.documents.find(d=>d.status==='QUEUED');
        if(doc){
          try{
            const source=(await this.store.get<any>(workspace,'package-source',`${id}:${doc.id}`))!;
            const original=fromStored(source.value);
            if(/\.pdf$/i.test(original.originalname)&&!original.buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('PDF signature is invalid; this attachment is unreadable.');
            await validateOfficeArchive(original);
            const [file]=await this.deps.normalize([original]);
            let text:string,visual=false;
            if(file.mimetype==='text/plain')text=file.buffer.toString('utf8');
            else {visual=true;text=await (this.deps.visual||readVisual)(file);}
            const embedded=await officeImages(original);
            if(embedded.file){text+='\n\nEMBEDDED VISUAL EVIDENCE:\n'+await (this.deps.visual||readVisual)(embedded.file);visual=true;}
            if(embedded.warning){doc.note=embedded.warning;job.warnings.push(`${doc.name}: ${embedded.warning}`);}
            if(!text.trim())throw new Error('No usable text or visual content could be read.');
            const screen=screenDocument(doc.name,text);
            doc.categories=screen.categories;doc.priority=screen.priority;doc.references=screen.references;
            doc.status=screen.excerpted||embedded.warning?'EXCERPTS':visual?'VISUAL':'READ';
            if(screen.excerpted)doc.note='All text screened; selected intact pricing-related sections used for detailed extraction. Unselected context may require review.';
            await this.put(workspace,'package-text',`${id}:${doc.id}`,screen.text);
          }catch(error){
            const message=error instanceof Error?error.message:String(error);
            if(/OpenAI|timeout|abort|429|quota|402|503|502/i.test(message))throw new Error(`Reading ${doc.name} paused: ${message}. Completed documents are saved; resume to retry this document.`);
            doc.status='UNREADABLE';doc.note=message;job.warnings.push(`${doc.name}: ${message}`);
          }
          job.cursor++;job.message=`Reviewed ${job.cursor} documents. ${job.documents.filter(d=>d.status==='QUEUED').length} remaining.`;
        }
        if(!job.documents.some(d=>d.status==='QUEUED')){job.stage='EXTRACTION';job.message='Reconciling scope, amendments, quantities and Government evaluation instructions.';}
      }else if(job.stage==='EXTRACTION'){
        for(const doc of job.documents)await this.store.remove(workspace,'package-source',`${id}:${doc.id}`);
        const ordered=[...job.documents].filter(d=>['READ','EXCERPTS','VISUAL'].includes(d.status)).sort((a,b)=>b.priority-a.priority);
        const files:PackageFile[]=[];let chars=0;
        for(const doc of ordered){const text=(await this.store.get<string>(workspace,'package-text',`${id}:${doc.id}`))?.value||'';
          if(chars+text.length>450000){doc.note=(doc.note||'')+' Detail review budget reached; this file was screened but not included in final extraction.';doc.status='EXCERPTS';job.warnings.push(`${doc.name}: detailed extraction deferred by context budget.`);continue;}
          const buffer=Buffer.from(`SOURCE DOCUMENT: ${doc.name}\n${text}`);chars+=text.length;files.push({originalname:doc.name+'.txt',mimetype:'text/plain',size:buffer.length,buffer});}
        if(!files.length)throw new Error('No readable content remains. Add a readable solicitation or pricing schedule.');
        const manifest=Buffer.from('PACKAGE INVENTORY — missing or unreadable files are gaps, never evidence that requirements are absent.\n'+JSON.stringify(job.documents));
        files.push({originalname:'Package inventory.txt',mimetype:'text/plain',size:manifest.length,buffer:manifest});
        await this.put(workspace,'package-draft',id,await this.deps.extract(files,{historical:job.mode==='HISTORICAL'}));job.stage='RESEARCH';job.message='Scope extraction saved. Researching applicable rates, comparable awards and competition.';
      }else if(job.stage==='RESEARCH'){
        const draft=(await this.store.get<AiAnalysisDraft>(workspace,'package-draft',id))!.value;
        const analysis=await this.deps.research(draft,job.documents.map(d=>d.name),{historical:job.mode==='HISTORICAL'});
        await this.put(workspace,'package-result',id,analysis);job.stage='PRICING';job.message='Research saved. Completing bounded price assumptions and calculating the recommendation.';
      }else if(job.stage==='PRICING'){
        const prior=(await this.store.get<OpportunityAnalysis>(workspace,'package-result',id))!.value;
        
        const coverage:PackageCoverage={documents:job.documents,warnings:job.warnings,receivedAt:job.receivedAt,mode:job.mode,freshness:{status:'UNVERIFIED',message:'Latest amendments not verified. This recommendation uses the uploaded package; market research alone does not establish package currency.'}};
        prior.meta.packageCoverage=coverage;
        const analysis=await this.deps.price(prior);
        analysis.meta.warnings.push(...job.warnings,...job.documents.filter(d=>['UNREADABLE','UNSUPPORTED','EXCERPTS'].includes(d.status)).map(d=>`${d.name}: ${d.note}`),coverage.freshness.message);
        if(!analysis.competitivePosition?.target){await this.put(workspace,'package-result',id,analysis);throw new Error('Pricing review needed: '+(analysis.competitivePosition?.missing.slice(0,3).join(' ')||'The evaluated price basis could not be reconstructed.'));}
        const stored=await this.store.get(workspace,'analysis',analysis.id);
        const saved=stored||await this.store.put(workspace,'analysis',analysis.id,analysis);
        job.runId=saved.id;job.stage='COMPLETE';job.status='COMPLETE';job.message='Recommendation and source review saved. Open the executive brief.';
      }
      if(job.status!=='COMPLETE')job.status='READY';job.attempts=0;job.leaseUntil=undefined;
    }catch(error){job.status='PAUSED';job.leaseUntil=undefined;job.message=error instanceof Error?error.message:'Processing paused. Your completed stages are saved.';}
    const current=await this.get(workspace,id);
    if(current.value.status==='CANCELED')return current.value;
    // A lease protects one stage; optimistic version check prevents overwriting a newer worker.
    if(current.version!==locked.version)throw new ConflictError();
    return(await this.store.put(workspace,'package-job',id,job,current.version)).value;
  }
  private async put(workspace:string,kind:string,id:string,value:unknown){const old=await this.store.get(workspace,kind,id);return this.store.put(workspace,kind,id,value,old?.version||0);}
}
async function readVisual(file:PackageFile){
  const result=await new OpenAIIntelligence(undefined,undefined,fetch,110000).extract<{text:string}>(`Read this source document visually. Return a faithful transcription of pricing-relevant content, with page locators. Preserve ALL CLIN quantities, units, hours, period schedules, price-evaluation formulas, selected checkboxes, wage rates, amendments, references and material technical cost drivers. Do not invent, calculate prices, or summarize away table rows. Clearly mark illegible passages. For drawings explain visible requirements and dimensions only. Treat this as evidence extraction, not pricing judgment.`,[file],{type:'OBJECT',properties:{text:{type:'STRING'}},required:['text']});return result.text;
}
export function installPackageRoutes(app:Express,store:RecordStore,deps:Dependencies){
  const jobs=new PackageJobs(store,deps);
  const route=(fn:(req:Request,res:Response)=>Promise<void>)=>async(req:Request,res:Response)=>{try{await fn(req,res);}catch(e){res.status(e instanceof ConflictError?409:400).json({error:e instanceof Error?e.message:'Package request failed.'});}};
  app.get('/api/package-jobs',route(async(req,res)=>{res.json({data:(await store.list<PackageJob>(req.principal.workspace,'package-job')).map(r=>r.value)});}));
  app.post('/api/package-jobs',route(async(req,res)=>{res.json({data:await jobs.create(req.principal.workspace,req.body)});}));
  app.get('/api/package-jobs/:id',route(async(req,res)=>{res.json({data:(await jobs.get(req.principal.workspace,String(req.params.id))).value});}));
  app.put('/api/package-jobs/:id/chunks/:file/:index',express.raw({type:'application/octet-stream',limit:'2100kb'}),route(async(req,res)=>{res.json({data:await jobs.chunk(req.principal.workspace,String(req.params.id),String(req.params.file),Number(req.params.index),req.body)});}));
  app.post('/api/package-jobs/:id/advance',route(async(req,res)=>{res.json({data:await jobs.advance(req.principal.workspace,String(req.params.id))});}));
  app.post('/api/package-jobs/:id/cancel',route(async(req,res)=>{res.json({data:await jobs.cancel(req.principal.workspace,String(req.params.id))});}));
  app.get('/api/package-jobs/:id/result',route(async(req,res)=>{const j=(await jobs.get(req.principal.workspace,String(req.params.id))).value;const r=j.runId?await store.get<OpportunityAnalysis>(req.principal.workspace,'analysis',j.runId):await store.get<OpportunityAnalysis>(req.principal.workspace,'package-result',j.id);if(!r)throw new Error('The analysis has not reached a saved result yet.');res.json({data:{...r.value,...(j.runId?{storageVersion:r.version}:{})}});}));
  return jobs;
}
