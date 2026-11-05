import test from 'node:test';
import assert from 'node:assert/strict';
import {screenDocument} from './packageInventory';
import {auditHistoricalDocument,screenHistoricalDocument,historicalScreeningChunks} from './historical';
import {PackageJobs} from './packageJobs';
import {RecordStore} from './store';
import {OpenAIIntelligence,OpenAIRequestError} from './openaiIntelligence';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
import {freezeAndStore,verifyFrozen,recordOutcome} from './predictions';

test('ordinary award clauses do not quarantine an original RFP, but actual results do',async()=>{
 const text='Issued: June 27, 2025. Post-award responsibilities apply. Offerors may request debriefing. The winning price will be evaluated under Section M.';
 const client={interpret:async()=>({kind:'SOLICITATION',publishedAt:'2025-06-27',dateQuote:'Issued: June 27, 2025.'})};
 assert.equal((await auditHistoricalDocument('RFP.pdf',text,'2025-06-30',false,client as any)).decision,'ADMITTED');
 for(const result of ['The winning price was $100.','The contract was awarded to Acme.'])assert.equal(screenHistoricalDocument('RFP.pdf',text+result,'2025-06-30',{kind:'SOLICITATION'},true).decision,'EXCLUDED');
 assert.equal(screenHistoricalDocument('Award notice.txt',text,'2025-06-30',{kind:'SOLICITATION'},true).decision,'EXCLUDED');
});

test('long RFP screening saves each section and resumes without rereading completed sections',async t=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());
 const text='Issued: June 27, 2025.\n'+'Ordinary pre-bid scope. '.repeat(12000);
 const bytes=Buffer.from(text);let normalizations=0,calls=0,interrupted=false,extracted='';
 const jobs=new PackageJobs(store,{
  normalize:async files=>{normalizations++;return files.map(f=>({...f,mimetype:'text/plain'}));},
  audit:async(_name,chunk)=>{calls++;if(calls===2&&!interrupted){interrupted=true;throw new OpenAIRequestError('AI timeout',true);}return {kind:'SOLICITATION',publishedAt:chunk.includes('Issued:')?'2025-06-27':'',dateQuote:chunk.includes('Issued:')?'Issued: June 27, 2025.':'',decision:'ADMITTED',proof:chunk.includes('Issued:')?'DATED_DOCUMENT':'ATTESTED_ORIGINAL',reason:'Screened'};},
  extract:async files=>{extracted=files.map(f=>f.buffer.toString()).join('\n');const a=pricedServicesFixture();a.deal.dueDate='2025-06-30';return a as any;},
  research:async()=>pricedServicesFixture(),price:async a=>a,
 });
 let j=await jobs.create('recovery',{files:[{name:'RFP.txt',size:bytes.length}],mode:'HISTORICAL',cutoff:'2025-06-30',originalPackageConfirmed:true});
 await jobs.chunk('recovery',j.id,'input-0',0,bytes);
 for(let i=0;i<5&&j.status!=='PAUSED';i++)j=await jobs.advance('recovery',j.id);
 assert.equal(j.status,'PAUSED');assert.equal(j.retryable,true);assert.equal(j.documents[0].status,'QUEUED');
 for(let i=0;i<15&&j.stage!=='RESEARCH';i++)j=await jobs.advance('recovery',j.id);
 assert.equal(j.stage,'RESEARCH');assert.equal(normalizations,1);
 assert.equal(calls,historicalScreeningChunks(text).length+1);
 assert.equal(j.documents[0].audit?.decision,'ADMITTED');assert.match(extracted,/Ordinary pre-bid scope/);
});

test('late evaluation sections survive long-document selection and body references do not change sections',()=>{
 const text='SOURCE: RFP | PAGE 1\nSECTION B - Prices\nCLIN 1 support\n\n'+Array.from({length:100},(_,i)=>`SOURCE: RFP | PAGE ${i+2}\nSECTION I - Clauses\n${'Generic pricing reference. '.repeat(100)}`).join('\n\n')+'\n\nSOURCE: RFP | PAGE 102\nSECTION L - Instructions\nPrice all options.\n\nSOURCE: RFP | PAGE 103\nSee Section K - representations. Continue business proposal instructions.\n\nSOURCE: RFP | PAGE 104\nSECTION M - Evaluation\nTotal evaluated price includes the extension.';
 const selected=screenDocument('RFP',text,12000);
 assert.ok(selected.text.length<=12000);assert.match(selected.text,/Price all options/);assert.match(selected.text,/Continue business/);assert.match(selected.text,/Total evaluated price/);
});

test('exclusion explanation is preserved for a large quarantined document',async t=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());
 const bytes=Buffer.from('The contract was awarded to Acme. '+'CLIN scope '.repeat(20000));
 const jobs=new PackageJobs(store,{normalize:async files=>files.map(f=>({...f,mimetype:'text/plain'})),audit:async()=>({kind:'OUTCOME',publishedAt:'',dateQuote:'',decision:'EXCLUDED',proof:'NONE',reason:'Outcome-related content quarantined before analysis.'}),extract:async()=>{throw Error('Must not extract');},research:async()=>pricedServicesFixture(),price:async a=>a});
 let j=await jobs.create('excluded',{files:[{name:'RFP.txt',size:bytes.length}],mode:'HISTORICAL',cutoff:'2025-06-30',originalPackageConfirmed:true});await jobs.chunk('excluded',j.id,'input-0',0,bytes);
 for(let i=0;i<12&&j.stage!=='EXTRACTION';i++)j=await jobs.advance('excluded',j.id);
 assert.equal(j.documents[0].status,'EXCLUDED');assert.equal(j.documents[0].note,j.documents[0].audit?.reason);
 assert.doesNotMatch(j.documents[0].note!,/selected/);
});

test('transient AI failure retries once and authentication failure does not retry',async()=>{
 let calls=0;
 const client=new OpenAIIntelligence('test','model',async()=>{calls++;return calls===1?new Response(JSON.stringify({error:{message:'busy'}}),{status:503}):new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}]}));});
 assert.deepEqual(await client.interpret('read'),{ok:true});assert.equal(calls,2);
 calls=0;const denied=new OpenAIIntelligence('test','model',async()=>{calls++;return new Response(JSON.stringify({error:{message:'invalid key'}}),{status:401});});
 await assert.rejects(denied.interpret('read'),(e:any)=>e instanceof OpenAIRequestError&&!e.retryable);assert.equal(calls,1);
});

test('a saved assessment without numerical evidence stays frozen and cannot receive an accuracy score',async t=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());const a=pricedServicesFixture();
 a.competitivePosition={...a.competitivePosition!,target:null,rangeLow:null,rangeHigh:null,status:'NOT_SUPPORTABLE'};
 const saved=await freezeAndStore(store,'assessment',a);assert.ok(verifyFrozen(saved));
 const result=await recordOutcome(store,'assessment',saved.id,{actualValue:100,actualValueType:'EVALUATED_PRICE',actualSource:'Original evaluated price',sameBasis:true});
 assert.equal(result.validation?.comparableToPrediction,false);assert.equal(result.validation?.expectedErrorPct,null);
});
