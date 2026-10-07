import assert from 'node:assert/strict';
import test from 'node:test';
import { BodySizeError, readBoundedBody } from './boundedBody';

test('keeps a complete multibyte body at the exact byte limit', async () => {
  const body = Buffer.from('café');
  assert.deepEqual(await readBoundedBody(new Response(body), body.length), body);
});

test('cancels an oversized declared body without consuming it', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), {headers: {'content-length':'100'}});
  await assert.rejects(readBoundedBody(response, 10), BodySizeError);
  assert.equal(cancelled, true);
});

for (const declaredLength of [undefined, '1']) {
  test(`cancels an oversized stream with ${declaredLength ? 'misleading' : 'missing'} Content-Length`, async () => {
    let reads = 0, cancelled = false;
    const response = new Response(new ReadableStream({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(6)); },
      cancel() { cancelled = true; },
    }, {highWaterMark:0}), {headers:declaredLength ? {'content-length':declaredLength} : {}});
    await assert.rejects(readBoundedBody(response, 10), error => error instanceof BodySizeError && error.sizeBytes === 12);
    assert.equal(reads, 2);
    assert.equal(cancelled, true);
  });
}

test('preserves stream failures and releases the reader', async () => {
  const failure = new Error('connection lost');
  const response = new Response(new ReadableStream({pull(controller) {controller.error(failure);}}));
  await assert.rejects(readBoundedBody(response, 10), error => error === failure);
  assert.equal(response.body!.locked, false);
});
