import { opportunityAnalysisFixture } from './opportunityAnalysis';
import { enforceAuthoritativeAnalysis } from '../domain/marketPosition/authoritative';
import { benchmarkRole, laborFamily } from '../domain/laborMatching';

// Synthetic services fixture with a Navy-shaped ramp; no real solicitation/rate
// package or winning outcome is represented by these invented role economics.
export function pricedServicesFixture(){
  const a=opportunityAnalysisFixture();
  a.id='synthetic-priced-services';
  a.meta.analyzedAt='2026-10-06T04:00:00.000Z';
  a.deal.title='SYNTHETIC - Secure Enterprise Services';a.deal.solicitationNumber='SYNTHETIC-27-R-001';
  a.deal.setAside='Total small business';a.deal.naics='518210';a.deal.performanceMonths=66;a.deal.periodOfPerformance='Five years plus six-month extension';
  a.deal.evaluationMethod='Offers ranked by lowest price first; evaluate clearance and past performance until enough qualifying offers are identified.';
  a.deal.requirements=[{name:'Facility clearance',detail:'Active Top Secret facility clearance is required.',category:'COMPLIANCE',section:'Synthetic Section M',confidence:99},{name:'Past performance',detail:'Preferred cohort requires Substantial Confidence; fallback branches require source-selection review.',category:'EVALUATION',section:'Synthetic Section M',confidence:99}];
  const titles=['Systems Administrator','Help Desk','Records Manager','Software Engineer','Project Manager II','Conditional Access Policy Manager','Cloud Application Admin','Configuration Manager','E-Discovery Administrator','Information Assurance Analyst','Network Analyst','Network Engineer','Financial Specialist','Personnel Security Specialist','Cloud Architect','Database Administrator'];
  const quantities=[20,12,8,8,6,5,5,4,4,3,3,2,1,1,1,1];
  a.deal.laborModelComplete=true;a.deal.laborModelSource='Synthetic complete pricing schedule';
  a.deal.laborSignals=titles.map((title,i)=>({title,clearance:'Top Secret',location:'Government site',section:`Synthetic Pricing!A${i+2}`,duties:`${title} delivery responsibilities`,qualificationSource:`Synthetic PWS role ${i+1}`,minExperienceYears:i===4?8:3,
    periods:Array.from({length:6},(_,year)=>{const quantity=quantities[i]+(i===15 ? year>=2 && year<5 ? 27 : year===5 ? 8 : 0 : 0);return {label:year<5?`Year ${year+1}`:'Six-month extension',startMonth:year*12,months:year===5?6:12,quantity,totalHours:quantity*(year===5?960:1920),section:`Synthetic Pricing!period${year+1}/row${i+2}`};})}));
  a.evidence=a.deal.laborSignals.map((s,i)=>({id:`SYN-RATE-${i+1}`,type:'EXTERNAL_SOURCE' as const,sourceLabel:'Synthetic public-rate fixture',section:'Synthetic rate statistics',claim:`Illustrative rates for ${s.title}; not a retrieved market source.`,confidence:70,
    numeric:{originalValue:140+i,lowerRate:100+i,upperRate:160+i,valueType:'HOURLY_CEILING_RATE' as const,units:'USD_PER_HOUR' as const,currency:'USD' as const,scopeText:s.title,matchedLaborCategory:s.title,benchmarkFamily:laborFamily(benchmarkRole(s)),rateSampleSize:5,rateDistribution:[80+i,100+i,140+i,160+i,180+i],rateSampleComplete:true,clearanceRequired:true,laborMatchScore:.85}}));
  a.evidence.push({id:'SYN-TRAVEL',type:'SOLICITATION_FACT',sourceLabel:'Synthetic solicitation',section:'Synthetic Section M',claim:'Include the specified $20,000 travel allowance; no travel fee is allowed.',confidence:99,numeric:{originalValue:20000,valueType:'BUDGET_CONTEXT',units:'TOTAL_USD',currency:'USD',valueBasis:'BUDGET'}} as any);
  a.evidence.push({id:'SYN-ECI',type:'EXTERNAL_SOURCE',sourceLabel:'Synthetic escalation fixture',claim:'Historical ECI planning proxy 3.4 percent.',confidence:80,numeric:{originalValue:3.4,valueType:'ESCALATION_RATE',units:'PERCENT',currency:'UNKNOWN'}} as any);
  a.evidence.push({id:'SYN-CEILING',type:'SOLICITATION_FACT',sourceLabel:'Synthetic solicitation',section:'Synthetic Section B',claim:'Program ceiling is separate from the evaluated-price basket.',confidence:99,numeric:{originalValue:99000000,valueType:'CONTRACT_CEILING',units:'TOTAL_USD',currency:'USD',valueBasis:'MULTIPLE_AWARD_POOL',sharedAcrossAwards:true}} as any);
  a.deal.evaluationPricing={basis:'Sum all supplied labor hours and specified travel; include the six-month extension at final-option rates.',source:'Synthetic Section M',completeness:'COMPLETE',extensionRateRule:'FINAL_OPTION_RATES',extensionSource:'Synthetic FAR extension language',components:[{id:'travel',label:'All-period specified travel',category:'TRAVEL',amount:20000,source:'Synthetic Section M',evidenceIds:['SYN-TRAVEL'],indirectTreatment:'NOT_ALLOWED',feeAllowed:false}]};
  a.gaps=[];a.meta.warnings=['SYNTHETIC TEST DATA - no real procurement or company costs'];
  a.meta.connectors=[];
  return enforceAuthoritativeAnalysis(a);
}
