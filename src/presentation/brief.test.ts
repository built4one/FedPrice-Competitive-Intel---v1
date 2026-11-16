import test from 'node:test';
import assert from 'node:assert/strict';
import {compactMoney,displayText,executiveBrief} from './brief';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
test('presentation rounds values and replaces internal labels without changing stored calculations',()=>{
 assert.equal(compactMoney(6950123.349999),'$6.95M');assert.equal(displayText('Rate 144.99999999'),'Rate 145');assert.equal(displayText('UNKNOWN'),'Not stated in solicitation');assert.match(displayText('0 roles use efficient rates; 3 retain central economics.'),/central planning rates/);assert.doesNotMatch(displayText('TypeError: urls.filter is not a function'),/TypeError|filter/);
 const a=pricedServicesFixture(),before=JSON.stringify(a);const b=executiveBrief(a);assert.equal(JSON.stringify(a),before);assert.equal(b.p.target,a.competitivePosition!.target);assert.ok(b.why.length>=3&&b.why.length<=5);
});
test('whole-package estimates never inherit misleading partial-basket driver impacts',()=>{
 const a=pricedServicesFixture();a.meta.contingencyEstimate={low:1000000,central:2000000,high:4000000,basis:'Explicit AI estimate',assumptions:['Unverified staffing'],missing:['Staffing matrix']} as any;
 const b=executiveBrief(a);assert.match(b.basis,/AI estimate/);assert.equal(b.drivers[2].delta,null);assert.match(b.drivers[2].change,/separate estimate/);
});
