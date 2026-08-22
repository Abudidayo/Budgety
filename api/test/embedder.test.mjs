/**
 * The embedder and its cache. The cache is what makes a hosted embedder viable
 * on the connect-flow critical path, so "did we avoid the call" is the point.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  cosine,
  createEmbedder,
  createLocalEmbedder,
  createRemoteEmbedder,
  withLocalFallback,
} from '../src/engine/embedder.mjs';
import { createEmbeddingCache, embedCached } from '../src/engine/cache.mjs';

const local = createLocalEmbedder();

test('vectors are unit length and deterministic across calls', async () => {
  const text = 'Pret A Manger | PRET A MANGER 421 LONDON GB | mcc:5814';
  const [a] = await local.embed([text]);
  const [b] = await local.embed([text]);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-9);
});

test('an empty string does not produce NaNs', async () => {
  const [v] = await local.embed(['']);
  assert.ok(Array.from(v).every(Number.isFinite));
});

test('the same merchant at two branches is far closer than two merchants', async () => {
  const [leeds, bristol, train] = await local.embed([
    'Pret A Manger | PRET A MANGER 421 LEEDS GB | mcc:5814',
    'Pret A Manger | PRET A MANGER 88 BRISTOL GB | mcc:5814',
    'Trainline | TRAINLINE.COM EDINBURGH GB | mcc:4112',
  ]);
  assert.ok(cosine(leeds, bristol) > 0.8);
  assert.ok(cosine(leeds, train) < 0.3);
});

test('the cache collapses a batch to its distinct strings', async () => {
  let calls = 0;
  let embedded = 0;
  const counting = {
    id: 'counting',
    dim: 4,
    async embed(texts) {
      calls += 1;
      embedded += texts.length;
      return local.embed(texts);
    },
  };
  const cache = createEmbeddingCache({ path: null, fingerprint: counting.id });

  // 600 transactions across 3 merchants — the realistic shape of a sync.
  const texts = Array.from({ length: 600 }, (_, i) => `merchant ${i % 3}`);
  const vectors = await embedCached(counting, cache, texts);

  assert.equal(vectors.length, 600);
  assert.equal(calls, 1);
  assert.equal(embedded, 3, 'only the distinct strings should reach the embedder');

  await embedCached(counting, cache, texts);
  assert.equal(embedded, 3, 'a second sync should embed nothing at all');
});

test('a persisted cache survives a restart but not an embedder swap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'budgety-cache-'));
  const path = join(dir, 'nested', 'embeddings.jsonl');
  try {
    const first = createEmbeddingCache({ path, fingerprint: 'embedder-a' });
    await embedCached(local, first, ['Costa Coffee | COSTA 4412 | mcc:5814']);
    assert.equal(first.stats().persisted, true);

    const restarted = createEmbeddingCache({ path, fingerprint: 'embedder-a' });
    assert.equal(restarted.stats().size, 1, 'should reload from disk');

    // Vectors from a different embedder live in a different space; serving them
    // would silently corrupt every similarity.
    const swapped = createEmbeddingCache({ path, fingerprint: 'embedder-b' });
    assert.equal(swapped.stats().size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a remote embedder reorders rows by index and normalises them', async () => {
  const remote = createRemoteEmbedder({
    url: 'https://example.invalid/v1/embeddings',
    model: 'test-model',
    apiKey: 'k',
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          data: [
            { index: 1, embedding: [0, 3, 4] },
            { index: 0, embedding: [3, 0, 4] },
          ],
        };
      },
    }),
  });
  const [a, b] = await remote.embed(['first', 'second']);
  assert.ok(Math.abs(a[0] - 0.6) < 1e-9, 'row with index 0 must come back first');
  assert.ok(Math.abs(b[1] - 0.6) < 1e-9);
});

test('a failing remote embedder degrades to local instead of failing the sync', async () => {
  const warnings = [];
  const wrapped = withLocalFallback(
    {
      id: 'remote:down',
      dim: 3,
      async embed() {
        throw new Error('503');
      },
    },
    { onFallback: (err) => warnings.push(err.message) },
  );
  const [v] = await wrapped.embed(['Costa Coffee | COSTA 4412 | mcc:5814']);
  assert.ok(v.length > 0);
  assert.deepEqual(warnings, ['503']);
  assert.match(wrapped.id, /^local-hash/, 'the fingerprint must follow the failover');
});

test('createEmbedder defaults to local when the provider is not configured', () => {
  assert.match(createEmbedder({}).id, /^local-hash/);
  assert.match(createEmbedder({ EMBEDDINGS_URL: 'https://x' }).id, /^local-hash/);
  assert.equal(
    createEmbedder({
      EMBEDDINGS_URL: 'https://x',
      EMBEDDINGS_MODEL: 'm',
      EMBEDDINGS_API_KEY: 'k',
    }).id,
    'remote:m',
  );
});
