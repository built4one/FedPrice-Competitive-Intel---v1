import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileWorkbookLabor} from './workbookLabor';
import {pricedServicesFixture} from '../testFixtures/pricedServices';
import {buildLaborModel} from '../domain/ptw/laborModel';
import {reconcileBasket} from '../domain/ptw/basketIntegrity';

const text=`SOURCE SPREADSHEET: Staffing.xlsx

SHEET: Staffing Plan
C5: BASE (7 months)\tD5: BASE (7 months)\tF5: Option 1 (12-Months)\tG5: Option 1 (12-Months)
B7: Labor Category\tC7: Rate\tD7: Estimated Hours\tF7: Rate\tG7: Estimated Hours
B8: Help Desk Specialist\tD8: 1096\tG8: 1880
B9: Help Desk Specialist\tD9: 1096\tG9: 1880
B10: Architect\tD10: 0\tG10: 1880
B11: Labor Total

SHEET: SIX MONTHS OPTION PERIOD
A1: ESTIMATED 6 MONTHS OPTION PERIOD IF REQUIRED
A7: Labor Category\tB7: Estimated Hours\tC7: Rate
A8: Architect\tB8: 940`;
const file=(s=text)=>{const buffer=Buffer.from(s);return {originalname:'Staffing.xlsx.txt',mimetype:'text/plain',buffer,size:buffer.length};};
test('worksheet rows preserve duplicate roles, zero hours, every period and cell evidence',()=>{
 const a=pricedServicesFixture();a.deal.performanceMonths=19;a.deal.laborSignals=[];
 const r=reconcileWorkbookLabor(a,[file()]);const model=buildLaborModel(r.deal,r.evidence);
 assert.equal(r.deal.laborSignals.length,3);assert.equal(model.quantityRows.length,6);
 assert.equal(model.totalHours,7832);assert.equal(model.quantityComplete,true);
 assert.equal(r.deal.laborSignals[2].periods![0].totalHours,0);
 assert.ok(r.evidence.some(e=>e.excerpt?.includes('D8: 1096')));
 assert.match(r.deal.laborModelSource!,/no headcount or annual hours inferred/);
});
test('unexplained duration differences and missing hours cannot be promoted to a complete schedule',()=>{
 const a=pricedServicesFixture();a.deal.performanceMonths=20;
 assert.equal(reconcileWorkbookLabor(a,[file()]),a);
 a.deal.performanceMonths=19;
 assert.equal(reconcileWorkbookLabor(a,[file(text.replace('D9: 1096','D9: unknown'))]),a);
});
test('labor schedule rollups cannot be added again as a separate engineering estimate',()=>{
 const a=pricedServicesFixture();a.deal.performanceMonths=19;
 const r=reconcileWorkbookLabor(a,[file()]);
 r.deal.evaluationPricing!.components=[
  {id:'labor',label:'Labor pricing scenario by category and CLIN periods',category:'OTHER',source:'Staffing.xlsx',evidenceIds:[],indirectTreatment:'UNKNOWN',feeAllowed:true},
  {id:'equipment',label:'Equipment installation',category:'OTHER',source:'Scope',evidenceIds:[],indirectTreatment:'UNKNOWN',feeAllowed:true},
 ];
 const result=reconcileBasket(r.deal);
 assert.deepEqual(result.deal.evaluationPricing!.components!.map(c=>c.id),['equipment']);
 assert.match(result.notes.join(' '),/Excluded labor rollup/);
});
