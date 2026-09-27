import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { passwordHash } from '../server/auth';
import ExcelJS from 'exceljs';
import { ptwStrategyFixture } from '../testFixtures/ptwStrategy';
import { synthesizePtwStrategy } from '../server/ptwSynthesis';

test('serves valid PDF and Excel downloads through the production export routes', async (t) => {
  process.env.VERCEL = '1';
  process.env.STUDIO_USERS_JSON = JSON.stringify([{ username: 'exporter', workspace: 'exports', passwordHash: passwordHash('test-pass') }]);
  process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
  const { default: app } = await import('../../server');
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const { port } = server.address() as AddressInfo;
  const signIn = await fetch(`http://127.0.0.1:${port}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'exporter', password: 'test-pass' }),
  });
  assert.equal(signIn.status, 200);
  const cookie = signIn.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const {analysis,strategy} = ptwStrategyFixture();
  analysis.ptwStrategy = await synthesizePtwStrategy(analysis,{interpret:async <T>() => strategy as T});
  const cases = [
    { endpoint: 'export-pdf', type: 'application/pdf', signature: '%PDF', extension: '.pdf' },
    { endpoint: 'export-brief', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: 'PK', extension: '.xlsx' },
  ];

  for (const item of cases) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${item.endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(analysis),
    });
    const bytes = Buffer.from(await response.arrayBuffer());

    assert.equal(response.status, 200, bytes.toString('utf8'));
    assert.match(response.headers.get('content-type') || '', new RegExp(`^${item.type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(response.headers.get('content-disposition') || '', new RegExp(`${item.extension.replace('.', '\\.')}(?:"|$)`));
    assert.equal(bytes.subarray(0, item.signature.length).toString('ascii'), item.signature);
    assert.ok(bytes.length > 5_000);
    if (item.extension === '.xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes as any);
      const sheet = workbook.getWorksheet('PTW Strategy');
      assert.ok(sheet);
      const exported = JSON.stringify(sheet.getSheetValues());
      assert.ok(exported.includes(strategy.options[0].name));
      assert.ok(exported.includes(strategy.recommendation.alternatives[0].reason.text));
      assert.ok(exported.includes(strategy.recommendation.changeTriggers[0].text));
      assert.match(exported,/SOL-EVAL/);
    }
  }
});
