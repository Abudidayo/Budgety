/**
 * Regression bars on the numbers scripts/calibrate.mjs prints.
 *
 * The bars are set just below what the engine currently does, so a change that
 * quietly degrades it fails here rather than on stage. If you improve the
 * engine, raise them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategoriser } from '../src/categorise.mjs';
import { evaluate } from '../src/engine/evaluate.mjs';
import { CONFIDENCE_THRESHOLD } from '../src/contracts.mjs';
import { GENERALISATION, LABELLED, toInput } from './fixtures/labelled.mjs';

const NOW = Date.parse('2026-08-22T12:00:00Z');
const make = () => createCategoriser({ cachePath: null, now: () => NOW });

test('cold start: no feedback at all still categorises the demo dataset', async () => {
  const inputs = LABELLED.map((row, i) => toInput(row, i));
  const results = await make().categorise(inputs, { userId: 'auth0|new', feedback: [] });
  const ev = evaluate(LABELLED, results);

  assert.ok(ev.coverage >= 0.9, `coverage ${ev.coverage}`);
  assert.ok(ev.accuracyExcludingHard >= 0.9, `accuracy ${ev.accuracyExcludingHard}`);
  // The number that matters on stage: of what we show without a review prompt,
  // how much is right.
  assert.ok(ev.confidentAccuracy >= 0.92, `confident accuracy ${ev.confidentAccuracy}`);
});

test('generalisation: held-out merchants no rule or MCC can reach', async () => {
  // Every test row has its MCC stripped and an invented merchant name, so the
  // only route to a correct answer is the embedding neighbourhood.
  const feedback = GENERALISATION.map((g, i) => ({
    transactionId: `aged-out-${i}`,
    userId: 'auth0|test',
    category: g.expected,
    previous: null,
    descriptor: g.train.descriptor,
    merchant: g.train.merchant,
    mcc: g.train.mcc,
    amountPence: -1000,
    correctedAt: new Date(NOW - (i + 1) * 5 * 86_400_000).toISOString(),
  }));
  const inputs = GENERALISATION.map((g, i) =>
    toInput({ ...g.test, amountPence: -1000, expected: g.expected }, i),
  );

  const results = await make().categorise(inputs, { userId: 'auth0|test', feedback });
  const ev = evaluate(GENERALISATION, results);

  assert.ok(ev.accuracy >= 0.9, `generalisation accuracy ${ev.accuracy}`);
  assert.ok(
    results.every((r) => r.source === 'model'),
    'these must be answered by the model tier, not by rules or an exact match',
  );
});

test('confidence is calibrated: it is not right the same amount at every level', async () => {
  // The threshold only earns its place if accuracy above it beats accuracy
  // below it. Returning cosine similarity as confidence would fail this.
  const feedback = GENERALISATION.map((g, i) => ({
    transactionId: `aged-out-${i}`,
    userId: 'auth0|test',
    category: g.expected,
    previous: null,
    descriptor: g.train.descriptor,
    merchant: g.train.merchant,
    mcc: g.train.mcc,
    amountPence: -1000,
    correctedAt: new Date(NOW - 5 * 86_400_000).toISOString(),
  }));

  const rows = [
    ...LABELLED.map((row, i) => toInput(row, i)),
    ...GENERALISATION.map((g, i) => toInput({ ...g.test, amountPence: -1000 }, 1000 + i)),
  ];
  const labels = [...LABELLED, ...GENERALISATION.map((g) => ({ expected: g.expected }))];

  const results = await make().categorise(rows, { userId: 'auth0|test', feedback });
  const ev = evaluate(labels, results);

  const above = ev.rows.filter((r) => r.category !== null && r.confidence >= CONFIDENCE_THRESHOLD);
  const below = ev.rows.filter((r) => r.category !== null && r.confidence < CONFIDENCE_THRESHOLD);
  assert.ok(above.length > 0 && below.length > 0, 'both sides of the threshold must be populated');

  const acc = (xs) => xs.filter((r) => r.correct).length / xs.length;
  assert.ok(
    acc(above) >= acc(below),
    `confidence is inverted: above=${acc(above)} below=${acc(below)}`,
  );
  assert.ok(acc(above) >= 0.92, `precision above the threshold is ${acc(above)}`);
});

test('a 600-transaction sync stays well inside the connect-flow latency budget', async () => {
  // The adapter budgets 10-30s for the whole connect flow. The local embedder
  // exists so categorisation is a rounding error in that, not a risk to it.
  const inputs = Array.from({ length: 600 }, (_, i) =>
    toInput(LABELLED[i % LABELLED.length], i),
  );
  const started = process.hrtime.bigint();
  const results = await make().categorise(inputs, { userId: 'auth0|test', feedback: [] });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;

  assert.equal(results.length, 600);
  assert.ok(ms < 2000, `600 transactions took ${ms.toFixed(0)}ms`);
});
