/**
 * The engine's obligations to the adapter, from docs/contracts/categorisation.md.
 * These are the tests that stop a refactor from breaking the seam.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategoriser } from '../src/categorise.mjs';
import { CATEGORY_IDS, CONFIDENCE_THRESHOLD } from '../src/contracts.mjs';
import { LABELLED, toInput } from './fixtures/labelled.mjs';

const NOW = Date.parse('2026-08-22T12:00:00Z');
const make = (opts = {}) => createCategoriser({ cachePath: null, now: () => NOW, ...opts });
const silent = { error() {}, warn() {}, log() {} };

const inputs = LABELLED.map((row, i) => toInput(row, i));
const ctx = { userId: 'auth0|test', feedback: [] };

test('returns exactly one result per input, ids echoed verbatim', async () => {
  const results = await make().categorise(inputs, ctx);
  assert.equal(results.length, inputs.length);
  assert.deepEqual(
    results.map((r) => r.id),
    inputs.map((i) => i.id),
  );
});

test('every result satisfies the CategorisationResult shape', async () => {
  const results = await make().categorise(inputs, ctx);
  for (const r of results) {
    assert.ok(r.category === null || CATEGORY_IDS.includes(r.category), `bad category ${r.category}`);
    assert.ok(typeof r.confidence === 'number' && r.confidence >= 0 && r.confidence <= 1);
    assert.ok(['user', 'model', 'rules', 'none'].includes(r.source));
    if (r.source === 'none') assert.equal(r.category, null, "source 'none' must carry a null category");
  }
});

test('income is never given a spending category', async () => {
  const income = {
    ...toInput(LABELLED[0], 0),
    id: 'acc:wage',
    kind: 'income',
    amountPence: 120000,
    merchant: 'Tesco Stores Payroll',
    descriptor: 'TESCO STORES PAYROLL BACS',
    mcc: '5411',
  };
  const [r] = await make().categorise([income], ctx);
  assert.equal(r.category, null);
  assert.equal(r.source, 'none');
  // Certain it has no category, so it must not land in the review queue.
  assert.ok(r.confidence >= CONFIDENCE_THRESHOLD);
});

test('an embedder that throws degrades to priors instead of failing the batch', async () => {
  const broken = {
    id: 'broken',
    dim: 1,
    async embed() {
      throw new Error('provider down');
    },
  };
  const results = await make({ embedder: broken, logger: silent }).categorise(inputs, ctx);
  assert.equal(results.length, inputs.length);
  // The MCC table and brand rules need no vectors, so coverage should barely move.
  const covered = results.filter((r) => r.category !== null).length;
  assert.ok(covered / results.length > 0.9, `expected priors to still fire, got ${covered}`);
});

test('malformed inputs degrade to source none rather than throwing', async () => {
  const junk = [
    { id: 'a', kind: 'spend' },
    { id: 'b', kind: 'spend', merchant: null, descriptor: undefined, mcc: 12345, text: null },
    { id: 'c', kind: 'spend', merchant: '', descriptor: '', mcc: null, text: '' },
    { id: 'd', kind: 'spend', merchant: 'Tesco', descriptor: 'TESCO', mcc: 'not-a-code' },
  ];
  const results = await make({ logger: silent }).categorise(junk, ctx);
  assert.equal(results.length, 4);
  for (const r of results.slice(0, 3)) {
    assert.equal(r.category, null);
    assert.equal(r.source, 'none');
  }
  assert.equal(results[3].category, 'groceries', 'a junk mcc must not stop the brand rule');
});

test('a missing or absent context is not an error', async () => {
  const one = [toInput(LABELLED[0], 0)];
  for (const bad of [undefined, {}, { userId: 'x' }, { userId: 'x', feedback: null }]) {
    const results = await make({ logger: silent }).categorise(one, bad);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, one[0].id);
  }
});

test('an empty batch is an empty result, not a crash', async () => {
  assert.deepEqual(await make().categorise([], ctx), []);
  assert.deepEqual(await make({ logger: silent }).categorise(null, ctx), []);
});

test('the same batch classified twice gives identical results', async () => {
  const a = await make().categorise(inputs, ctx);
  const b = await make().categorise(inputs, ctx);
  assert.deepEqual(a, b);
});
