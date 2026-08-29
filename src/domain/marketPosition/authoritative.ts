import type {
  DecisionNarrative,
  MarketAssessmentDraft,
  MarketPosition,
  OpportunityAnalysis,
  RecommendationDriver,
} from '../../types';
import { calculateDeterministicScenarios } from './scenarioEngine';
import { MARKET_POSITION_ENGINE_VERSION } from './engineConfig';

const currencyClaim = /(?:\$\s?\d[\d,.]*(?:\s?(?:million|billion|m|b))?|\bUSD\s+\d[\d,.]*|\b\d+(?:\.\d+)?\s*(?:million|billion)\b|\b\d{1,3}(?:,\d{3}){2,}\b)/gi;

function scrubText(value: string) {
  return value.replace(currencyClaim, 'the calculated Market Position');
}

export function sanitizeNarrative(narrative?: Partial<DecisionNarrative>): DecisionNarrative {
  return {
    headline: scrubText(narrative.headline || 'Evidence-led Market Position'),
    rationale: scrubText(narrative.rationale || 'Review the authoritative calculation and its evidence.'),
    decisionFactors: (narrative.decisionFactors || []).map(scrubText),
    guardrails: (narrative.guardrails || []).map(scrubText),
    nextActions: (narrative.nextActions || []).map(scrubText),
  };
}

export function sanitizeMarketAssessment(assessment?: Partial<MarketAssessmentDraft>): MarketAssessmentDraft {
  return {
    posture: assessment.posture || 'UNDETERMINED',
    summary: scrubText(assessment.summary || 'Review the authoritative calculation and its evidence.'),
    basis: (assessment.basis || []).map(scrubText),
    drivers: normalizeDrivers(assessment.drivers).map((driver) => ({
      ...driver,
      name: scrubText(driver.name),
      assessment: scrubText(driver.assessment),
    })),
  };
}

export function hasAuthoritativeDollarClaim(narrative: DecisionNarrative) {
  return [
    narrative.headline,
    narrative.rationale,
    ...narrative.decisionFactors,
    ...narrative.guardrails,
    ...narrative.nextActions,
  ].some((value) => {
    currencyClaim.lastIndex = 0;
    return currencyClaim.test(value);
  });
}

export function authoritativeScenarioValues(position: MarketPosition) {
  return {
    aggressive: position.aggressive,
    expected: position.expected,
    conservative: position.conservative,
  } as const;
}

function normalizeDrivers(drivers: unknown): RecommendationDriver[] {
  if (!Array.isArray(drivers)) return [];
  return drivers.map((driver) => {
    const item = driver as Partial<RecommendationDriver> & { score?: number; weight?: number };
    return {
      name: String(item.name || 'Analytical factor'),
      assessment: String(item.assessment || ''),
      evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.map(String) : [],
      inference: item.inference ?? true,
    };
  });
}

export function marketAssessmentFromPosition(position: Partial<MarketPosition>): MarketAssessmentDraft {
  return sanitizeMarketAssessment({
    posture: position.posture || 'UNDETERMINED',
    summary: position.summary || 'Legacy analysis requires recalculation under the current methodology.',
    basis: Array.isArray(position.basis) ? position.basis.map(String) : [],
    drivers: normalizeDrivers(position.drivers),
  });
}

export function createLegacyPosition(position: Partial<MarketPosition> = {}): MarketPosition {
  return {
    currency: 'USD',
    aggressive: null,
    expected: null,
    conservative: null,
    rangeStatus: 'LEGACY_RECALCULATION_REQUIRED',
    posture: 'UNDETERMINED',
    summary: position.summary || 'This saved run predates the evidence-weighted calculation engine.',
    formulaVersion: 'legacy-unverified',
    evidenceReadiness: {
      score: 0,
      comparability: 0,
      evidenceQuality: 0,
      normalizationConfidence: 0,
      effectiveQuantity: 0,
      sourceDiversity: 0,
      consistency: 0,
      gapResolution: 0,
    },
    anchors: [],
    effectiveSampleSize: 0,
    dispersionPct: 0,
    rangeWidthPct: 0,
    constraints: [],
    rangeFactors: ['Recalculate this run before using its numeric Market Position.'],
    assumptions: [],
    basis: Array.isArray(position.basis) ? position.basis.map(String) : [],
    drivers: normalizeDrivers(position.drivers),
  };
}

export function enforceAuthoritativeAnalysis(analysis: OpportunityAnalysis): OpportunityAnalysis {
  const analyzedAt = analysis.meta?.analyzedAt;
  if (!analyzedAt || Number.isNaN(Date.parse(analyzedAt))) {
    throw new Error('Analysis metadata must include a valid analyzedAt date.');
  }
  const currentPosition = analysis.marketPosition || createLegacyPosition();
  const marketAssessment = marketAssessmentFromPosition(currentPosition);
  const marketPosition = calculateDeterministicScenarios({
    deal: analysis.deal,
    evidence: analysis.evidence || [],
    gaps: analysis.gaps || [],
    marketAssessment,
  }, { asOfDate: analyzedAt });
  return {
    ...analysis,
    marketPosition,
    narrative: sanitizeNarrative(analysis.narrative || {
      headline: 'Evidence-led Market Position',
      rationale: 'Review the authoritative calculation and its evidence.',
      decisionFactors: [],
      guardrails: [],
      nextActions: [],
    }),
    meta: {
      ...analysis.meta,
      warnings: [...new Set(analysis.meta.warnings || [])],
    },
  };
}

export function isCurrentEngine(position?: Partial<MarketPosition>) {
  return position?.formulaVersion === MARKET_POSITION_ENGINE_VERSION;
}
