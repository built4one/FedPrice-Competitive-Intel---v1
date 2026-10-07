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
  const decision=read.getWorksheet('Executive Decision')!;
  const confidenceRow=decision.getRows(1,decision.rowCount)!.find(row=>row.getCell(1).value==='overall confidence')!;
  assert.equal(confidenceRow.getCell(2).value,'LOW');
  const xml=await (await JSZip.loadAsync(bytes)).file('xl/workbook.xml')!.async('string');
  assert.match(xml,/fullCalcOnLoad="1"/);
});

test('workbook formulas preserve undiscounted planning rates and row-cent rounding',()=>{
  const a=pricedServicesFixture();
  a.deal.evaluationScheme!.method='TRADE_OFF';
  a.deal.evaluationScheme!.priceWeight='LOW';
  a.deal.laborSignals[1].clearance='None';
  const authoritative=enforceAuthoritativeAnalysis(a),w=new ExcelJS.Workbook();
  w.addWorksheet('Executive Decision').columns=[{header:'Field',key:'field'},{header:'Value',key:'value'}];
  addCompetitiveWorkbook(w,authoritative);
  const labor=w.getWorksheet('Competitive Labor')!;
  authoritative.competitivePosition!.rows.forEach((r,i)=>{
    const n=i+2;
    assert.equal(labor.getCell(`Q${n}`).value,1);
    assert.deepEqual(labor.getCell(`H${n}`).value,{formula:`IF(Q${n}=1,F${n},E${n})`,result:r.medianRate});
    for (const [column,rate,result] of [['J','E',r.low],['K','H',r.target],['L','G',r.high]] as const)
      assert.deepEqual(labor.getCell(`${column}${n}`).value,{formula:`ROUND(D${n}*${rate}${n}*I${n},2)`,result});
  });
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

test('partial workbook retains unpriced source quantities and separates subtotals from the executive target',()=>{
  const a=pricedServicesFixture();a.evidence=a.evidence.filter(e=>e.id!=='SYN-RATE-1');
  const authoritative=enforceAuthoritativeAnalysis(a),w=new ExcelJS.Workbook();
  w.addWorksheet('Executive Decision').columns=[{header:'Field',key:'field'},{header:'Value',key:'value'}];
  addCompetitiveWorkbook(w,authoritative);
  const quantities=w.getWorksheet('Quantity Coverage')!;
  assert.equal(quantities.rowCount,98);
  assert.equal((quantities.getCell('D98').value as ExcelJS.CellFormulaValue).result,1050240);
  assert.equal(quantities.getCell('E2').value,'UNPRICED - EXCLUDED');
  assert.equal(w.getWorksheet('Competitive Labor')!.rowCount,91);
  assert.match(String(w.getWorksheet('Competitive Strategies')!.getCell('A3').value),/PARTIAL SUBTOTAL/);
  assert.equal(w.getWorksheet('Competitive Strategies')!.getCell('E3').value,'NO');
  assert.equal(w.getWorksheet('Executive Decision')!.getCell('B2').value,'No complete quantity/rate basis');
});
