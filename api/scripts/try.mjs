#!/usr/bin/env node
/**
 * Categorise one merchant from the command line, and show why.
 *
 *   node scripts/try.mjs "Costa Coffee" "COSTA COFFEE 4412 LEEDS GB" 5814
 *   node scripts/try.mjs "Zorbix" "ZORBIX LTD 8891 GB"
 *
 * Add --learn "<merchant>=<category>" to inject a past user correction and see
 * how the answer changes — this is the fastest way to watch the feedback loop
 * work without a bank connection:
 *
 *   node scripts/try.mjs "Marbury Food Mkt" "MARBURY FOOD MKT LTD 9981" \
 *     --learn "Marbury Food Market|MARBURY FOOD MARKET 42 GB=groceries"
 */

import { createCategoriser } from '../src/categorise.mjs';
import { buildEmbeddingText, CATEGORY_IDS, CONFIDENCE_THRESHOLD } from '../src/contracts.mjs';

const argv = process.argv.slice(2);
const learn = [];
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--learn') {
    learn.push(argv[i + 1] ?? '');
    i += 1;
  } else {
    positional.push(argv[i]);
  }
}

const [merchant, descriptor = merchant, mcc = null] = positional;
if (!merchant) {
  console.error('usage: node scripts/try.mjs "<merchant>" ["<descriptor>"] [mcc] [--learn "<merchant>|<descriptor>=<category>"]');
  process.exit(1);
}

const NOW = Date.now();
const feedback = learn.map((spec, i) => {
  const [lhs, category] = spec.split('=');
  const [m, d = m] = (lhs ?? '').split('|');
  if (!CATEGORY_IDS.includes(category)) {
    console.error(`--learn category must be one of: ${CATEGORY_IDS.join(', ')}`);
    process.exit(1);
  }
  return {
    transactionId: `cli-${i}`,
    userId: 'auth0|cli',
    category,
    previous: null,
    descriptor: d,
    merchant: m,
    mcc: null,
    amountPence: -1000,
    correctedAt: new Date(NOW - 86_400_000).toISOString(),
  };
});

const input = {
  id: 'cli:1',
  text: buildEmbeddingText({ merchant, descriptor, mcc }),
  merchant,
  descriptor,
  amountPence: -1000,
  currency: 'GBP',
  date: new Date(NOW).toISOString().slice(0, 10),
  kind: 'spend',
  mcc,
  bankTransactionCode: null,
  accountId: 'cli',
};

const categoriser = createCategoriser({ cachePath: null });
const [result] = await categoriser.categorise([input], { userId: 'auth0|cli', feedback });

console.log(`text        ${input.text}`);
if (feedback.length) console.log(`corrections ${feedback.map((f) => `${f.merchant} -> ${f.category}`).join(', ')}`);
console.log(`category    ${result.category ?? '(none — needs review)'}`);
console.log(`confidence  ${result.confidence}  ${result.confidence >= CONFIDENCE_THRESHOLD ? '' : '(below threshold: UI shows "Needs review")'}`);
console.log(`source      ${result.source}`);
