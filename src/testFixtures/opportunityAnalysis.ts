import { calculateDeterministicScenarios } from '../domain/marketPosition/scenarioEngine';
import type { AiAnalysisDraft, OpportunityAnalysis } from '../types';

const analyzedAt = '2026-09-01T12:00:00.000Z';

export function opportunityAnalysisFixture(): OpportunityAnalysis {
  const draft: AiAnalysisDraft = {
    deal: {
      title: 'Enterprise Technology Modernization and Mission Support Services',
      agency: 'Example Federal Agency',
      solicitationNumber: 'EXAMPLE-26-001',
      contractType: 'Firm-Fixed-Price',
      dueDate: '2026-10-01',
      periodOfPerformance: '5 years',
      naics: '541512',
      psc: 'DA01',
      awardStructure: 'Single award',
      evaluationMethod: 'Best value tradeoff',
      scopeSummary: 'Cloud engineering, cybersecurity, data modernization, and operations.',
      facts: [],
      requirements: [],
      laborSignals: [],
      pricingSignals: [],
    },
    marketAssessment: {
      posture: 'MARKET_ALIGNED',
      summary: 'Official opportunity evidence supports a directional planning position.',
      basis: ['Official solicitation estimate'],
      drivers: [],
    },
    competitors: [],
    incumbent: {
      name: '',
      status: 'UNKNOWN',
      strengths: [],
      vulnerabilities: [],
      transitionRisk: 'UNKNOWN',
      confidence: 0,
      sourceRefs: [],
    },
    evidence: [{
      id: 'SOL-1',
      type: 'SOLICITATION_FACT',
      sourceLabel: 'Official Solicitation',
      section: 'B.2',
      claim: 'The government estimates an individual award value of $80,000,000.',
      confidence: 99,
      numeric: {
        originalValue: 80_000_000,
        valueType: 'ESTIMATED_VALUE',
        currency: 'USD',
        units: 'TOTAL_USD',
        opportunitySpecific: true,
        valueBasis: 'INDIVIDUAL_AWARD',
        periodMonths: 60,
      },
    }],
    gaps: [{
      question: 'What staffing mix will bidders use?',
      impact: 'Labor mix could change the competitive position.',
      priority: 'HIGH',
    }],
    narrative: {
      headline: 'Use the government estimate as the current planning center.',
      rationale: 'The official estimate is the strongest verified value basis currently available.',
      decisionFactors: ['The value is opportunity-specific and stated by the government.'],
      guardrails: ['Validate staffing, ODCs, and fee before bid approval.'],
      nextActions: ['Confirm the pricing schedule and staffing quantities.'],
    },
  };

  return {
    id: 'run-export-fixture',
    deal: draft.deal,
    marketPosition: calculateDeterministicScenarios(draft, { asOfDate: analyzedAt }),
    competitors: draft.competitors,
    incumbent: draft.incumbent,
    evidence: draft.evidence,
    gaps: draft.gaps,
    narrative: draft.narrative,
    meta: {
      mode: 'MARKET_ONLY',
      model: 'test',
      analyzedAt,
      researchStatus: 'SOLICITATION_ONLY',
      warnings: [],
      connectors: [
        { name: 'SAM.gov', status: 'SUCCESS', recordsFound: 1 },
        { name: 'USAspending', status: 'ZERO_RESULTS', recordsFound: 0 },
        { name: 'GSA CALC+', status: 'ZERO_RESULTS', recordsFound: 0 },
        { name: 'BLS', status: 'SUCCESS', recordsFound: 1 },
      ],
    },
  };
}
