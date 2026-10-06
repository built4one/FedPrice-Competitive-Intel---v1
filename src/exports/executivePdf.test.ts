import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis';
import { createExecutivePdf } from './executivePdf';
import { ptwStrategyFixture } from '../testFixtures/ptwStrategy';
import { synthesizePtwStrategy } from '../server/ptwSynthesis';
import { pricedServicesFixture } from '../testFixtures/pricedServices';
import { normalizePdfText } from '../server/pdfText';

test('creates a decision-first leadership brief with six core sections', async () => {
  const buffer = await createExecutivePdf(opportunityAnalysisFixture());
  if (process.env.WRITE_PDF_FIXTURE === '1') {
    await mkdir('tmp/pdfs', { recursive: true });
    await writeFile('tmp/pdfs/test-brief.pdf', buffer);
  }
  assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
  assert.ok(buffer.length > 5_000);
  const source = buffer.toString('latin1');
  assert.ok((source.match(/\/Type\s*\/Page\b/g)?.length || 0)>=6);
});

test('priced executive brief puts selected price before strategy and freezes no invented IBM economics',async()=>{
  const analysis=pricedServicesFixture();const buffer=await createExecutivePdf(analysis);
  if(process.env.WRITE_PDF_FIXTURE==='1'){await mkdir('tmp/pdfs',{recursive:true});await writeFile('tmp/pdfs/priced-services.pdf',buffer);}
  const parsed=await normalizePdfText({originalname:'executive-brief.pdf',mimetype:'application/pdf',size:buffer.length,buffer});
  const text=parsed.buffer.toString();
  assert.match(text,/RECOMMENDED TOTAL EVALUATED PRICE/);assert.match(text,/PHASE 1/);assert.match(text,/Phase 2/);
  assert.ok(text.indexOf('RECOMMENDED TOTAL EVALUATED PRICE')<text.indexOf('Market and competitive intelligence'));
  assert.match(text,/20,000/);assert.match(text,/No evidence-supported named competitor/);assert.doesNotMatch(text,/No priced scenario|IBM execution floor/);
});

test('strategic decision brief adds complete strategy pages before the market appendix', async () => {
  const {analysis,strategy} = ptwStrategyFixture();
  analysis.ptwStrategy = await synthesizePtwStrategy(analysis,{interpret:async <T>() => strategy as T});
  const buffer = await createExecutivePdf(analysis);
  if (process.env.WRITE_PDF_FIXTURE === '1') {
    await mkdir('tmp/pdfs', {recursive:true});
    await writeFile('tmp/pdfs/strategy-brief.pdf',buffer);
  }
  assert.ok((buffer.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length || 0) > 2);
});
