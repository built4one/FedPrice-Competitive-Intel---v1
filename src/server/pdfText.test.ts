import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import { normalizePdfText } from './pdfText';

async function pdf(text?: string) {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  const buffer = new Promise<Buffer>(resolve=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));});
  if (text) doc.text(text); else doc.rect(20,20,100,100).fill('black');
  doc.end();
  const bytes=await buffer;
  return {originalname:'source.pdf',mimetype:'application/pdf',size:bytes.length,buffer:bytes};
}
test('digital PDF normalization preserves source and page locators',async()=>{
  const result=await normalizePdfText(await pdf('Top Secret facility clearance is required at proposal submission. The contractor must provide the complete staffing schedule and all evaluated option years. Each labor category must include documented productive hours, headcount, period of performance, and the applicable security requirements.'));
  assert.equal(result.mimetype,'text/plain');
  assert.match(result.buffer.toString(),/PAGE 1/);
  assert.match(result.buffer.toString(),/Top Secret facility clearance/);
});
test('image-only PDFs retain the original file for visual extraction',async()=>{
  const source=await pdf();
  assert.equal(await normalizePdfText(source),source);
});
test('security forms retain the PDF so checkboxes and markings can be inspected',async()=>{
  const source=await pdf('DD 254 — security requirements');
  source.originalname='DRAFT+DD+254.pdf';
  assert.equal(await normalizePdfText(source),source);
});
test('SF1449 retains visual set-aside boxes instead of flattening every printed option into text',async()=>{
  const source=await pdf('STANDARD FORM 1449. SOLICITATION/CONTRACT/ORDER FOR COMMERCIAL PRODUCTS. SET-ASIDE SMALL BUSINESS WOSB WOMEN-OWNED SMALL BUSINESS. NAICS 518210. Selected boxes determine the eligibility.');
  assert.equal(await normalizePdfText(source),source);
});

test('broken font mappings cannot masquerade as readable PDF text',async()=>{
 const {usablePdfText}=await import('./pdfText');
 assert.equal(usablePdfText('\u0000\u0001\u0002Wage determination'.repeat(100)),false);
 assert.equal(usablePdfText('Ordinary readable wage determination with rates and obligations.'),true);
});
