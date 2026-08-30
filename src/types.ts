export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type EvidenceType = 'SOLICITATION_FACT' | 'EXTERNAL_SOURCE' | 'ANALYST_INFERENCE' | 'DATA_GAP';

export type NumericValueType =
  | 'EVALUATED_PRICE'
  | 'ESTIMATED_VALUE'
  | 'TOTAL_AWARD_VALUE'
  | 'CURRENT_AWARD_AMOUNT'
  | 'CONTRACT_CEILING'
  | 'INITIAL_OBLIGATION'
  | 'CURRENT_OBLIGATIONS'
  | 'EVENTUAL_SPEND'
  | 'HOURLY_CEILING_RATE'
  | 'ESCALATION_RATE'
  | 'BUDGET_CONTEXT'
  | 'UNKNOWN';

export type NumericUnits = 'TOTAL_USD' | 'USD_PER_HOUR' | 'PERCENT' | 'OTHER';
export type CalculationRole = 'CENTRAL_ANCHOR' | 'CONSTRAINT' | 'MODIFIER' | 'COMPONENT' | 'CONTEXT' | 'EXCLUDED';

export interface DealFact { label: string; value: string; section?: string; confidence: number; }
export interface RequirementSignal {
  name: string;
  detail: string;
  category: 'SCOPE' | 'EVALUATION' | 'PRICING' | 'STAFFING' | 'COMPLIANCE' | 'PERFORMANCE';
  section?: string;
  confidence: number;
}
export interface LaborSignal { title: string; quantity?: number; annualHours?: number; location?: string; clearance?: string; section?: string; }
export interface PricingSignal { signal: string; implication: string; section?: string; confidence: number; }

export interface NumericEvidence {
  originalValue: number;
  valueType: NumericValueType;
  currency: 'USD' | 'UNKNOWN';
  units: NumericUnits;
  periodMonths?: number;
  baseYear?: number;
  quantity?: number;
  targetQuantity?: number;
  sourceDate?: string;
  endDate?: string;
  agency?: string;
  naics?: string;
  psc?: string;
  contractType?: string;
  acquisitionStructure?: string;
  scopeText?: string;
  laborIntensity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  technologySecurityLocation?: string;
  opportunitySpecific?: boolean;
  recurringService?: boolean;
  scalableByQuantity?: boolean;
  sharedAcrossAwards?: boolean;
}

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  sourceLabel: string;
  section?: string;
  claim: string;
  excerpt?: string;
  url?: string;
  confidence: number;
  sourceRecordId?: string;
  retrievedAt?: string;
  numeric?: NumericEvidence;
  /** Legacy fields are retained only so older saved runs can be detected and migrated safely. */
  value?: number;
  units?: string;
}

export interface DataGap { question: string; impact: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; }

export interface DealProfile {
  title: string;
  agency: string;
  solicitationNumber: string;
  contractType: string;
  dueDate: string;
  periodOfPerformance: string;
  naics: string;
  psc?: string;
  awardStructure: string;
  evaluationMethod: string;
  scopeSummary: string;
  facts: DealFact[];
  requirements: RequirementSignal[];
  laborSignals: LaborSignal[];
  pricingSignals: PricingSignal[];
}

export interface RecommendationDriver {
  name: string;
  assessment: string;
  evidenceIds: string[];
  inference: boolean;
}

export interface ComparabilityBreakdown {
  scope: number | null;
  scale: number | null;
  acquisition: number | null;
  customer: number | null;
  period: number | null;
  naicsPsc: number | null;
  laborIntensity: number | null;
  recency: number | null;
  technologySecurityLocation: number | null;
  coverage: number;
}

export interface NormalizationStep {
  type: 'PERIOD' | 'QUANTITY' | 'ESCALATION';
  factor: number;
  rationale: string;
  evidenceIds: string[];
}

export interface EvaluatedNumericAnchor {
  id: string;
  evidenceId: string;
  sourceLabel: string;
  originalValue: number;
  normalizedValue: number | null;
  valueType: NumericValueType;
  units: NumericUnits;
  role: CalculationRole;
  comparabilityScore: number;
  comparability: ComparabilityBreakdown;
  evidenceQuality: number;
  normalizationConfidence: number;
  weight: number;
  included: boolean;
  inclusionRationale?: string;
  exclusionReasons: string[];
  normalizationSteps: NormalizationStep[];
  evidenceIds: string[];
}

export interface EvidenceReadinessBreakdown {
  score: number;
  comparability: number;
  evidenceQuality: number;
  normalizationConfidence: number;
  effectiveQuantity: number;
  sourceDiversity: number;
  consistency: number;
  gapResolution: number;
}

export interface MarketPosition {
  currency: 'USD';
  aggressive: number | null;
  expected: number | null;
  conservative: number | null;
  rangeStatus: 'SUPPORTED' | 'DIRECTIONAL' | 'INSUFFICIENT_EVIDENCE' | 'LEGACY_RECALCULATION_REQUIRED';
  posture: 'AGGRESSIVE' | 'MARKET_ALIGNED' | 'VALUE_LED' | 'UNDETERMINED';
  summary: string;
  formulaVersion: string;
  evidenceReadiness: EvidenceReadinessBreakdown;
  anchors: EvaluatedNumericAnchor[];
  effectiveSampleSize: number;
  dispersionPct: number;
  rangeWidthPct: number;
  constraints: string[];
  rangeFactors: string[];
  assumptions: string[];
  basis: string[];
  drivers: RecommendationDriver[];
}

export interface CompetitorProfile {
  name: string;
  role: 'INCUMBENT' | 'LIKELY_PRIME' | 'CHALLENGER' | 'POSSIBLE_BIDDER';
  likelihood?: number;
  pricingPosture: 'AGGRESSIVE' | 'MARKET_ALIGNED' | 'PREMIUM' | 'UNKNOWN';
  rationale: string;
  differentiators: string[];
  risks: string[];
  sourceRefs: string[];
  demonstratedCapabilities?: string[];
  deliveryModel?: string;
  techPlatform?: string;
  laborShape?: string;
  partnerEcosystem?: string[];
  vehicleAccess?: string[];
  incumbentAdvantage?: string;
  automationClaims?: string[];
  costDrivers?: string[];
  unknowns?: string[];
  confidence: number;
  evidenceType: 'EXTERNAL_SOURCE' | 'ANALYST_INFERENCE';
}

export interface IncumbentAssessment {
  name: string;
  status: 'IDENTIFIED' | 'POSSIBLE' | 'UNKNOWN';
  strengths: string[];
  vulnerabilities: string[];
  transitionRisk: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  confidence: number;
  sourceRefs: string[];
}

export interface DecisionNarrative {
  headline: string;
  rationale: string;
  decisionFactors: string[];
  guardrails: string[];
  nextActions: string[];
}

export interface ConnectorStatus {
  name: 'SAM.gov' | 'USAspending' | 'GSA CALC+' | 'BLS';
  status: 'SUCCESS' | 'CACHED' | 'ZERO_RESULTS' | 'INVALID_QUERY' | 'RATE_LIMITED' | 'TIMEOUT' |
    'SOURCE_UNAVAILABLE' | 'AUTH_REQUIRED' | 'ERROR' | 'UNAVAILABLE' | 'SKIPPED';
  recordsFound: number;
  message?: string;
  durationMs?: number;
  attempts?: number;
  retrievedAt?: string;
  querySummary?: string;
  samDocuments?: { name: string; url: string; provided: boolean; type: string }[];
}

export interface AnalysisMeta {
  mode: 'MARKET_ONLY' | 'MARKET_AND_COMPANY_DEPRECATED';
  model: string;
  analyzedAt: string;
  researchStatus: 'GROUNDED' | 'SOLICITATION_ONLY' | 'PARTIAL';
  warnings: string[];
  connectors?: ConnectorStatus[];
}

export interface AffordabilityAssessment {
  estimatedCeiling?: number;
  budgetSignals: string[];
  obligationsHistory?: string;
  fundingAvailability: 'SECURE' | 'AT_RISK' | 'UNKNOWN';
  confidence: ConfidenceLevel;
  evidenceIds?: string[];
}

export interface GaoFinding {
  topic: string;
  implication: string;
  sourceUrl?: string;
  relevanceScore: number;
  evidenceIds?: string[];
}

export interface PreRfpSignal {
  type: 'FORECAST' | 'RFI' | 'AMENDMENT' | 'INDUSTRY_DAY';
  date: string;
  summary: string;
  impact: string;
  evidenceIds?: string[];
}

export type ValidationValueType = 'EVALUATED_PRICE' | 'CONTRACT_CEILING' | 'TOTAL_AWARD_VALUE' | 'INITIAL_OBLIGATION' | 'CURRENT_OBLIGATIONS' | 'EVENTUAL_SPEND';

export interface ValidationRecord {
  frozenAt: string;
  predictionHash: string;
  predictedExpected: number | null;
  predictedAggressive: number | null;
  predictedConservative: number | null;
  actualValue: number;
  actualValueType: ValidationValueType;
  comparableToPrediction: boolean;
  actualAwardee: string;
  inRange: boolean | null;
  expectedErrorPct: number | null;
  retrospectiveNotes: string;
}

export interface OpportunityAnalysis {
  id: string;
  deal: DealProfile;
  marketPosition: MarketPosition;
  competitors: CompetitorProfile[];
  incumbent: IncumbentAssessment;
  evidence: EvidenceItem[];
  gaps: DataGap[];
  narrative: DecisionNarrative;
  affordability?: AffordabilityAssessment;
  gaoFindings?: GaoFinding[];
  preRfpSignals?: PreRfpSignal[];
  validation?: ValidationRecord;
  meta: AnalysisMeta;
}

export interface MarketAssessmentDraft {
  posture: MarketPosition['posture'];
  summary: string;
  basis: string[];
  drivers: RecommendationDriver[];
}

export interface AiAnalysisDraft {
  deal: DealProfile;
  marketAssessment: MarketAssessmentDraft;
  competitors: CompetitorProfile[];
  incumbent: IncumbentAssessment;
  evidence: EvidenceItem[];
  gaps: DataGap[];
  narrative: DecisionNarrative;
  affordability?: AffordabilityAssessment;
  gaoFindings?: GaoFinding[];
  preRfpSignals?: PreRfpSignal[];
}

export type Opportunity = OpportunityAnalysis;
