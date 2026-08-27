export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type EvidenceType = 'SOLICITATION_FACT' | 'EXTERNAL_SOURCE' | 'ANALYST_INFERENCE' | 'DATA_GAP';

export interface DealFact { label: string; value: string; section?: string; confidence: number; }
export interface RequirementSignal {
  name: string; detail: string;
  category: 'SCOPE' | 'EVALUATION' | 'PRICING' | 'STAFFING' | 'COMPLIANCE' | 'PERFORMANCE';
  section?: string; confidence: number;
}
export interface LaborSignal { title: string; quantity?: number; annualHours?: number; location?: string; clearance?: string; section?: string; }
export interface PricingSignal { signal: string; implication: string; section?: string; confidence: number; }
export interface EvidenceItem {
  id: string; type: EvidenceType; sourceLabel: string; section?: string; claim: string;
  excerpt?: string; url?: string; confidence: number;
}
export interface DataGap { question: string; impact: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; }

export interface DealProfile {
  title: string; agency: string; solicitationNumber: string; contractType: string; dueDate: string;
  periodOfPerformance: string; naics: string; awardStructure: string; evaluationMethod: string;
  scopeSummary: string; facts: DealFact[]; requirements: RequirementSignal[];
  laborSignals: LaborSignal[]; pricingSignals: PricingSignal[];
}

export interface RecommendationDriver {
  name: string; score: number; weight: number; assessment: string; evidenceIds: string[];
}
export interface MarketPosition {
  currency: 'USD'; low: number; target: number; high: number;
  rangeStatus: 'SUPPORTED' | 'DIRECTIONAL' | 'INSUFFICIENT';
  posture: 'AGGRESSIVE' | 'MARKET_ALIGNED' | 'VALUE_LED' | 'UNDETERMINED';
  summary: string; confidence: ConfidenceLevel; confidenceScore: number; attractivenessScore: number;
  basis: string[]; drivers: RecommendationDriver[];
}
export interface CompetitorProfile {
  name: string; role: 'INCUMBENT' | 'LIKELY_PRIME' | 'CHALLENGER' | 'POSSIBLE_BIDDER';
  likelihood: number; pricingPosture: 'AGGRESSIVE' | 'MARKET_ALIGNED' | 'PREMIUM' | 'UNKNOWN';
  rationale: string; differentiators: string[]; risks: string[]; sourceRefs: string[];
  confidence: number; evidenceType: 'EXTERNAL_SOURCE' | 'ANALYST_INFERENCE';
}
export interface IncumbentAssessment {
  name: string; status: 'IDENTIFIED' | 'POSSIBLE' | 'UNKNOWN'; strengths: string[]; vulnerabilities: string[];
  transitionRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'; confidence: number; sourceRefs: string[];
}
export interface PositioningGuidance {
  headline: string; targetPrice: number; rangeLow: number; rangeHigh: number; position: string;
  rationale: string; winConditions: string[]; guardrails: string[]; nextActions: string[];
}
export interface CompanyContext {
  companyName: string; estimatedPrice?: number; costBaseline?: number; targetMarginPct?: number;
  riskPosture: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE'; differentiators: string; constraints: string;
}
export interface CompanyPosition {
  effectivePrice?: number; impliedMarginPct?: number; deltaToMarketPct?: number;
  bandPosition: 'BELOW_MARKET' | 'IN_MARKET_BAND' | 'ABOVE_MARKET' | 'UNPRICED' | 'MARKET_RANGE_UNAVAILABLE';
  fitScore: number; assessment: string; recommendedAction: string;
}
export interface ConnectorStatus {
  name: 'SAM.gov' | 'USAspending' | 'GSA CALC+' | 'BLS';
  status: 'SUCCESS' | 'ERROR' | 'UNAVAILABLE' | 'SKIPPED';
  recordsFound: number;
  message?: string;
}

export interface AnalysisMeta {
  mode: 'MARKET_ONLY' | 'MARKET_AND_COMPANY'; model: string; analyzedAt: string;
  researchStatus: 'GROUNDED' | 'SOLICITATION_ONLY' | 'PARTIAL'; warnings: string[];
  connectors?: ConnectorStatus[];
}
export interface OpportunityAnalysis {
  id: string; deal: DealProfile; marketPosition: MarketPosition; competitors: CompetitorProfile[];
  incumbent: IncumbentAssessment; evidence: EvidenceItem[]; gaps: DataGap[];
  guidance: PositioningGuidance; companyContext?: CompanyContext; companyPosition?: CompanyPosition;
  meta: AnalysisMeta;
}
export type Opportunity = OpportunityAnalysis;

