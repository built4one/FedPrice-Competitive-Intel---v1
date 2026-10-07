import type { PricingScenario } from './domain/ptw/pricingScenario';
import type { PtwStrategyResult } from './domain/ptw/strategy';
import type { CompetitivePosition } from './domain/ptw/competitivePosition';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type EvidenceType = 'SOLICITATION_FACT' | 'EXTERNAL_SOURCE' | 'ANALYST_INFERENCE' | 'DATA_GAP';
export type EstimationMethod =
  | 'DIRECT_GOVERNMENT'
  | 'PREDECESSOR_INCUMBENT'
  | 'COMPARABLE_AWARDS'
  | 'BOTTOM_UP_LABOR'
  | 'PARAMETRIC_ANALOGY'
  | 'NO_RESPONSIBLE_ESTIMATE';

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
export type NumericValueBasis =
  | 'OPPORTUNITY_TOTAL'
  | 'EVALUATED_COMPONENT'
  | 'INDIVIDUAL_AWARD'
  | 'PROGRAM_TOTAL'
  | 'MULTIPLE_AWARD_POOL'
  | 'ORDER_LIMIT'
  | 'PAST_PERFORMANCE_THRESHOLD'
  | 'BUDGET'
  | 'UNKNOWN';
export type CalculationRole = 'CENTRAL_ANCHOR' | 'CONSTRAINT' | 'MODIFIER' | 'COMPONENT' | 'CONTEXT' | 'EXCLUDED';

export interface DealFact { label: string; value: string; section?: string; confidence: number; }
export interface RequirementSignal {
  name: string;
  detail: string;
  category: 'SCOPE' | 'EVALUATION' | 'PRICING' | 'STAFFING' | 'COMPLIANCE' | 'PERFORMANCE';
  section?: string;
  confidence: number;
}
export interface LaborPeriod { label: string; startMonth: number; months: number; quantity: number; annualHours?: number; totalHours?: number; section?: string; }
export interface LaborSignal {
  title: string; quantity?: number; annualHours?: number; location?: string; clearance?: string; section?: string; periods?: LaborPeriod[];
  duties?: string; pwsTitle?: string; qualificationSource?: string; minExperienceYears?: number;
  education?: string; certifications?: string[]; titleConflict?: string;
}

export interface EvaluatedPriceComponent {
  id: string; label: string; category: 'TRAVEL' | 'ODC' | 'MATERIALS' | 'OTHER';
  amount?: number; source: string; evidenceIds: string[];
  indirectPct?: number; indirectTreatment: 'NOT_ALLOWED' | 'KNOWN' | 'UNKNOWN';
  feeAllowed: boolean;
}
/** Separate assumptions are never promoted to sourced numeric evidence. */
export interface PlanningInput {
  id: string; label: string; kind: 'LABOR_RATE' | 'UNIT_PRICE' | 'TOTAL';
  quantity: number; unit: string; quantitySource: string;
  low: number; central: number; high: number;
  basis: 'DOCUMENTED' | 'ANALOGY' | 'PLANNING_ASSUMPTION';
  rationale: string; evidenceIds: string[]; lowerCondition: string; upperCondition: string;
}
export interface EvaluationPricing {
  basis: string; source: string; completeness: 'COMPLETE' | 'PARTIAL';
  components: EvaluatedPriceComponent[];
  extensionRateRule: 'FINAL_OPTION_RATES' | 'ESCALATE' | 'UNKNOWN' | 'NOT_APPLICABLE';
  extensionSource?: string; rateBaseYear?: number;
  unitLines?: Array<{id:string;label:string;quantity:number;unit:string;source:string}>;
}
export interface SourceConflict { topic: string; descriptions: string[]; sources: string[]; resolution: string; status?: 'OPEN' | 'RESOLVED'; }
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
  valueBasis?: NumericValueBasis;
  rangeBound?: 'LOW' | 'HIGH';
  rangeId?: string;
  matchedLaborCategory?: string;
  lowerRate?: number;
  upperRate?: number;
  rateSampleSize?: number;
  rateSampleComplete?: boolean;
  clearanceRequired?: boolean;
  laborMatchScore?: number;
  benchmarkFamily?: string;
  /** Original requested role whose source records passed the adapter's grade and qualification filters. */
  validatedBenchmarkRole?: string;
  qualificationFit?: 'FILTERED_PROXY' | 'UNVALIDATED';
  rateDistribution?: number[];
  rateSampleFingerprint?: string;
  rateRecords?: Array<{id: string; category: string; vendor: string; contract: string; rate: number; experience?: number; education?: string; worksite?: string; clearance?: string;}>;
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

export interface EvaluationScheme {
  method: 'SEALED_BID' | 'LPTA' | 'TRADE_OFF' | 'HIGHEST_TECH_RATED' | 'UNKNOWN';
  priceWeight: 'DOMINANT' | 'SIGNIFICANT' | 'EQUAL' | 'LOW' | 'NONE' | 'UNKNOWN';
  far522178Included: boolean;
  unbalancedPricingChecked: boolean;
  priceRealismChecked: boolean;
  costRealismChecked: boolean;
  sourceRefs: string[];
}

export interface DealProfile {
  documentStatus?: string;
  eligibilityReason?: string;
  eligibilitySource?: string;
  title: string;
  agency: string;
  solicitationNumber: string;
  contractType: string;
  dueDate: string;
  periodOfPerformance: string;
  performanceMonths?: number;
  naics: string;
  setAside?: string;
  psc?: string;
  awardStructure: string;
  evaluationMethod: string;
  evaluationScheme?: EvaluationScheme;
  scopeSummary: string;
  facts: DealFact[];
  requirements: RequirementSignal[];
  laborSignals: LaborSignal[];
  laborModelComplete?: boolean;
  laborModelSource?: string;
  pricingSignals: PricingSignal[];
  evaluationPricing?: EvaluationPricing;
  sourceConflicts?: SourceConflict[];
  planningInputs?: PlanningInput[];
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
  opportunitySpecific?: boolean;
  valueBasis?: NumericValueBasis;
  rangeBound?: 'LOW' | 'HIGH';
  rangeId?: string;
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

export interface PublicMarketBenchmark {
  status: 'SUPPORTED' | 'DIRECTIONAL' | 'NOT_SUPPORTED';
  aggressive: number | null;
  expected: number | null;
  conservative: number | null;
  evidenceIds: string[];
  summary: string;
}

export interface MarketPosition {
  currency: 'USD';
  aggressive: number | null;
  expected: number | null;
  conservative: number | null;
  rangeStatus: 'SUPPORTED' | 'DIRECTIONAL' | 'INSUFFICIENT_EVIDENCE' | 'LEGACY_RECALCULATION_REQUIRED';
  posture: 'AGGRESSIVE' | 'MARKET_ALIGNED' | 'VALUE_LED' | 'UNDETERMINED';
  summary: string;
  estimationMethod: EstimationMethod;
  methodLabel: string;
  confidence: ConfidenceLevel;
  formulaVersion: string;
  publicBenchmark: PublicMarketBenchmark;
  evidenceReadiness: EvidenceReadinessBreakdown;
  anchors: EvaluatedNumericAnchor[];
  effectiveSampleSize: number;
  dispersionPct: number;
  rangeWidthPct: number;
  constraints: string[];
  rangeFactors: string[];
  assumptions: string[];
  verifiedInputs: string[];
  sensitivities: string[];
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
  samDocuments?: Array<{
    name: string;
    url: string;
    provided: boolean;
    type: string;
    retrievalStatus?: 'DISCOVERED' | 'RETRIEVED' | 'PROVIDED' | 'RESTRICTED' | 'UNSUPPORTED' | 'TOO_LARGE' | 'SKIPPED' | 'FAILED';
    sizeBytes?: number;
    mimeType?: string;
    message?: string;
  }>;
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
  competitivePosition?: CompetitivePosition;
  pricingScenario?: PricingScenario;
  ptwStrategy?: PtwStrategyResult;
  storageVersion?: number;
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
