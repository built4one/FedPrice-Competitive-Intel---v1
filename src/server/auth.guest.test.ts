import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { installAuth } from './auth';

test('preview guest access is login-free, isolated by browser, and disabled elsewhere', async () => {
  const keys = [
    'STUDIO_GUEST_PREVIEW_ACCESS', 'VERCEL', 'VERCEL_ENV',
    'VERCEL_GIT_COMMIT_REF', 'VERCEL_URL', 'SESSION_SECRET',
    'STUDIO_USERS_JSON', 'STUDIO_HISTORICAL_PREVIEW_ACCESS',
  ];
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, {
    STUDIO_GUEST_PREVIEW_ACCESS: '1',
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    VERCEL_GIT_COMMIT_REF: 'codex/atlas-team-guest-preview',
    VERCEL_URL: 'preview-guest.example.vercel.app',
    SESSION_SECRET: 'long-isolated-test-secret-at-least-thirty-two-characters',
    STUDIO_USERS_JSON: '[]',
    STUDIO_HISTORICAL_PREVIEW_ACCESS: '0',
  });

  const app = express();
  installAuth(app);
  app.get('/api/whoami', (req, res) => res.json(req.principal));
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const port = address.port;
    function get(path: string, cookie?: string, host = 'preview-guest.example.vercel.app') {
      return new Promise<{ status: number; body: any; cookie?: string }>((resolve, reject) => {
        const headers: Record<string, string> = { Host: host };
        if (cookie) headers.Cookie = cookie;
        const req = httpRequest({ hostname: '127.0.0.1', port, path, headers }, res => {
          let content = '';
          res.on('data', chunk => { content += chunk.toString(); });
          res.on('end', () => resolve({
            status: res.statusCode || 0,
            body: JSON.parse(content),
            cookie: res.headers['set-cookie']?.[0]?.split(';')[0],
          }));
        });
        req.on('error', reject);
        req.end();
      });
    }

    const a = await get('/api/session');
    const b = await get('/api/session');
    assert.equal(a.status, 200);
    assert.equal(a.body.accessMode, 'vercel-preview');
    assert.equal(a.body.user?.username, 'tester');
    assert.ok(a.cookie?.startsWith('fmp_preview_guest='));
    assert.ok(b.cookie);
    assert.notEqual(a.body.user.workspace, b.body.user.workspace);
    assert.match(a.body.user.workspace, /^preview-guest-[a-f0-9]{32}$/);
    assert.equal((await get('/api/session', a.cookie)).body.user.workspace, a.body.user.workspace);
    assert.equal((await get('/api/whoami', a.cookie)).body.workspace, a.body.user.workspace);
    assert.equal((await get('/api/whoami', b.cookie)).body.workspace, b.body.user.workspace);

    process.env.VERCEL_ENV = 'production';
    assert.equal((await get('/api/session', a.cookie)).body.user, null);
    assert.notEqual((await get('/api/whoami', a.cookie)).status, 200);
    process.env.VERCEL_ENV = 'preview';
    assert.equal((await get('/api/session', a.cookie, 'unrelated.vercel.app')).body.user, null);
    process.env.STUDIO_GUEST_PREVIEW_ACCESS = '0';
    assert.equal((await get('/api/session', a.cookie)).body.user, null);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const key of keys) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
});
