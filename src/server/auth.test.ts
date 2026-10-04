import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import express from 'express';
import { installAuth, passwordHash } from './auth.js';

test('owner preview opens without a second login only on the configured protected Vercel alias', async (t) => {
  const keys = ['VERCEL', 'VERCEL_ENV', 'STUDIO_PREVIEW_OWNER_HOST', 'STUDIO_USERS_JSON', 'SESSION_SECRET', 'STUDIO_LOCAL_MODE'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
  process.env.VERCEL = '1';
  process.env.VERCEL_ENV = 'preview';
  process.env.STUDIO_PREVIEW_OWNER_HOST = 'owner-preview.vercel.app';
  process.env.STUDIO_USERS_JSON = '[]';
  process.env.SESSION_SECRET = '';
  process.env.STUDIO_LOCAL_MODE = '0';
  const app = express(); app.use(express.json()); installAuth(app);
  app.get('/api/private', (req, res) => res.json(req.principal));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Node fetch rewrites Host; use HTTP directly to exercise alias matching.
  const get = (path: string, host = 'owner-preview.vercel.app') => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request(`${base}${path}`, { headers: { host } }, (res) => {
      let body = ''; res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode || 0, body: JSON.parse(body) }));
    });
    req.on('error', reject); req.end();
  });
  const session = (await get('/api/session')).body;
  assert.deepEqual(session.user, { username: 'boss', workspace: 'boss' });
  assert.equal(session.accessMode, 'vercel-preview');
  assert.equal(session.configured, true);
  assert.deepEqual((await get('/api/private')).body, session.user);
  assert.equal((await get('/api/private', 'other-preview.vercel.app')).status, 503);
  assert.equal((await get('/api/private', 'custom.example')).status, 503);
  process.env.VERCEL_ENV = 'production';
  assert.equal((await get('/api/private')).status, 503);
  process.env.VERCEL_ENV = 'preview'; process.env.VERCEL = '0';
  assert.equal((await get('/api/private')).status, 503);
  process.env.VERCEL = '1'; process.env.STUDIO_PREVIEW_OWNER_HOST = 'custom.example';
  assert.equal((await get('/api/private', 'custom.example')).status, 503);
  process.env.STUDIO_PREVIEW_OWNER_HOST = '';
  assert.equal((await get('/api/private')).status, 503);
});

test('private API requires sign-in and keeps tester identities separate', async (t) => {
  process.env.STUDIO_USERS_JSON = JSON.stringify([
    { username: 'alice', workspace: 'alice', passwordHash: passwordHash('alice-pass') },
    { username: 'bob', workspace: 'bob', passwordHash: passwordHash('bob-pass') },
  ]);
  process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters';
  process.env.STUDIO_LOCAL_MODE = '0';
  const app = express();
  app.use(express.json());
  installAuth(app);
  app.get('/api/private', (req, res) => res.json(req.principal));
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  assert.equal((await fetch(`${base}/api/private`)).status, 401);

  for (const [username, password] of [['alice', 'alice-pass'], ['bob', 'bob-pass']]) {
    const login = await fetch(`${base}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0] || '';
    const privateResponse = await fetch(`${base}/api/private`, { headers: { cookie } });
    assert.deepEqual(await privateResponse.json(), { username, workspace: username });
  }
  assert.equal((await fetch(`${base}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify({ username: 'alice', password: 'alice-pass' }),
  })).status, 403);
});
