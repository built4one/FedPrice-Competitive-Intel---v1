import assert from 'node:assert/strict';
import test from 'node:test';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis';
import { createBrowserExecutivePdf } from './browserPdf';

test('browser PDF fallback creates a valid leadership brief', async () => {
  const blob = createBrowserExecutivePdf(opportunityAnalysisFixture());
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF');
  assert.ok(bytes.length > 1_000);
});
