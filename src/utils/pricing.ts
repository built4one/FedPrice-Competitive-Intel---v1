import { CLIN, PricingAssumptions, Scenario } from '../types';

export function calculateScenario(
  name: 'Aggressive' | 'Target' | 'Conservative',
  clins: CLIN[],
  assumptions: PricingAssumptions,
  popYears: number
): Scenario {
  let directLabor = 0;

  clins.forEach(clin => {
    clin.laborCategories.forEach(lc => {
      let lcTotal = 0;
      let currentRate = lc.baseRate;
      for (let i = 0; i < popYears; i++) {
        lcTotal += (currentRate * lc.hoursPerFte * lc.fte);
        currentRate = currentRate * (1 + assumptions.escalation);
      }
      directLabor += lcTotal;
    });
  });

  const fringeCost = directLabor * assumptions.fringe;
  const directPlusFringe = directLabor + fringeCost;
  
  const overheadCost = directPlusFringe * assumptions.overhead;
  const directFringeOverhead = directPlusFringe + overheadCost;
  
  const gaCost = directFringeOverhead * assumptions.ga;
  const totalCost = directFringeOverhead + gaCost;
  
  const feeAmount = totalCost * assumptions.fee;
  const totalPrice = totalCost + feeAmount;

  return {
    name,
    assumptions,
    totalCost,
    totalPrice,
    breakdown: {
      directLabor,
      fringeCost,
      overheadCost,
      gaCost,
      feeAmount
    }
  };
}

export function generateScenarios(clins: CLIN[], popYears: number): Scenario[] {
  const aggressiveAssumptions: PricingAssumptions = {
    fringe: 0.28,
    overhead: 0.40,
    ga: 0.08,
    fee: 0.05,
    escalation: 0.02,
  };

  const targetAssumptions: PricingAssumptions = {
    fringe: 0.32,
    overhead: 0.50,
    ga: 0.10,
    fee: 0.07,
    escalation: 0.03,
  };

  const conservativeAssumptions: PricingAssumptions = {
    fringe: 0.35,
    overhead: 0.60,
    ga: 0.12,
    fee: 0.09,
    escalation: 0.04,
  };

  return [
    calculateScenario('Aggressive', clins, aggressiveAssumptions, popYears),
    calculateScenario('Target', clins, targetAssumptions, popYears),
    calculateScenario('Conservative', clins, conservativeAssumptions, popYears),
  ];
}

