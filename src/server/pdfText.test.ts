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
  const result=await normalizePdfText(await pdf('Top Secret facility clearance is required at proposal submission.'));
  assert.equal(result.mimetype,'text/plain');
  assert.match(result.buffer.toString(),/PAGE 1/);
  assert.match(result.buffer.toString(),/Top Secret facility clearance/);
});
test('image-only PDFs retain the original file for visual extraction',async()=>{
  const source=await pdf();
  assert.equal(await normalizePdfText(source),source);
});
