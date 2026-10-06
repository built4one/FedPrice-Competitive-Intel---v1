import type { OpportunityAnalysis, ValidationValueType } from '../../types';
import { calculateCompetitivePosition } from './competitivePosition';

export function validationPrediction(analysis: OpportunityAnalysis) {
  if (analysis.deal.laborSignals.length) {
    const p=calculateCompetitivePosition(analysis);
    return {expected:p.target,aggressive:p.rangeLow,conservative:p.rangeHigh,complete:p.evaluationComplete,version:p.version,basis:'Total evaluated pricing model'};
  }
  const m=analysis.marketPosition;
  return {expected:m.expected,aggressive:m.aggressive,conservative:m.conservative,complete:m.expected!=null,version:m.formulaVersion,basis:'Supporting total-value market benchmark'};
}

export function comparisonReady(analysis:OpportunityAnalysis, type:ValidationValueType) {
  const p=validationPrediction(analysis);
  return p.complete && p.expected!=null && p.aggressive!=null && p.conservative!=null
    && !['CONTRACT_CEILING','INITIAL_OBLIGATION','CURRENT_OBLIGATIONS'].includes(type);
}

export function preserveValidation(analysis:OpportunityAnalysis) {
  const v=analysis.validation;
  if (!v) return undefined;
  const p=validationPrediction(analysis);
  if (!comparisonReady(analysis,v.actualValueType) || p.expected!==v.predictedExpected
    || p.aggressive!==v.predictedAggressive || p.conservative!==v.predictedConservative)
    return {...v,comparableToPrediction:false,inRange:null,expectedErrorPct:null};
  return v;
}
