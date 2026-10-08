import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import type {OpportunityAnalysis} from '../types';
import {createExecutivePdf} from '../exports/executivePdf';
import {addCompetitiveWorkbook} from '../exports/competitiveWorkbook';
import {RecordStore,ConflictError} from './store';
interface Artifact {bytes:string;sha256:string;predictionHash:string;createdAt:string;format:'pdf'|'xlsx'}
export async function preservePredictionExports(store:RecordStore,workspace:string,a:OpportunityAnalysis){
 if(!a.frozenPrediction)return;
 const suffix=a.validation?'comparison':a.historicalReview?'reviewed':'prediction';
 for(const format of ['pdf','xlsx'] as const){
  const id=`${a.id}:${suffix}:${format}`;
  if(await store.get(workspace,'prediction-export',id))continue;
  let buffer:Buffer;
  if(format==='pdf')buffer=await createExecutivePdf(a);
  else{
   const w=new ExcelJS.Workbook();w.creator='Federal Market Position';
   w.addWorksheet('Executive Decision').columns=[{header:'Field',key:'field',width:44},{header:'Value',key:'value',width:105}];addCompetitiveWorkbook(w,a);
   const evidence=w.addWorksheet('Evidence Ledger');evidence.columns=[{header:'ID',key:'id',width:24},{header:'Source',key:'source',width:70},{header:'Claim',key:'claim',width:100},{header:'Exact excerpt',key:'excerpt',width:110},{header:'Original value',key:'value',width:22},{header:'Value type',key:'type',width:28},{header:'Publication',key:'date',width:20}];
   a.evidence.forEach(e=>evidence.addRow({id:e.id,source:`${e.sourceLabel} ${e.section||''}`,claim:e.claim,excerpt:e.excerpt,value:e.numeric?.originalValue,type:e.numeric?.valueType,date:e.historicalProof?.publishedAt}));
   w.eachSheet(s=>{s.views=[{state:'frozen',ySplit:1}];s.getRow(1).font={bold:true};});buffer=Buffer.from(await w.xlsx.writeBuffer());
  }
  const value:Artifact={bytes:buffer.toString('base64'),sha256:crypto.createHash('sha256').update(buffer).digest('hex'),predictionHash:a.frozenPrediction.hash,createdAt:new Date().toISOString(),format};
  try{await store.put(workspace,'prediction-export',id,value);}catch(e){if(!(e instanceof ConflictError))throw e;}
 }
}
export async function predictionExport(store:RecordStore,workspace:string,a:OpportunityAnalysis,format:'pdf'|'xlsx'){
 await preservePredictionExports(store,workspace,a);
 const suffix=a.validation?'comparison':a.historicalReview?'reviewed':'prediction';
 const artifact=(await store.get<Artifact>(workspace,'prediction-export',`${a.id}:${suffix}:${format}`))!.value;
 const bytes=Buffer.from(artifact.bytes,'base64');if(crypto.createHash('sha256').update(bytes).digest('hex')!==artifact.sha256||artifact.predictionHash!==a.frozenPrediction!.hash)throw new Error('Saved export integrity check failed.');return bytes;
}
