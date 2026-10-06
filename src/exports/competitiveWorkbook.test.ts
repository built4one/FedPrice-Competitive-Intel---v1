import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { pricedServicesFixture } from '../testFixtures/pricedServices';
import { addCompetitiveWorkbook } from './competitiveWorkbook';
import { enforceAuthoritativeAnalysis } from '../domain/marketPosition/authoritative';

test('workbook exposes distribution, role and total formulas with matching cached calculations',async()=>{
  const a=pricedServicesFixture(),p=a.competitivePosition!,w=new ExcelJS.Workbook();
  w.addWorksheet('Executive Decision').columns=[{header:'Field',key:'field'},{header:'Value',key:'value'}];
  addCompetitiveWorkbook(w,a);
  const bytes=await w.xlsx.writeBuffer(),read=new ExcelJS.Workbook();await read.xlsx.load(bytes as never);
  const labor=read.getWorksheet('Competitive Labor')!,strategies=read.getWorksheet('Competitive Strategies')!;
  assert.equal(labor.rowCount,97);assert.equal(labor.getCell('D2').value,p.rows[0].hours);
  assert.match((labor.getCell('K2').value as ExcelJS.CellFormulaValue).formula,/D2\*H2\*I2/);
  assert.equal((strategies.getCell('D3').value as ExcelJS.CellFormulaValue).result,p.target);
  assert.equal((read.getWorksheet('Evaluated Components')!.getCell('D2').value as ExcelJS.CellFormulaValue).result,20000);
  assert.match((read.getWorksheet('Rate Statistics')!.getCell('C2').value as ExcelJS.CellFormulaValue).formula,/PERCENTILE.INC/);
  assert.equal(read.getWorksheet('Rate Distribution')!.rowCount,81);
  const xml=await (await JSZip.loadAsync(bytes)).file('xl/workbook.xml')!.async('string');
  assert.match(xml,/fullCalcOnLoad="1"/);
});

test('invalid component indirects recalculate at the disclosed zero assumption',()=>{
  const a=pricedServicesFixture();
  a.deal.evaluationPricing!.components[0].indirectTreatment='KNOWN';
  a.deal.evaluationPricing!.components[0].indirectPct=-10;
  const authoritative=enforceAuthoritativeAnalysis(a),w=new ExcelJS.Workbook();
  w.addWorksheet('Executive Decision').columns=[{header:'Field',key:'field'},{header:'Value',key:'value'}];
  addCompetitiveWorkbook(w,authoritative);
  assert.equal(authoritative.competitivePosition!.evaluationComplete,false);
  assert.equal(w.getWorksheet('Evaluated Components')!.getCell('C2').value,0);
  assert.equal((w.getWorksheet('Evaluated Components')!.getCell('D2').value as ExcelJS.CellFormulaValue).result,20000);
});
