import assert from 'node:assert/strict';
import test from 'node:test';
import {admitExtractedEvidence,advanceResearch,newResearchState,privateAddress,supportedDate,referenceRateCatalogs,supplementalAttachment,sourceVersionAfterCutoff,rateRechecks,RATE_EXTRACTION_VERSION,type ResearchState,type ResearchSource} from './researchWorkflow';
import {reconcileSourceFacts} from '../domain/sourceConsistency';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
import {historicalContext,filterHistoricalDraft} from './historical';
import {PackageJobs} from './packageJobs';
import {RecordStore} from './store';
import {ptwStrategyFixture} from '../testFixtures/ptwStrategy';
import {synthesizePtwStrategy} from './ptwSynthesis';
import {enforceAuthoritativeAnalysis} from '../domain/marketPosition/authoritative';

const source=():ResearchSource=>({id:'RES-test',task:'BENCHMARKS',url:'https://example.gov/2025-rates.pdf',name:'2025 rates.pdf',status:'READ',sha256:'abc',text:'Issued May 1, 2025. Senior Developer $126 per hour. Program budget $999.'});
const raw=()=>({kind:'MARKET',publishedAt:'2025-05-01',dateQuote:'Issued May 1, 2025.',evidence:[{claim:'Senior Developer schedule ceiling is $126/hour.',excerpt:'Senior Developer $126 per hour.',section:'Table 1',numeric:{originalValue:126,valueType:'HOURLY_CEILING_RATE',units:'USD_PER_HOUR',currency:'USD',scopeText:'Senior Developer'}}]});
test('only exact source excerpts support numerical evidence; mappings stay unreviewed',()=>{
 const s=source(),r=admitExtractedEvidence(raw(),s,'2025-06-30');assert.equal(r.items.length,1);assert.equal(s.status,'ADMITTED');assert.equal(r.items[0].numeric?.qualificationFit,'UNVALIDATED');assert.equal(r.items[0].historicalProof?.publishedAt,'2025-05-01');
 const wrong=raw();wrong.evidence[0].numeric.originalValue=999;assert.equal(admitExtractedEvidence(wrong,source(),'2025-06-30').items.length,0);
 const fabricated=raw();fabricated.evidence[0].excerpt='Senior Developer $500 per hour.';assert.equal(admitExtractedEvidence(fabricated,source(),'2025-06-30').items.length,0);
 const wrongRole=raw();wrongRole.evidence[0].numeric.scopeText='Program Director';assert.equal(admitExtractedEvidence(wrongRole,source(),'2025-06-30').items.length,0);
});
test('future revisions, target outcomes and unsupported dates never become historical evidence',()=>{
 for(const patch of [{kind:'TARGET_OUTCOME'},{publishedAt:'2025-07-01',dateQuote:'Revised July 1, 2025.'},{publishedAt:'',dateQuote:''}]){
  const s=source();s.text+=' Revised July 1, 2025.';assert.equal(admitExtractedEvidence({...raw(),...patch},s,'2025-06-30').items.length,0);assert.equal(s.status,'EXCLUDED');
 }
 const s=source();s.publishedAt='2025-05-01';s.publicationBasis='SAM attachment posted 2025-05-01';s.text+=' Revised July 1, 2025.';
 assert.equal(admitExtractedEvidence({...raw(),publishedAt:'2025-07-01',dateQuote:'Revised July 1, 2025.'},s,'2025-06-30').items.length,0,'old metadata cannot override a later document revision');
 assert.equal(supportedDate('2020-03-01','Issued February 30, 2020.','Issued February 30, 2020.'),false);
});
test('malformed research rows cannot crash a package or promote unsupported claims',()=>{
 const good=raw();
 const s=source();const result=admitExtractedEvidence({...good,evidence:[...good.evidence,{claim:'No usable excerpt',excerpt:''},{claim:'Too short an excerpt',excerpt:'$126'},null,{...good.evidence[0],numeric:{...good.evidence[0].numeric,originalValue:999}}]},s,'2025-06-30');
 assert.equal(result.items.length,1);assert.equal(result.items[0].numeric?.originalValue,126);
 assert.match(s.reason!,/4 unsupported or malformed claims rejected/);
});
test('historical filtering retains a source-backed incumbent and earlier award facts',()=>{
 const a=pricedServicesFixture(),name='Example Incumbent';
 const text=`Issued May 1, 2025. ${a.deal.solicitationNumber}: incumbent ${name}. Predecessor contract awarded to ${name} for $1000.`;
 a.evidence=[{id:'prior',type:'EXTERNAL_SOURCE',sourceLabel:'prior.txt',section:'Page 1',claim:text,excerpt:text,confidence:60,numeric:{originalValue:1000,valueType:'TOTAL_AWARD_VALUE',units:'TOTAL_USD',currency:'USD'}}];
 a.incumbent={name,status:'IDENTIFIED',strengths:[],vulnerabilities:[],transitionRisk:'UNKNOWN',confidence:60,sourceRefs:['prior']};
 const h=historicalContext('2025-06-30',true,[{id:'prior-doc',name:'prior.txt',audit:{kind:'MARKET',publishedAt:'2025-05-01',dateQuote:'Issued May 1, 2025.',proof:'DATED_DOCUMENT',decision:'ADMITTED',reason:'Dated predecessor source.'}} as any]);
 const result=filterHistoricalDraft(a,h,new Map([['prior-doc',text]]));assert.equal(result.incumbent.name,name);assert.equal(result.evidence[0].numeric?.originalValue,1000);
 a.incumbent.sourceRefs=['invented'];assert.equal(filterHistoricalDraft(a,h,new Map([['prior-doc',text]])).incumbent.name,'');
});
test('research checkpoints do not repeat discovery or reads after provider interruption',async()=>{
 let searches=0,reads=0,interpretations=0;
 const a=pricedServicesFixture() as any,state=newResearchState();
 const deps={client:{research:async()=>{searches++;return{analysis:{urls:['https://example.gov/document']},sources:[{url:'https://example.gov/document',title:'Original document'}]};},interpret:async()=>{interpretations++;if(interpretations===1)throw Error('Temporary provider interruption');return raw();}},read:async()=>{reads++;return{buffer:Buffer.from(source().text!+' Source document contains the original government market reference.'),type:'text/plain'};},normalize:async(f:any)=>f,extract:async()=>a,samAttachments:async()=>[]};
 const opts={historical:true,cutoff:'2025-06-30',providedNames:[],originalFiles:[]};
 await advanceResearch(a,state,opts,deps as any);await advanceResearch(a,state,opts,deps as any);
 await assert.rejects(advanceResearch(a,state,opts,deps as any),/interruption/);
 await advanceResearch(a,state,opts,deps as any);assert.equal(searches,1);assert.equal(reads,1);assert.equal(interpretations,2);
 assert.equal(state.sources[0].status,'ADMITTED');
});
test('automatic strategy must succeed before a new prediction is frozen',async(t)=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());
 let strategyCalls=0;
 const {analysis,strategy}=ptwStrategyFixture();analysis.deal.dueDate='2025-06-30';analysis.evidence.find(e=>e.id==='SOL-EVAL')!.sourceLabel='scope.txt';
 const jobs=new PackageJobs(store,{normalize:async f=>f,extract:async()=>analysis as any,research:async()=>analysis,price:async a=>enforceAuthoritativeAnalysis(a),audit:async()=>({kind:'SOLICITATION',publishedAt:'2025-05-01',dateQuote:'Issued May 1, 2025.',decision:'ADMITTED',proof:'DATED_DOCUMENT',reason:'Original'}),strategy:async a=>{strategyCalls++;if(strategyCalls===1)return{status:'UNAVAILABLE',version:'test',reason:'Temporary strategy service failure'};return synthesizePtwStrategy(a,{interpret:async<T>()=>strategy as T});}});
 const bytes=Buffer.from('Issued May 1, 2025. '+analysis.evidence.find(e=>e.id==='SOL-EVAL')!.claim);
 let job=await jobs.create('strategy-test',{mode:'HISTORICAL',cutoff:'2025-06-30',files:[{name:'scope.txt',size:bytes.length}],originalPackageConfirmed:true});await jobs.chunk('strategy-test',job.id,'input-0',0,bytes);
 for(let n=0;n<10&&job.stage!=='STRATEGY';n++)job=await jobs.advance('strategy-test',job.id);
 assert.equal(job.stage,'STRATEGY');assert.equal(await store.get('strategy-test','prediction',analysis.id),null);
 job=await jobs.advance('strategy-test',job.id);assert.equal(job.status,'PAUSED');assert.equal(await store.get('strategy-test','prediction',analysis.id),null);
 job=await jobs.advance('strategy-test',job.id);assert.equal(job.status,'COMPLETE',job.message);
 const frozen=await store.get<any>('strategy-test','prediction',analysis.id);assert.equal(frozen?.value.ptwStrategy?.status,'DRAFT');
});
test('research fetch boundary rejects private addresses including IPv4-mapped IPv6',()=>{
 for(const a of ['127.0.0.1','10.2.3.4','169.254.169.254','172.16.0.1','192.168.1.1','100.100.100.200','::1','::ffff:127.0.0.1','fc00::1'])assert.equal(privateAddress(a),true,a);
 assert.equal(privateAddress('8.8.8.8'),false);
});
test('all admitted clarifications reach one scope reconciliation and later checkpoints remain resumable',async()=>{
 const draft=pricedServicesFixture() as any,state=newResearchState();
 state.phase='READ';state.sources=['one','two'].map(id=>({...source(),id,task:'SOLICITATION' as const,status:'DISCOVERED' as const,url:`https://example.gov/${id}`}));
 let extractions=0;const seen:string[][]=[];
 const deps={client:{research:async()=>{throw Error('Discovery already saved');},interpret:async()=>({...raw(),kind:'SOLICITATION'})},read:async()=>({buffer:Buffer.from(source().text!+' Original source clarification with dated procurement requirements.'),type:'text/plain'}),normalize:async(f:any)=>f,extract:async(files:any[])=>{extractions++;seen.push(files.map(f=>f.originalname));return draft;}};
 const options={historical:true,cutoff:'2025-06-30',providedNames:[],originalFiles:[]};
 for(let i=0;i<4;i++)await advanceResearch(draft,state,options,deps as any);
 assert.equal(extractions,0,'both sources must be read before the full scope is reconciled');
 await advanceResearch(draft,state,options,deps as any);assert.equal(state.phase,'RECONCILE');
 await advanceResearch(draft,state,options,deps as any);assert.equal(extractions,1);assert.equal(seen[0].length,2);
 await advanceResearch(draft,state,options,deps as any);assert.equal(state.index,1);
 // An older deployed checkpoint may already have reconciled one source.
 state.index=0;state.phase='READ';state.reconciledSourceIds=['one'];
 await advanceResearch(draft,state,options,deps as any);assert.equal(state.phase,'RECONCILE');
 await advanceResearch(draft,state,options,deps as any);assert.equal(extractions,2);assert.deepEqual(state.reconciledSourceIds,['one','two']);
});
test('failed benchmark leads trigger a bounded different-source search rather than silently completing',async()=>{
 const draft=pricedServicesFixture() as any,state=newResearchState();draft.deal.title='Grounds maintenance';draft.deal.laborSignals=[];state.index=2;state.phase='READ';state.discoveryPasses={BENCHMARKS:1};
 state.sources=[{...source(),status:'FAILED',reason:'Source HTTP 404.'}];
 const prompts:string[]=[];const deps={client:{research:async(p:string)=>{prompts.push(p);return{analysis:{urls:[]},sources:[]};},interpret:async()=>raw()},normalize:async(f:any)=>f,extract:async()=>draft};
 const opts={historical:true,cutoff:'2025-06-30',providedNames:[],originalFiles:[]};
 await advanceResearch(draft,state,opts,deps as any);assert.equal(state.phase,'DISCOVER');assert.equal(state.done,false);
 await advanceResearch(draft,state,opts,deps as any);assert.match(prompts[0],/RECOVERY SEARCH/);assert.match(prompts[0],/Source HTTP 404/);
 await advanceResearch(draft,state,opts,deps as any);assert.equal(state.done,true);assert.equal(prompts.length,1,'only one recovery search is permitted');assert.equal(state.attempts.some(a=>a.status==='RUNNING'),false);
});
test('reviewed rate discovery leads respect scope and cutoff without admitting prices',()=>{
 const deal=pricedServicesFixture().deal;
 deal.title='Enterprise IT systems support';assert.equal(referenceRateCatalogs(deal,'2025-06-30').length,1);
 assert.equal(referenceRateCatalogs(deal,'2025-04-30').length,0);
 assert.equal('publishedAt' in referenceRateCatalogs(deal,'2025-06-30')[0],false,'catalog date must still be proved from retrieved original');
 const unrelated={...deal,title:'Grounds maintenance',laborSignals:[]};assert.equal(referenceRateCatalogs(unrelated,'2025-06-30').length,0);
});
test('research cannot replace a supplied RFP with an older base or earlier amendment',()=>{
 const supplied=['Alliant 3 RFP A0012 - Version12.pdf','SF30 Amend 0012 Alliant 3.pdf'];
 assert.equal(supplementalAttachment('Alliant 3 RFP 47QTCB24R0009.pdf',supplied),false);
 assert.equal(supplementalAttachment('SF30 Amend 0001 Alliant 3.pdf',supplied),false);
 assert.equal(supplementalAttachment('SF30 Amend 0013 Alliant 3.pdf',supplied),true);
 assert.equal(supplementalAttachment('Questions and Answers June 2025.pdf',supplied),true);
});
test('dated filenames cannot launder a later catalog through an older contract date',()=>{
 const s=source();s.url='https://example.gov/Terms_Conditions_File_111425.pdf';
 assert.equal(sourceVersionAfterCutoff(s.url,'2025-06-30'),true);
 assert.equal(admitExtractedEvidence(raw(),s,'2025-06-30').items.length,0);assert.equal(s.status,'EXCLUDED');
 assert.equal(sourceVersionAfterCutoff('https://example.gov/uploads/2026/03/catalog.pdf','2025-06-30'),true);
 assert.equal(sourceVersionAfterCutoff('https://example.gov/uploads/2025/05/catalog.pdf','2025-06-30'),false);
});
test('saved benchmark sources are reinterpreted with exact rate requirements without repeating downloads',async()=>{
 const a=pricedServicesFixture() as any,state=newResearchState();state.index=2;state.phase='READ';state.done=true;
 state.sources=[{...source(),status:'ADMITTED'}];a.evidence=[];let calls=0;
 const deps={client:{research:async()=>{throw Error('No discovery needed');},interpret:async(p:string)=>{calls++;assert.match(p,/scopeText is REQUIRED/);return raw();}},normalize:async(f:any)=>f,extract:async()=>a};
 const opts={historical:true,cutoff:'2025-06-30',providedNames:[],originalFiles:[]};
 assert.equal(rateRechecks(state,a).length,1);await advanceResearch(a,state,opts,deps as any);assert.equal(state.phase,'INTERPRET');
 const next=await advanceResearch(a,state,opts,deps as any);assert.equal(calls,1);assert.equal(next.draft.evidence[0].numeric?.originalValue,126);assert.equal(state.sources[0].rateExtractionVersion,RATE_EXTRACTION_VERSION);assert.equal(rateRechecks(state,next.draft).length,0);
});
test('a named incumbent fact and exact Q&A excerpt repair missing model reference IDs, while unsupported names stay unknown',()=>{
 const a=pricedServicesFixture() as any;a.incumbent={name:'',status:'UNKNOWN',strengths:[],vulnerabilities:[],transitionRisk:'UNKNOWN',confidence:0,sourceRefs:[]};
 a.deal.facts.push({label:'Incumbent contractor',value:'Example Software LLC',section:'Official Q&A #47',confidence:90});
 a.evidence.push({id:'QA-47',type:'SOLICITATION_FACT',sourceLabel:'Official Q&A',section:'Q47',claim:`Example Software LLC is the incumbent for ${a.deal.solicitationNumber}.`,excerpt:'Example Software LLC - predecessor contract ABC123',confidence:80});
 const r=reconcileSourceFacts(a);assert.equal(r.incumbent.name,'Example Software LLC');assert.ok(r.incumbent.sourceRefs.includes('QA-47'));
 a.evidence=a.evidence.filter((e:any)=>e.id!=='QA-47');assert.equal(reconcileSourceFacts(a).incumbent.name,'');
});
test('a resumed strategy checkpoint rechecks saved unusable rate evidence before freezing',async(t)=>{
 const store=new RecordStore({url:undefined,file:':memory:',hosted:false});t.after(()=>store.close());let strategyCalls=0;
 const a=pricedServicesFixture();const jobs=new PackageJobs(store,{normalize:async f=>f,extract:async()=>a as any,research:async()=>a,price:async x=>enforceAuthoritativeAnalysis(x),intelligenceStep:async(d,s)=>({draft:d,state:{...s,done:s.sources.length===0}}),strategy:async()=>{strategyCalls++;return{status:'UNAVAILABLE',version:'test',reason:'Not expected before rate recheck'};}});
 const bytes=Buffer.from('Public solicitation scope.');let job=await jobs.create('resumed-rate',{mode:'LIVE',files:[{name:'scope.txt',size:bytes.length}]});await jobs.chunk('resumed-rate',job.id,'input-0',0,bytes);
 for(let n=0;n<10&&job.stage!=='STRATEGY';n++)job=await jobs.advance('resumed-rate',job.id);
 assert.equal(job.stage,'STRATEGY');const row=(await store.get<ResearchState>('resumed-rate','package-research',job.id))!;
 await store.put('resumed-rate','package-research',job.id,{...newResearchState(),done:true,index:3,sources:[{...source(),status:'ADMITTED'}]},row.version);
 job=await jobs.advance('resumed-rate',job.id);assert.equal(job.stage,'RESEARCH');assert.equal(strategyCalls,0);assert.equal(job.runId,undefined);
});
