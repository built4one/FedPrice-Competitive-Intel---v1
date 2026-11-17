export interface AwardReview {
  awardedValue: number | null;
  valueType: 'total-award' | 'evaluated-price' | 'ceiling' | 'initial-funding' | 'pricing-benchmark' | 'not-confirmed';
  sameBasis: 'yes' | 'no' | 'not-confirmed';
  source: string;
  rationale: string;
}
export const emptyAwardReview: AwardReview = {awardedValue:null,valueType:'not-confirmed',sameBasis:'not-confirmed',source:'',rationale:''};
export function parseAwardReview(raw:any):AwardReview {
  if(!raw||typeof raw!=='object')throw Error('Enter review details.');
  const {awardedValue,valueType,sameBasis,source,rationale}=raw;
  if(awardedValue!==null&&(typeof awardedValue!=='number'||!Number.isFinite(awardedValue)||awardedValue<=0))throw Error('Enter a positive award amount or leave it blank.');
  if(!['total-award','evaluated-price','ceiling','initial-funding','pricing-benchmark','not-confirmed'].includes(valueType))throw Error('Choose an award value type.');
  if(!['yes','no','not-confirmed'].includes(sameBasis))throw Error('Confirm whether scope and period match.');
  if(typeof source!=='string'||source.length>2000||typeof rationale!=='string'||rationale.length>10000)throw Error('Source or review notes are too long.');
  return {awardedValue,valueType,sameBasis,source:source.trim(),rationale:rationale.trim()};
}
export function awardComparison(price:number|null,low:number|null,high:number|null,review:AwardReview){
  const award=review.awardedValue;
  if(award==null||!Number.isFinite(award)||award<=0||price==null||!Number.isFinite(price))return null;
  const comparable=review.sameBasis==='yes'&&['total-award','evaluated-price'].includes(review.valueType);
  const validRange=low!=null&&high!=null&&Number.isFinite(low)&&Number.isFinite(high)&&low<=high;
  const inRange=validRange?award>=low!&&award<=high!:null;
  const boundaryGap=validRange?(award<low!?low!-award:award>high!?high!-award:0):null;
  const boundaryPercent=boundaryGap==null?null:Math.abs(boundaryGap)/award*100;
  // A fixed, disclosed display tolerance; never widens or rewrites the prediction.
  const rangeStatus=inRange===null?'Range unavailable':inRange?'Inside range':boundaryPercent!<=5?'Near range':'Outside range';
  return {difference:price-award,percent:(price-award)/award*100,comparable,inRange,boundaryGap,boundaryPercent,rangeStatus};
}
