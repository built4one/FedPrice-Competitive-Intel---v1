import type { OpportunityAnalysis, ValidationValueType } from '../../types';
import { calculateCompetitivePosition } from './competitivePosition';
export function validationPrediction(a:OpportunityAnalysis){
 const f=a.frozenPrediction,p=calculateCompetitivePosition(a);
 return {expected:f?f.target:p.target,aggressive:f?f.low:p.rangeLow,conservative:f?f.high:p.rangeHigh,complete:p.target!=null&&p.basisReconstructed,version:f?.version||p.version,basis:'Frozen recommended evaluated price'};
}
export function comparisonReady(a:OpportunityAnalysis,type:ValidationValueType){const p=validationPrediction(a);return p.complete&&p.expected!=null&&p.aggressive!=null&&p.conservative!=null&&type==='EVALUATED_PRICE';}
export function preserveValidation(a:OpportunityAnalysis){
 const v=a.validation;if(!v)return undefined;const p=validationPrediction(a);
 if(!comparisonReady(a,v.actualValueType)||p.expected!==v.predictedExpected||p.aggressive!==v.predictedAggressive||p.conservative!==v.predictedConservative)return{...v,comparableToPrediction:false,inRange:null,expectedErrorPct:null};
 return v;
}
