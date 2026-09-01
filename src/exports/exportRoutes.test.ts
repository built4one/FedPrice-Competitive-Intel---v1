import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis';

test('serves valid PDF and Excel downloads through the production export routes', async (t) => {
  process.env.VERCEL = '1';
  const { default: app } = await import('../../server');
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const { port } = server.address() as AddressInfo;
  const analysis = opportunityAnalysisFixture();
  const cases = [
    { endpoint: 'export-pdf', type: 'application/pdf', signature: '%PDF', extension: '.pdf' },
    { endpoint: 'export-brief', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: 'PK', extension: '.xlsx' },
  ];

  for (const item of cases) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${item.endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(analysis),
    });
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200, bytes.toString('utf8'));
    assert.match(response.headers.get('content-type') || '', new RegExp(`^${item.type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(response.headers.get('content-disposition') || '', new RegExp(`${item.extension.replace('.', '\\.')}(?:"|$)`));
    assert.equal(bytes.subarray(0, item.signature.length).toString('ascii'), item.signature);
    assert.ok(bytes.length > 5_000);
  }
});
