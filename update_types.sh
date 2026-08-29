#!/bin/bash
cat << 'INNER_EOF' >> src/types.ts

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

INNER_EOF

# Now update CompetitorProfile
sed -i 's/differentiators: string\[\]; risks: string\[\]; sourceRefs: string\[\];/differentiators: string\[\]; risks: string\[\]; sourceRefs: string\[\]; demonstratedCapabilities?: string\[\]; deliveryModel?: string; techPlatform?: string; laborShape?: string; partnerEcosystem?: string\[\]; vehicleAccess?: string\[\]; incumbentAdvantage?: string; automationClaims?: string\[\]; costDrivers?: string\[\]; unknowns?: string\[\];/' src/types.ts

# Update OpportunityAnalysis
sed -i 's/meta: AnalysisMeta;/affordability?: AffordabilityAssessment; gaoFindings?: GaoFinding\[\]; preRfpSignals?: PreRfpSignal\[\]; validation?: ValidationRecord; meta: AnalysisMeta;/' src/types.ts
