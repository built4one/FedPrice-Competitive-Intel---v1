import {preservePredictionExports} from './predictionExports';
import crypto from 'node:crypto';
import type {OpportunityAnalysis,ValidationRecord} from '../types';
import {RecordStore,ConflictError} from './store';
import {historicalValidationIssues} from './historical';
export const PREDICTION_VERSION='frozen-prediction-1';
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):v;
export const fingerprint=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function freezeAnalysis(input:OpportunityAnalysis):OpportunityAnalysis {
 const a=structuredClone(input);delete a.historicalReview;delete a.validation;delete a.storageVersion;delete a.frozenPrediction;
 const p=a.competitivePosition;if(!p?.target)throw new Error('Cannot freeze an incomplete recommendation.');
 a.frozenPrediction={id:a.id,hash:fingerprint(a),frozenAt:new Date().toISOString(),version:PREDICTION_VERSION,target:p.target,low:p.rangeLow,high:p.rangeHigh,classification:a.historical?'RETROSPECTIVE_APPROXIMATION':'LIVE_ASSESSMENT'};
 return a;
}
export function verifyFrozen(a:OpportunityAnalysis){const copy=structuredClone(a),f=copy.frozenPrediction;delete copy.historicalReview;delete copy.frozenPrediction;delete copy.validation;delete copy.storageVersion;return Boolean(f&&f.id===copy.id&&f.version===PREDICTION_VERSION&&f.target===copy.competitivePosition?.target&&f.low===copy.competitivePosition?.rangeLow&&f.high===copy.competitivePosition?.rangeHigh&&fingerprint(copy)===f.hash);}
export async function freezeAndStore(store:RecordStore,workspace:string,a:OpportunityAnalysis){
 const old=await store.get<OpportunityAnalysis>(workspace,'prediction',a.id);if(old)return old.value;
 const frozen=freezeAnalysis(a);
 try{return (await store.put(workspace,'prediction',a.id,frozen)).value;}catch(e){if(e instanceof ConflictError){const old=await store.get<OpportunityAnalysis>(workspace,'prediction',a.id);if(old)return old.value;}throw e;}
}
export async function loadPrediction(store:RecordStore,workspace:string,id:string){const row=await store.get<OpportunityAnalysis>(workspace,'prediction',id);if(!row)return null;if(!verifyFrozen(row.value))throw new Error('Frozen prediction integrity check failed.');return row.value;}
export async function withOutcome(store:RecordStore,workspace:string,a:OpportunityAnalysis){const [row,review]=await Promise.all([store.get<ValidationRecord>(workspace,'historical-outcome',a.id),store.get<any>(workspace,'historical-review',a.id)]);return{...a,validation:row?.value,historicalReview:review?.value};}
export async function recordOutcome(store:RecordStore,workspace:string,id:string,raw:any){
 const a=await loadPrediction(store,workspace,id);if(!a)throw new Error('A server-frozen prediction is required before recording an outcome.');
 if(await store.get(workspace,'historical-outcome',id))throw new Error('An outcome is already recorded. The original comparison is preserved.');
 const value=Number(raw.actualValue);if(!Number.isFinite(value)||value<=0)throw new Error('Enter a positive actual evaluated price.');
 const types=['EVALUATED_PRICE','TOTAL_AWARD_VALUE','CONTRACT_CEILING','INITIAL_OBLIGATION','CURRENT_OBLIGATIONS','EVENTUAL_SPEND'];
 if(!types.includes(raw.actualValueType))throw new Error('Choose an actual value type.');
 const source=String(raw.actualSource||'').trim().slice(0,2000);
 const comparable=raw.sameBasis===true&&raw.actualValueType==='EVALUATED_PRICE'&&source.length>5;
 const f=a.frozenPrediction!;
 const review=await store.get<any>(workspace,'historical-review',id);
 const classification=a.historical?(review?.value.predictionHash===f.hash?'VALIDATED_BACKTEST':'RETROSPECTIVE_APPROXIMATION'):'LIVE_ASSESSMENT';
 const v:ValidationRecord={frozenAt:f.frozenAt,predictionHash:f.hash,predictedExpected:f.target,predictedAggressive:f.low,predictedConservative:f.high,actualValue:value,actualValueType:raw.actualValueType,actualAwardee:String(raw.actualAwardee||'').slice(0,300),actualSource:source,comparableToPrediction:comparable,inRange:comparable?value>=f.low!&&value<=f.high!:null,expectedErrorPct:comparable?Math.round(Math.abs(f.target!-value)/value*10000)/100:null,retrospectiveNotes:String(raw.retrospectiveNotes||'').slice(0,5000),comparisonClass:classification};
 await store.put(workspace,'historical-outcome',id,v);const compared={...a,validation:v,historicalReview:review?.value};await preservePredictionExports(store,workspace,compared);return compared;
}
export async function validateHistorical(store:RecordStore,workspace:string,id:string,reviewer:string,confirmed:boolean){
 const a=await loadPrediction(store,workspace,id);if(!a)throw new Error('Freeze the prediction first.');
 if(await store.get(workspace,'historical-outcome',id))throw new Error('Historical qualification must be reviewed before outcome disclosure.');
 const issues=historicalValidationIssues(a);if(issues.length)throw new Error(issues.join(' '));
 if(!confirmed)throw new Error('Confirm the original deadline, source availability and evaluated scope were independently verified without consulting the outcome.');
 return (await store.put(workspace,'historical-review',id,{reviewer,reviewedAt:new Date().toISOString(),predictionHash:a.frozenPrediction!.hash,statement:'Original deadline, pre-cutoff availability, priced quantities and evaluation basis independently reviewed before outcome entry.'})).value;
}
