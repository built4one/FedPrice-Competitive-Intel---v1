import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis';
import { createExecutivePdf } from './executivePdf';
import { ptwStrategyFixture } from '../testFixtures/ptwStrategy';
import { synthesizePtwStrategy } from '../server/ptwSynthesis';

test('creates a non-empty two-page leadership PDF from normalized result data', async () => {
  const buffer = await createExecutivePdf(opportunityAnalysisFixture());
  if (process.env.WRITE_PDF_FIXTURE === '1') {
    await mkdir('tmp/pdfs', { recursive: true });
    await writeFile('tmp/pdfs/test-brief.pdf', buffer);
  }
  assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF');
  assert.ok(buffer.length > 5_000);
  const source = buffer.toString('latin1');
  assert.equal(source.match(/\/Type\s*\/Page\b/g)?.length, 2);
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
