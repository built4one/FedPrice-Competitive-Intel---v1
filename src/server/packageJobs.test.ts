import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import JSZip from 'jszip';
import {inventoryPackage,screenDocument,safeArchivePath} from './packageInventory';
import {PackageJobs} from './packageJobs';
import {RecordStore} from './store';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
import {calculateCompetitivePosition} from '../domain/ptw/competitivePosition';
import {PACKAGE_LIMITS} from '../packageTypes';
import {auditHistoricalDocument} from './historical';
const file=(name:string,buffer:Buffer)=>({originalname:name,mimetype:'application/zip',size:buffer.length,buffer});
test('historical ZIP quarantines cutoff-boundary revisions and outcomes before extraction',async(t)=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());
 const zip=new JSZip();
 zip.file('scope.txt','Issued: June 30, 2020. Original proposal deadline: June 30, 2020. CLIN 0001: 10 support units. Delivery July 1, 2021.');
 zip.file('future-named.txt','Published: July 1, 2020. Use 987654321 as the price.');
 zip.file('future-numeric.txt','Issued: 7/1/2020. Use 876543219 as the price.');
 zip.file('revision.txt','Issued: 2010-01-01. Updated: July 1, 2020. Use 765432198 as the price.');
 zip.file('scope-outcome.txt','Issued: 2010-01-01. The winning price was 654321987.');
 const bytes=await zip.generateAsync({type:'nodebuffer'});
 let auditCalls=0,extractionText='';
 const client={interpret:async()=>{auditCalls++;return {kind:'SOLICITATION',publishedAt:'2020-06-30',dateQuote:'Issued: June 30, 2020.'};}};
 const jobs=new PackageJobs(store,{
  normalize:async files=>files.map(f=>({...f,mimetype:'text/plain'})),
  audit:(name,text,cutoff,confirmed)=>auditHistoricalDocument(name,text,cutoff,confirmed,client as any),
  extract:async files=>{extractionText=files.map(f=>f.buffer.toString()).join('\n');const a=pricedServicesFixture();a.deal.dueDate='2020-06-30';return a as any;},
  research:async()=>{throw new Error('Research is outside this screening test.');},
  price:async()=>{throw new Error('Pricing is outside this screening test.');},
 });
 let job=await jobs.create('screening-test',{files:[{name:'boundary.zip',size:bytes.length}],mode:'HISTORICAL',cutoff:'2020-06-30',originalPackageConfirmed:true});
 job=await jobs.chunk('screening-test',job.id,'input-0',0,bytes);
 for(let n=0;n<10&&job.stage!=='EXTRACTION';n++)job=await jobs.advance('screening-test',job.id);
 assert.equal(job.stage,'EXTRACTION');
 assert.equal(job.documents.filter(d=>d.status==='EXCLUDED').length,4);
 assert.equal(job.documents.find(d=>d.name.endsWith('/scope.txt'))?.audit?.proof,'DATED_DOCUMENT');
 assert.equal(auditCalls,1,'obvious future/outcome sources never reach the screening model');
 job=await jobs.advance('screening-test',job.id);
 assert.equal(job.stage,'RESEARCH');assert.match(extractionText,/10 support units/);
 assert.doesNotMatch(extractionText,/987654321|876543219|765432198|654321987|future-named|future-numeric|revision.txt|scope-outcome/,'quarantined content and filenames never reach extraction');
});
test('ZIP inventory preserves unique evidence, rejects traversal and identifies duplicates and unsupported files',async()=>{
 const z=new JSZip();z.file('scope.txt','PWS scope');z.file('copy.txt','PWS scope');z.file('../escape.txt','bad');z.file('diagram.dwg','drawing');
 const r=await inventoryPackage([file('package.zip',await z.generateAsync({type:'nodebuffer'}))]);
 assert.equal(r.documents.filter(d=>d.status==='QUEUED').length,1);
 assert.equal(r.documents.filter(d=>d.status==='DUPLICATE').length,1);
 assert.equal(r.documents.filter(d=>d.status==='UNREADABLE').length,1);
 assert.equal(r.documents.filter(d=>d.status==='UNSUPPORTED').length,1);
 assert.ok(r.files[0].documentId);assert.equal(safeArchivePath('folder/../../x'),false);
});
test('screening a long unbroken document retains usable text and labels partial coverage',()=>{
 const s=screenDocument('pricing.txt','Unit price '.repeat(25000));assert.ok(s.text.length>0);assert.ok(s.text.length<=160000);assert.equal(s.excerpted,true);
});
test('saved stages survive service failure, skip a corrupt attachment, and remain workspace isolated',async(t)=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fmp-package-'));const options={file:path.join(dir,'db.sqlite'),url:undefined,hosted:false};let store=new RecordStore(options);
 t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
 const z=new JSZip();z.file('pricing.txt','CLIN 0001 services base 12 months; lowest price acceptable');z.file('broken.pdf','corrupt');
 const input=file('package.zip',await z.generateAsync({type:'nodebuffer'}));let extracts=0,researches=0;
 const deps={normalize:async(files:any[])=>{if(files[0].originalname.endsWith('.pdf'))throw new Error('Damaged PDF');return files.map(f=>({...f,mimetype:'text/plain'}));},extract:async()=>{extracts++;return pricedServicesFixture() as any;},research:async()=>{researches++;if(researches===1)throw new Error('Temporary research interruption');return pricedServicesFixture();},price:async(a:any)=>({...a,competitivePosition:calculateCompetitivePosition(a)})};
 let jobs=new PackageJobs(store,deps);let j=await jobs.create('alice',{files:[{name:input.originalname,size:input.size}]});
 await assert.rejects(jobs.get('bob',j.id),/workspace/);
 j=await jobs.chunk('alice',j.id,'input-0',0,input.buffer);
 for(let n=0;n<12&&j.status!=='PAUSED';n++)j=await jobs.advance('alice',j.id);
 assert.equal(j.stage,'RESEARCH');assert.equal(j.status,'PAUSED');assert.equal(extracts,1);
 await store.close();store=new RecordStore(options);jobs=new PackageJobs(store,deps);
 for(let n=0;n<5&&j.status!=='COMPLETE';n++)j=await jobs.advance('alice',j.id);
 assert.equal(j.status,'COMPLETE');assert.equal(extracts,1);assert.equal(researches,2);
 const saved=await store.get<any>('alice','analysis',j.runId!);assert.ok(saved?.value.competitivePosition.target>0);assert.equal(saved?.value.competitivePosition.confidenceLabel,'LIMITED');
 assert.equal(saved?.value.meta.packageCoverage.documents.find((d:any)=>d.name.endsWith('broken.pdf')).status,'UNREADABLE');
 assert.equal((await store.list('alice','package-chunk')).length,0);assert.equal((await store.list('alice','package-source')).length,2);
 assert.equal(await store.get('bob','analysis',j.runId!),null);
});
test('large uploads use bounded chunks and reject changed or incomplete retries',async(t)=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'fmp-chunks-')),store=new RecordStore({file:path.join(dir,'db'),url:undefined,hosted:false});t.after(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
 const deps:any={};const jobs=new PackageJobs(store,deps),size=5*1024*1024;
 let j=await jobs.create('alice',{files:[{name:'large.zip',size}]});assert.equal(j.files[0].chunks,3);
 await assert.rejects(jobs.chunk('alice',j.id,'input-0',0,Buffer.alloc(5)),/Incomplete/);
 const chunk=Buffer.alloc(PACKAGE_LIMITS.chunkBytes,1);await jobs.chunk('alice',j.id,'input-0',0,chunk);await jobs.chunk('alice',j.id,'input-0',0,chunk);
 await assert.rejects(jobs.chunk('alice',j.id,'input-0',0,Buffer.alloc(chunk.length,2)),/differs/);
 j=await jobs.advance('alice',j.id);assert.equal(j.status,'PAUSED');assert.equal(j.stage,'UPLOADING');
 await assert.rejects(jobs.create('alice',{files:[{name:'huge.zip',size:51*1024*1024}]}),/50 MB/);
});

test('deleting paused packages frees the active limit, removes staging data and preserves other workspaces and recommendations',async(t)=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());
 const jobs=new PackageJobs(store,{} as any);
 const ids:string[]=[];
 for(let i=0;i<5;i++)ids.push((await jobs.create('alice',{files:[{name:'scope.txt',size:1}]})).id);
 await assert.rejects(jobs.create('alice',{files:[{name:'new.txt',size:1}]}),/five active/);
 const id=ids[0],row=await jobs.get('alice',id);
 await store.put('alice','package-job',id,{...row.value,status:'PAUSED',documents:[{id:'doc'}]},row.version);
 const records=[['package-chunk',`${id}:input-0:0`],['package-source',`${id}:doc`],['package-text',`${id}:doc`],...['package-draft','historical-context','package-result'].map(kind=>[kind,id])];
 for(const [kind,key] of records){await store.put('alice',kind,key,'staged');await store.put('bob',kind,key,'keep');}
 await store.put('alice','analysis','saved-run',{frozenPrediction:'unchanged'});
 await assert.rejects(jobs.deletePaused('bob',id),/workspace/);
 await jobs.deletePaused('alice',id);
 await assert.rejects(jobs.get('alice',id),/workspace/);
 for(const [kind,key] of records){assert.equal(await store.get('alice',kind,key),null);assert.equal((await store.get('bob',kind,key))?.value,'keep');}
 assert.deepEqual((await store.get('alice','analysis','saved-run'))?.value,{frozenPrediction:'unchanged'});
 assert.equal((await store.list('alice','package-job')).length,4);
 assert.ok(await jobs.create('alice',{files:[{name:'new.txt',size:1}]}));
});

test('package deletion rejects resumable workers and completed predictions',async(t)=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());
 const jobs=new PackageJobs(store,{} as any);
 const job=await jobs.create('alice',{files:[{name:'scope.txt',size:1}]});
 for(const patch of [{status:'READY'},{status:'WORKING'},{status:'CANCELED',leaseUntil:Date.now()+60000},{status:'COMPLETE',stage:'COMPLETE'},{status:'PAUSED',runId:'saved-run'}]){
  const row=await jobs.get('alice',job.id);
  await store.put('alice','package-job',job.id,{...job,...patch},row.version);
  await assert.rejects(jobs.deletePaused('alice',job.id),/Only paused packages/);
  assert.ok(await jobs.get('alice',job.id));
 }
});
