import type { PtwStrategy, StrategyStatement } from '../domain/ptw/strategy';
import { opportunityAnalysisFixture } from './opportunityAnalysis';

// Entirely synthetic evaluation fixture. No IBM data or actual bid intelligence.
export function ptwStrategyFixture() {
  const analysis = opportunityAnalysisFixture();
  analysis.evidence.push({id:'SOL-EVAL',type:'SOLICITATION_FACT',sourceLabel:'Synthetic section M',section:'M.3',claim:'Technical merit and transition continuity receive significant consideration in a best-value tradeoff.',confidence:90});
  const fact = (text: string): StrategyStatement => ({text,kind:'FACT',evidenceIds:['SOL-EVAL'],validationAction:''});
  const inference = (text: string): StrategyStatement => ({text,kind:'INFERENCE',evidenceIds:['SOL-EVAL'],validationAction:'Confirm the section M interpretation with the Federal Pricer.'});
  const assumption = (text: string): StrategyStatement => ({text,kind:'ASSUMPTION',evidenceIds:[],validationAction:'Validate against the staffing plan and the performance work statement.'});
  const strategy: PtwStrategy = {
    buyingDecision:{evaluationMethod:fact('Best-value tradeoff applies.'),priceTradeoff:inference('Continuity may justify additional transition effort if the evaluator recognizes the benefit.'),complianceGates:[assumption('Service coverage must be maintained during transition.')]},
    competitors:[],
    options:[
      {id:'continuity',name:'Stage the transition around service continuity',winLogic:inference('Reduce transition disruption in an evaluation that values continuity.'),evaluationAdvantage:inference('Demonstrable transition controls could strengthen the technical assessment.'),deliveryChanges:[assumption('Retain overlap between outgoing and incoming teams during critical handovers.')],pricingLevers:[assumption('Concentrate transition effort on critical services, then remove overlap after acceptance.')],likelyRivalResponse:assumption('An incumbent may emphasize its avoidance of transition disruption.'),principalRisk:assumption('Overlap effort may increase evaluated price without a corresponding evaluated benefit.')},
      {id:'lean',name:'Consolidate operations after validating service coverage',winLogic:assumption('A shared operations model could reduce recurring delivery effort.'),evaluationAdvantage:assumption('A demonstrated service model may meet requirements with fewer handoffs.'),deliveryChanges:[assumption('Combine support queues where the performance work statement permits.')],pricingLevers:[assumption('Reduce duplicated effort only after the service coverage test passes.')],likelyRivalResponse:assumption('Rivals may challenge the credibility of reduced coverage.'),principalRisk:assumption('Consolidation could weaken service performance or proposal credibility.')},
    ],
    recommendation:{selectedOptionId:'continuity',rationale:inference('Prefer staged continuity while the lean model lacks demonstrated service coverage.'),alternatives:[{optionId:'lean',reason:assumption('The efficiency case is conditional on an untested coverage model.')}],changeTriggers:[assumption('Switch emphasis if a tested consolidated model meets every coverage requirement.')],nextActions:[assumption('Build both staffing profiles and compare their evaluated prices using approved rates.')]},
    missingInputs:['Approved staffing profiles, productive hours, proposed rates, non-labor costs, and the evaluated-price schedule.'],
  };
  return {analysis,strategy};
}
