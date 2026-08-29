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
  excerpt?: string; url?: string; confidence: number; sourceRecordId?: string;
  retrievedAt?: string; value?: number; units?: string;
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
  rationale: string; differentiators: string[]; risks: string[]; sourceRefs: string[]; demonstratedCapabilities?: string[]; deliveryModel?: string; techPlatform?: string; laborShape?: string; partnerEcosystem?: string[]; vehicleAccess?: string[]; incumbentAdvantage?: string; automationClaims?: string[]; costDrivers?: string[]; unknowns?: string[];
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
export interface ConnectorStatus {
  name: 'SAM.gov' | 'USAspending' | 'GSA CALC+' | 'BLS';
  status: 'SUCCESS' | 'ZERO_RESULTS' | 'INVALID_QUERY' | 'RATE_LIMITED' | 'TIMEOUT' |
    'SOURCE_UNAVAILABLE' | 'AUTH_REQUIRED' | 'ERROR' | 'UNAVAILABLE' | 'SKIPPED';
  recordsFound: number;
  message?: string;
  durationMs?: number;
  attempts?: number;
  retrievedAt?: string;
  querySummary?: string;
}

export interface AnalysisMeta {
  mode: 'MARKET_ONLY' | 'MARKET_AND_COMPANY_DEPRECATED'; model: string; analyzedAt: string;
  researchStatus: 'GROUNDED' | 'SOLICITATION_ONLY' | 'PARTIAL'; warnings: string[];
  connectors?: ConnectorStatus[];
}
export interface OpportunityAnalysis {
  id: string; deal: DealProfile; marketPosition: MarketPosition; competitors: CompetitorProfile[];
  incumbent: IncumbentAssessment; evidence: EvidenceItem[]; gaps: DataGap[];
  guidance: PositioningGuidance;  
  affordability?: AffordabilityAssessment; gaoFindings?: GaoFinding[]; preRfpSignals?: PreRfpSignal[]; validation?: ValidationRecord; meta: AnalysisMeta;
}
export type Opportunity = OpportunityAnalysis;

// Phase 4: Customer & Acquisition Intelligence
export interface AffordabilityAssessment {
  estimatedCeiling?: number;
  budgetSignals: string[];
  obligationsHistory?: string;
  fundingAvailability: 'SECURE' | 'AT_RISK' | 'UNKNOWN';
  confidence: ConfidenceLevel;
}

export interface GaoFinding {
  topic: string;
  implication: string;
  sourceUrl?: string;
  relevanceScore: number;
}

export interface PreRfpSignal {
  type: 'FORECAST' | 'RFI' | 'AMENDMENT' | 'INDUSTRY_DAY';
  date: string;
  summary: string;
  impact: string;
}

export interface ValidationScore {
  range: number; // 40%
  posture: number; // 20%
  structure: number; // 15%
  reasoning: number; // 15%
  evidence: number; // 10%
  total: number;
}

export interface ValidationRecord {
  predictedTarget: number;
  actualAwardValue: number;
  predictedPosture: string;
  actualAwardee: string;
  score: ValidationScore;
  retrospectiveNotes: string;
}

