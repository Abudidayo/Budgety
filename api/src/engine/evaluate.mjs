/**
 * Measurement for the engine. Imported by both the calibration script and the
 * calibration test, so the number the test asserts on is the number the script
 * prints.
 *
 * The question this answers is not "is accuracy high" — it is "does confidence
 * mean anything". A 0.9 that is right 55% of the time is worse than useless,
 * because CONFIDENCE_THRESHOLD decides what the user is asked to review.
 *
 * @module engine/evaluate
 */

import { CONFIDENCE_THRESHOLD } from '../contracts.mjs';

const BUCKETS = [0, 0.2, 0.4, 0.6, 0.8, 1.0001];

/**
 * @param {{expected: string, hard?: boolean}[]} labelled
 * @param {import('../contracts.mjs').CategorisationResult[]} results
 */
export function evaluate(labelled, results) {
  const rows = labelled.map((row, i) => {
    const r = results[i] ?? { category: null, confidence: 0, source: 'none' };
    return {
      expected: row.expected,
      hard: Boolean(row.hard),
      got: r.category,
      confidence: r.confidence,
      source: r.source,
      correct: r.category === row.expected,
    };
  });

  const easy = rows.filter((r) => !r.hard);
  const buckets = [];
  for (let i = 0; i < BUCKETS.length - 1; i += 1) {
    const lo = BUCKETS[i];
    const hi = BUCKETS[i + 1];
    const inBucket = rows.filter((r) => r.confidence >= lo && r.confidence < hi);
    buckets.push({
      label: `${lo.toFixed(1)}-${Math.min(hi, 1).toFixed(1)}`,
      n: inBucket.length,
      accuracy: inBucket.length ? mean(inBucket.map((r) => (r.correct ? 1 : 0))) : null,
    });
  }

  const confident = rows.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD);
  const review = rows.filter((r) => r.confidence < CONFIDENCE_THRESHOLD);

  return {
    rows,
    total: rows.length,
    accuracy: mean(rows.map((r) => (r.correct ? 1 : 0))),
    accuracyExcludingHard: easy.length ? mean(easy.map((r) => (r.correct ? 1 : 0))) : 0,
    coverage: mean(rows.map((r) => (r.got ? 1 : 0))),
    buckets,
    // Precision on what we show without a review prompt. This is the number
    // that decides whether the dashboard looks trustworthy on stage.
    confidentN: confident.length,
    confidentAccuracy: confident.length ? mean(confident.map((r) => (r.correct ? 1 : 0))) : null,
    reviewN: review.length,
    reviewAccuracy: review.length ? mean(review.map((r) => (r.correct ? 1 : 0))) : null,
    bySource: countBy(rows.map((r) => r.source)),
  };
}

/** Human-readable report. */
export function formatReport(evaluation, title = 'calibration') {
  const pct = (v) => (v === null ? '   -' : `${(v * 100).toFixed(0)}%`.padStart(4));
  const lines = [
    `── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}`,
    `n=${evaluation.total}  accuracy=${pct(evaluation.accuracy)}  ` +
      `excl. hard=${pct(evaluation.accuracyExcludingHard)}  coverage=${pct(evaluation.coverage)}`,
    `shown as-is (conf >= ${CONFIDENCE_THRESHOLD}): n=${evaluation.confidentN} accuracy=${pct(evaluation.confidentAccuracy)}`,
    `needs review    (conf <  ${CONFIDENCE_THRESHOLD}): n=${evaluation.reviewN} accuracy=${pct(evaluation.reviewAccuracy)}`,
    'confidence bucket   n   accuracy',
  ];
  for (const b of evaluation.buckets) {
    lines.push(`  ${b.label.padEnd(16)}${String(b.n).padStart(3)}   ${pct(b.accuracy)}`);
  }
  lines.push(`source: ${JSON.stringify(evaluation.bySource)}`);
  return lines.join('\n');
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function countBy(xs) {
  return xs.reduce((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {});
}
