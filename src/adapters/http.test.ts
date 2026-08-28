import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectorError, fetchJsonWithRetry } from './http';

async function withMockFetch(mock: typeof fetch, run: () => Promise<void>) {
  const original = global.fetch;
  global.fetch = mock;
  try { await run(); } finally { global.fetch = original; }
}

test('retry policy recovers from 429 and 500 responses', async () => {
  let calls = 0;
  await withMockFetch(async () => {
    calls += 1;
    if (calls === 1) return new Response('{"detail":"rate limited"}', { status: 429 });
    if (calls === 2) return new Response('{"detail":"temporary outage"}', { status: 500 });
    return new Response('{"ok":true}', { status: 200 });
  }, async () => {
    const result = await fetchJsonWithRetry<{ ok: boolean }>('https://example.test', {}, { maxAttempts: 3, baseDelayMs: 1 });
    assert.equal(result.data.ok, true);
    assert.equal(result.attempts, 3);
  });
});

test('retry policy classifies an exhausted timeout', async () => {
  await withMockFetch(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }), async () => {
    await assert.rejects(
      () => fetchJsonWithRetry('https://example.test', {}, { timeoutMs: 5, maxAttempts: 2, baseDelayMs: 1 }),
      (error: unknown) => error instanceof ConnectorError && error.status === 'TIMEOUT' && error.attempts === 2,
    );
  });
});
