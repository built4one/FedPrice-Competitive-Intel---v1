export interface LaborCategory {
  id: string;
  title: string;
  fte: number;
  hoursPerFte: number;
  baseRate: number; // hourly
  gsaCalcBenchmark?: {
    min: number;
    median: number;
    max: number;
  };
}

export interface CLIN {
  id: string;
  name: string;
  laborCategories: LaborCategory[];
}

export interface PricingAssumptions {
  fringe: number;
  overhead: number;
  ga: number;
  fee: number;
  escalation: number; // per year
}

export interface Scenario {
  name: 'Aggressive' | 'Target' | 'Conservative';
  assumptions: PricingAssumptions;
  totalCost: number;
  totalPrice: number;
  breakdown: {
    directLabor: number;
    fringeCost: number;
    overheadCost: number;
    gaCost: number;
    feeAmount: number;
  };
}

export interface CompetitorProfile {
  name: string;
  type: 'Incumbent' | 'Large Prime' | 'Challenger' | 'Mid-Tier';
  estimatedBid: number;
  winProbability: number;
  pricingPosture: 'Aggressive' | 'Market Neutral' | 'Defensive' | 'Premium';
  keyDifferentiator: string;
}

export interface IncumbentVulnerability {
  area: string;
  finding: string;
  severity: 'High' | 'Medium' | 'Low';
  counterStrategy: string;
}

export interface EvidenceItem {
  id: string;
  source: string;
  extractedFact: string;
  confidence: number;
  verified: boolean;
  checksum: string;
}

export interface Opportunity {
  id: string;
  title: string;
  agency: string;
  solicitationNumber: string;
  popYears: number;
  contractType?: string;
  naicsCode?: string;
  dueDate?: string;
  evaluationPosture?: string;
  confidence?: 'High' | 'Medium' | 'Low' | 'Calculating';
  clins: CLIN[];
  scenarios: Scenario[];
  competitors?: CompetitorProfile[];
  vulnerabilities?: IncumbentVulnerability[];
  evidence?: EvidenceItem[];
  status: 'Draft' | 'Analyzed' | 'Approved' | 'Ready for Review' | 'Processing';
  lastUpdated: string;
}

