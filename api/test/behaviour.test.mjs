/**
 * What the engine is supposed to actually do: precedence between the signal
 * tiers, per-user learning, and the feedback replay rules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCategoriser } from '../src/categorise.mjs';
import { CONFIDENCE_THRESHOLD } from '../src/contracts.mjs';

const NOW = Date.parse('2026-08-22T12:00:00Z');
const make = () => createCategoriser({ cachePath: null, now: () => NOW });

let seq = 0;
function input(merchant, descriptor, mcc = null, overrides = {}) {
  seq += 1;
  const parts = [merchant, descriptor];
  if (mcc) parts.push(`mcc:${mcc}`);
  return {
    id: `mock:acc-1:t${seq}`,
    text: parts.join(' | '),
    merchant,
    descriptor,
    amountPence: -1000,
    currency: 'GBP',
    date: '2026-08-14',
    kind: 'spend',
    mcc,
    bankTransactionCode: null,
    accountId: 'mock:acc-1',
    ...overrides,
  };
}

function correction(merchant, descriptor, category, { mcc = null, daysAgo = 5 } = {}) {
  return {
    transactionId: `long-gone-${merchant}-${daysAgo}`,
    userId: 'auth0|test',
    category,
    previous: null,
    descriptor,
    merchant,
    mcc,
    amountPence: -1000,
    correctedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  };
}

const one = async (t, feedback = []) =>
  (await make().categorise([t], { userId: 'auth0|test', feedback }))[0];

test('a named brand beats a contradicting MCC', async () => {
  // Costa bills as 5814 "fast food". The brand is the better evidence.
  const r = await one(input('Costa Coffee', 'COSTA COFFEE 4412 LEEDS GB', '5814'));
  assert.equal(r.category, 'coffee');
  assert.equal(r.source, 'rules');
  assert.ok(r.confidence >= CONFIDENCE_THRESHOLD, `expected confident, got ${r.confidence}`);
});

test('an agreeing MCC raises confidence, a contradicting one lowers it', async () => {
  const agree = await one(input('Tesco', 'TESCO STORES 3411 GB', '5411'));
  const conflict = await one(input('Tesco', 'TESCO STORES 3411 GB', '5812'));
  assert.equal(agree.category, 'groceries');
  assert.equal(conflict.category, 'groceries');
  assert.ok(agree.confidence > conflict.confidence);
});

test('MCC alone classifies an unknown merchant, but only tentatively', async () => {
  const strong = await one(input('Zorbix', 'ZORBIX LTD 8891 GB', '5411'));
  assert.equal(strong.category, 'groceries');
  assert.equal(strong.source, 'rules');

  const weak = await one(input('Zorbix', 'ZORBIX LTD 8891 GB', '5999'));
  assert.equal(weak.category, 'shopping');
  assert.ok(weak.confidence < CONFIDENCE_THRESHOLD, 'a vague MCC must ask for review');
});

test('no brand, no MCC, no history means none — we do not guess', async () => {
  const r = await one(input('J Whitfield', 'J WHITFIELD 0042 GB', null));
  assert.equal(r.category, null);
  assert.equal(r.source, 'none');
  assert.equal(r.confidence, 0);
});

test('MCCs with no category are refused rather than guessed', async () => {
  // 6011 is an ATM withdrawal. "shopping" would be a lie.
  const r = await one(input('Cash', 'LINK ATM 4412 LEEDS GB', '6011'));
  assert.equal(r.category, null);
});

test('a past correction on the same merchant always wins', async () => {
  const feedback = [correction('Costa Coffee', 'COSTA COFFEE 0021 YORK GB', 'eating_out')];
  const r = await one(input('Costa Coffee', 'COSTA COFFEE 4412 LEEDS GB', '5814'), feedback);
  assert.equal(r.category, 'eating_out', 'the user outranks the brand rule');
  assert.equal(r.source, 'user');
  assert.equal(r.confidence, 1);
});

test('the newest correction wins when the user has changed their mind', async () => {
  const feedback = [
    correction('Waitrose', 'WAITROSE 421 GB', 'uni', { daysAgo: 1 }),
    correction('Waitrose', 'WAITROSE 421 GB', 'groceries', { daysAgo: 40 }),
  ];
  const r = await one(input('Waitrose', 'WAITROSE 421 GB', '5411'), feedback);
  assert.equal(r.category, 'uni');
});

test('corrections generalise to a reworded descriptor via the embedding', async () => {
  const feedback = [correction('Marbury Food Market', 'MARBURY FOOD MARKET 42 GB', 'groceries')];
  const r = await one(input('Marbury Food Mkt', 'MARBURY FOOD MKT LTD 9981 YORK', null), feedback);
  assert.equal(r.category, 'groceries');
  assert.equal(r.source, 'model', 'this must come from the embedding, not an exact match');
});

test('categorisation is per-user: the same merchant, two answers', async () => {
  const t = () => input('Tesco', 'TESCO STORES 3411 GB', '5411');
  const shopper = await one(t(), [correction('Tesco', 'TESCO STORES 3411 GB', 'groceries')]);
  const student = await one(t(), [correction('Tesco', 'TESCO STORES 3411 GB', 'uni')]);
  assert.equal(shopper.category, 'groceries');
  assert.equal(student.category, 'uni');
});

test('feedback whose transaction has aged out is still trainable', async () => {
  // transactionId points at nothing — the 90-day window dropped it in March.
  // The engine must never need to join back to a live transaction.
  const feedback = [
    correction('Penfold Academic', 'PENFOLD ACADEMIC SUPPLIES GB', 'uni', { daysAgo: 170 }),
  ];
  const r = await one(input('Penfold Academic Sup', 'PENFOLD ACADEMIC SUP 0042', null), feedback);
  assert.equal(r.category, 'uni');
});

test('a recent correction outweighs a stale contradicting one', async () => {
  const feedback = [
    correction('Ottermill Kitchen', 'OTTERMILL KITCHEN 22 GB', 'eating_out', { daysAgo: 2 }),
    correction('Ottermill Bistro', 'OTTERMILL BISTRO 41 GB', 'nights_out', { daysAgo: 300 }),
  ];
  const r = await one(input('Ottermill Ktchn', 'OTTERMILL KTCHN 0088 EXETER', null), feedback);
  assert.equal(r.category, 'eating_out');
});

test('feedback naming an unknown category is ignored, not propagated', async () => {
  const feedback = [correction('Costa Coffee', 'COSTA COFFEE 0021 GB', 'crypto')];
  const r = await one(input('Costa Coffee', 'COSTA COFFEE 4412 GB', '5814'), feedback);
  assert.equal(r.category, 'coffee', 'falls back to the brand rule');
});

test('a weak neighbour does not overrule a confident brand rule', async () => {
  const feedback = [correction('Costa Del Mar Sunglasses', 'COSTA DEL MAR 88 GB', 'shopping')];
  const r = await one(input('Costa Coffee', 'COSTA COFFEE 4412 LEEDS GB', '5814'), feedback);
  assert.equal(r.category, 'coffee');
});
