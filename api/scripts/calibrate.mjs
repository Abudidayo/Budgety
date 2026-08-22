#!/usr/bin/env node
/**
 * Prints the confidence distribution and per-bucket accuracy of the engine.
 *
 *   node scripts/calibrate.mjs
 *
 * Run this after touching thresholds, the MCC table or the rules. The number to
 * watch is not overall accuracy — it is whether accuracy rises with confidence,
 * because CONFIDENCE_THRESHOLD is what decides the user's review queue.
 *
 * Three scenarios are reported:
 *   cold start     — no feedback. The demo case.
 *   warm           — a few corrections on merchants the cold start hedged on.
 *   generalisation — held-out invented merchants with no brand rule and no
 *                    useful MCC, trained on a differently-worded descriptor.
 *                    This is the only scenario that measures the embedder.
 */

import { createCategoriser } from '../src/categorise.mjs';
import { evaluate, formatReport } from '../src/engine/evaluate.mjs';
import { GENERALISATION, LABELLED, toInput } from '../test/fixtures/labelled.mjs';

const NOW = Date.parse('2026-08-22T12:00:00Z');
const inputs = LABELLED.map((row, i) => toInput(row, i));

const categoriser = createCategoriser({ cachePath: null, now: () => NOW });

const cold = await categoriser.categorise(inputs, { userId: 'auth0|demo', feedback: [] });
console.log(formatReport(evaluate(LABELLED, cold), 'cold start (no feedback)'));
console.log();

// A user who has corrected the engine on merchants it got wrong or hedged on,
// plus two personal quirks no rule could know: they file their supermarket run
// as uni supplies, and Riverside Studios as nights out.
const feedback = [
  correction('Holland & Barrett', 'HOLLAND AND BARRETT 210', '5499', 'health', -1650, 3),
  correction('Overleaf', 'OVERLEAF LONDON GB', '5817', 'uni', -1400, 9),
  correction('Riverside Studios', 'RIVERSIDE STUDIOS 88 GB', null, 'nights_out', -2200, 14),
  correction('J Whitfield', 'J WHITFIELD 0042 GB', null, 'shopping', -1500, 21),
  correction('Zorbix', 'ZORBIX LTD 8891 LONDON GB', '5411', 'groceries', -1420, 30),
];

const warm = await categoriser.categorise(inputs, { userId: 'auth0|demo', feedback });
console.log(formatReport(evaluate(LABELLED, warm), 'warm (5 corrections)'));
console.log();

// Held out. Every merchant is invented and every MCC is stripped from the test
// row, so a correct answer can only come from the embedding neighbourhood.
const gen = createCategoriser({ cachePath: null, now: () => NOW });
const genFeedback = GENERALISATION.map((g, i) => ({
  transactionId: `aged-out-gen-${i}`,
  userId: 'auth0|demo',
  category: g.expected,
  previous: null,
  descriptor: g.train.descriptor,
  merchant: g.train.merchant,
  mcc: g.train.mcc,
  amountPence: -1000,
  correctedAt: new Date(NOW - (i + 1) * 5 * 86_400_000).toISOString(),
}));
const genInputs = GENERALISATION.map((g, i) =>
  toInput({ ...g.test, amountPence: -1000, expected: g.expected }, i),
);
const genResults = await gen.categorise(genInputs, { userId: 'auth0|demo', feedback: genFeedback });
console.log(formatReport(evaluate(GENERALISATION, genResults), 'generalisation (held-out, kNN only)'));
GENERALISATION.forEach((g, i) => {
  const r = genResults[i];
  const mark = r.category === g.expected ? ' ' : 'x';
  console.log(
    `  ${mark} ${g.test.merchant.padEnd(24)} -> ${String(r.category).padEnd(14)}` +
      ` conf ${r.confidence.toFixed(2)} via ${r.source}  (want ${g.expected})`,
  );
});
console.log();
console.log(JSON.stringify(categoriser.stats()));

function correction(merchant, descriptor, mcc, category, amountPence, daysAgo) {
  return {
    transactionId: `aged-out-${merchant}`,
    userId: 'auth0|demo',
    category,
    previous: null,
    descriptor,
    merchant,
    mcc,
    amountPence,
    correctedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
  };
}
