export const MARKET_POSITION_ENGINE_VERSION = 'market-position-v2.0.0';

export const COMPARABILITY_WEIGHTS = {
  scope: 0.25,
  scale: 0.15,
  acquisition: 0.15,
  customer: 0.10,
  period: 0.10,
  naicsPsc: 0.10,
  laborIntensity: 0.05,
  recency: 0.05,
  technologySecurityLocation: 0.05,
} as const;

export const ENGINE_THRESHOLDS = {
  minimumComparability: 0.45,
  minimumEvidenceQuality: 0.55,
  minimumNormalizationConfidence: 0.55,
  supportedReadiness: 60,
  directionalReadiness: 45,
  minimumRangeWidth: 0.05,
  maximumRangeWidth: 0.40,
  oneAnchorMinimumRangeWidth: 0.20,
  twoAnchorMinimumRangeWidth: 0.12,
} as const;
