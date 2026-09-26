import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ConflictError, RecordStore } from './store.js';

test('saved run survives closing and reopening the database and stays workspace isolated', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'fmp-store-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { file: path.join(dir, 'runs.sqlite'), url: undefined, hosted: false };
  const first = new RecordStore(options);
  const saved = await first.put('alice', 'analysis', 'run-one', { title: 'First' });
  assert.equal(saved.version, 1);
  await assert.rejects(first.put('alice', 'analysis', 'run-one', { title: 'Wrong version' }), ConflictError);
  await first.close();

  const reopened = new RecordStore(options);
  assert.deepEqual((await reopened.get('alice', 'analysis', 'run-one'))?.value, { title: 'First' });
  assert.equal(await reopened.get('bob', 'analysis', 'run-one'), null);
  assert.equal((await reopened.put('alice', 'analysis', 'run-one', { title: 'Updated' }, 1)).version, 2);
  await reopened.close();
});
