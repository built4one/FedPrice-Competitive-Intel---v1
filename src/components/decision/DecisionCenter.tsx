import type {OpportunityAnalysis} from '../../types';
import CompetitiveRecommendation from './CompetitiveRecommendation';
export default function DecisionCenter({analysis}:{analysis:OpportunityAnalysis;onGenerateStrategy?:()=>void;generatingStrategy?:boolean}) {
  return <CompetitiveRecommendation analysis={analysis}/>;
}
