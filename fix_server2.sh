sed -i '/const analysis: OpportunityAnalysis = {/i \  const scenarios = calculateDeterministicScenarios(base); base.marketPosition = { ...base.marketPosition, ...scenarios };' server.ts
