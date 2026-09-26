import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { installAuth, passwordHash } from './auth.js';

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
