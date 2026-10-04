import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { passwordHash } from './auth.js';
import { opportunityAnalysisFixture } from '../testFixtures/opportunityAnalysis.js';
import ExcelJS from 'exceljs';

test('run API saves only within the signed-in tester workspace and detects stale updates', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fmp-api-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  process.env.NODE_ENV = 'test';
  delete process.env.VERCEL;
  process.env.STUDIO_DB_PATH = path.join(dir, 'runs.sqlite');
  process.env.STUDIO_LOCAL_MODE = '0';
  process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
  process.env.STUDIO_USERS_JSON = JSON.stringify([
    { username: 'alice', workspace: 'alice', passwordHash: passwordHash('alice-pass') },
    { username: 'bob', workspace: 'bob', passwordHash: passwordHash('bob-pass') },
  ]);
  const { default: app } = await import('../../server.js');
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const getCookie = async (username: string, password: string) => {
    const response = await fetch(`${base}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie')?.split(';')[0] || '';
  };
  const alice = await getCookie('alice', 'alice-pass');
  const bob = await getCookie('bob', 'bob-pass');
  assert.equal((await fetch(`${base}/api/runs`)).status, 401);
  const fixture = opportunityAnalysisFixture();
  const save = (cookie: string, body: unknown) => fetch(`${base}/api/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body),
  });
  const savedResponse = await save(alice, fixture);
  assert.equal(savedResponse.status, 200);
  const saved = (await savedResponse.json()).data;
  assert.equal(saved.storageVersion, 1);
  assert.equal((await (await fetch(`${base}/api/runs`, { headers: { cookie: bob } })).json()).data.length, 0);
  assert.equal((await (await fetch(`${base}/api/runs`, { headers: { cookie: alice } })).json()).data[0].id, fixture.id);
  assert.equal((await save(alice, fixture)).status, 409);
  assert.equal((await save(alice, saved)).status, 200);
  const latest = (await (await fetch(`${base}/api/runs`,{headers:{cookie:alice}})).json()).data[0];
  const priced = {...latest,pricingScenario:{target:1,low:1,high:1,inputs:{evaluationBasis:'CLIN 0001 includes all evaluated periods.',basisSource:'RFP Section M',completenessConfirmed:true,lines:[{label:'CLIN 0001',quantity:10,lowUnitPrice:90,targetUnitPrice:100,highUnitPrice:110,source:'Analyst test assumption, review required'}]}}};
  const savedPrice = await save(alice,priced);
  assert.equal(savedPrice.status,200);
  const record=(await savedPrice.json()).data;
  assert.equal(record.pricingScenario.target,1000,'server rejects client-forged totals by recalculating inputs');
  assert.equal(record.pricingScenario.low,900);assert.equal(record.pricingScenario.high,1100);
  const reopened=(await (await fetch(`${base}/api/runs`,{headers:{cookie:alice}})).json()).data[0];
  assert.equal(reopened.pricingScenario.target,1000);
  const excel=await fetch(`${base}/api/export-brief`,{method:'POST',headers:{'content-type':'application/json',cookie:alice},body:JSON.stringify(reopened)});
  assert.equal(excel.status,200);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()) as any);
  const totals=workbook.getWorksheet('Conditional Offer Scenarios')!.getRow(3).values as any[];
  assert.equal(totals[3],900);assert.equal(totals[4],1000);assert.equal(totals[5],1100);
  const pdf=await fetch(`${base}/api/export-pdf`,{method:'POST',headers:{'content-type':'application/json',cookie:alice},body:JSON.stringify(reopened)});
  assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString(),'%PDF');
});
