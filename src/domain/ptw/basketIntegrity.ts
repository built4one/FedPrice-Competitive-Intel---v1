import type {DealProfile} from '../../types';
/** Rollups may describe a basket but cannot also be purchased as another item. */
export function reconcileBasket(input:DealProfile):{deal:DealProfile;notes:string[];blockers:string[]} {
 const deal=structuredClone(input),notes:string[]=[],blockers:string[]=[];
 const pricing=deal.evaluationPricing;if(!pricing)return{deal,notes,blockers};
 const unit=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
 const seen=new Map<string,string>();
 const lines=(pricing.unitLines||[]).filter(l=>{
  const key=JSON.stringify([l.label,l.quantity,unit(l.unit),l.source]);
  if(seen.has(l.id)){if(seen.get(l.id)===key){notes.push(`Removed duplicate priced row ${l.id}.`);return false;}blockers.push(`Conflicting quantities or descriptions share line ${l.id}.`);}
  seen.set(l.id,key);return true;
 });
 const removed=new Set<string>();
 for(const l of lines){
  // Broad totals only: an item-specific "total evaluated quantity" is not an invitation rollup.
  if(!/grand total|total (?:quantity |price |amount |value )?(?:for |of )?(?:invitation|solicitation|all items|all products|project|contract)|combined total|overall total|subtotal/i.test(l.label))continue;
  const children=lines.filter(c=>c!==l&&!/grand total|invitation|overall total|combined total|subtotal/i.test(c.label)&&unit(c.unit)===unit(l.unit));
  const sum=children.reduce((n,c)=>n+c.quantity,0);
  if(children.length>=2&&Math.abs(sum-l.quantity)<.0001){removed.add(l.id);notes.push(`Excluded rollup ${l.label}: its ${l.quantity} ${l.unit} are already represented by ${children.map(c=>c.id).join(', ')}.`);}
  else if(children.length)blockers.push(`Resolve aggregate row ${l.label} before combining it with individual price lines.`);
 }
 pricing.unitLines=lines.filter(l=>!removed.has(l.id));
 const cs=pricing.components||[];
 for(const c of cs){
  if(!/grand total|overall total|combined total|subtotal|total (?:contract|project|invitation)/i.test(c.label)||c.amount==null)continue;
  const children=cs.filter(x=>x!==c&&x.amount!=null&&!/grand total|overall total|combined total|subtotal/i.test(x.label));
  if(children.length>=2&&Math.abs(children.reduce((n,x)=>n+x.amount!,0)-c.amount)<.01){removed.add(c.id);notes.push(`Excluded fixed-component rollup ${c.label}; child amounts already included.`);}
  else if(children.length)blockers.push(`Resolve aggregate component ${c.label} before combining it with component amounts.`);
 }
 pricing.components=cs.filter(c=>!removed.has(c.id));
 const ids=new Set(pricing.components.map(c=>c.id));
 pricing.unitLines.forEach(l=>{if(ids.has(l.id))blockers.push(`Line ${l.id} appears as both a fixed component and a unit-priced line.`);});
 deal.planningInputs=deal.planningInputs?.filter(p=>!removed.has(p.id));
 return{deal,notes,blockers};
}
