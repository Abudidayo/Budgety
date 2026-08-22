/**
 * The classifier: k-nearest-neighbour over the user's own corrections, with the
 * MCC table and the brand rules as cold-start priors.
 *
 * Three tiers, in strict precedence:
 *
 *   1. knn   — this user has corrected something that looks like this before.
 *   2. rules — a named UK brand.
 *   3. mcc   — a merchant category code.
 *
 * Strict precedence rather than a free-for-all score blend, because blending
 * gets Costa wrong: the brand says coffee, MCC 5814 says fast food, and summing
 * them produces a low-confidence tie on a merchant we are certain about. The
 * lower tiers still matter — they adjust confidence up when they agree with the
 * winner and down when they contradict it.
 *
 * Nothing here throws. Callers rely on that; see categorise.mjs.
 *
 * @module engine/classifier
 */

import { cosine } from './embedder.mjs';
import { mccPrior } from './mcc.mjs';
import { ruleMatch } from './rules.mjs';

// These four numbers are measured, not guessed. On the held-out set in
// test/fixtures/labelled.mjs, cosine between DIFFERENT merchants tops out at
// 0.254 (p99 0.158) while the same merchant reworded runs 0.373 to 0.759.
// That gap is what the engine trades on. Re-run scripts/calibrate.mjs after
// changing the embedder or buildEmbeddingText — these will need to move.

/** Above the observed noise ceiling (0.254), below the weakest true match. */
const SIM_FLOOR = 0.3;
/** A match this close is as good as it gets; strength saturates here. */
const SIM_STRONG = 0.7;
/**
 * Below this, kNN still votes but does not outrank a named brand. A 0.37
 * neighbour is real evidence and worth answering on when nothing else fires;
 * it is not worth overruling "this is Costa" for.
 */
const SIM_TRUST = 0.45;
/** How many neighbours vote. */
const K = 8;
/** Corrections lose half their vote every this many days. */
const HALF_LIFE_DAYS = 120;
/** ...but never fall below this, or an old correction becomes unlearnable. */
const MIN_RECENCY = 0.25;
/** Confidence in a category is capped here; we are never certain from a guess. */
const MAX_CONFIDENCE = 0.99;
/**
 * Saturation point of the evidence curve. Small, because SIM_FLOOR has already
 * done the discriminating: anything that clears the floor is almost certainly
 * the same merchant, so evidence should rise steeply rather than demand a
 * crowd. Disagreement between neighbours is handled by margin and share below.
 */
const EVIDENCE_SCALE = 0.22;
/** How many categories exist. Used to normalise "share of the vote". */
const N_CATEGORIES = 9;

/**
 * Precompute the training set: one embedded, weighted example per correction.
 *
 * `feedback` is denormalised by contract, so this never joins back to a live
 * transaction — a correction from March trains fine in August after the
 * original transaction has aged out of the 90-day window.
 *
 * @param {import('../contracts.mjs').CategoryFeedback[]} feedback
 * @param {Float64Array[]} vectors  aligned with feedback
 * @param {number} nowMs
 */
export function buildTrainingSet(feedback, vectors, nowMs) {
  /** @type {{vec: Float64Array, category: string, recency: number}[]} */
  const set = [];
  feedback.forEach((f, i) => {
    const vec = vectors[i];
    if (!vec || vec.length === 0 || !f?.category) return;
    const at = Date.parse(f.correctedAt ?? '');
    const ageDays = Number.isFinite(at) ? Math.max(0, (nowMs - at) / 86_400_000) : 0;
    const recency = Math.max(MIN_RECENCY, 0.5 ** (ageDays / HALF_LIFE_DAYS));
    set.push({ vec, category: f.category, recency });
  });
  return set;
}

/**
 * kNN vote for one transaction.
 *
 * A neighbour votes with its *strength* — how far it clears the noise floor on
 * the way to SIM_STRONG — not with its raw cosine. Raw cosine is the wrong
 * scale: in this vector space 0.4 is already a confident match, and an earlier
 * version that cubed raw similarity scored every true positive under 0.4
 * confidence, which put correct answers in the user's review queue.
 *
 * @param {Float64Array} vec
 * @param {ReturnType<typeof buildTrainingSet>} training
 * @returns {{scores: Record<string, number>, top: number, count: number}}
 */
function knnVote(vec, training) {
  /** @type {Record<string, number>} */
  const scores = {};
  if (!vec || vec.length === 0 || training.length === 0) {
    return { scores, top: 0, count: 0 };
  }

  /** @type {{sim: number, category: string, recency: number}[]} */
  const neighbours = [];
  for (const example of training) {
    const sim = cosine(vec, example.vec);
    if (sim >= SIM_FLOOR) {
      neighbours.push({ sim, category: example.category, recency: example.recency });
    }
  }
  if (neighbours.length === 0) return { scores, top: 0, count: 0 };

  neighbours.sort((a, b) => b.sim - a.sim);
  const voters = neighbours.slice(0, K);
  for (const n of voters) {
    scores[n.category] = (scores[n.category] ?? 0) + strength(n.sim) * n.recency;
  }
  return { scores, top: voters[0].sim, count: voters.length };
}

/** Map a cosine onto 0..1 across the band where it actually discriminates. */
function strength(sim) {
  return clamp((sim - SIM_FLOOR) / (SIM_STRONG - SIM_FLOOR), 0, 1);
}

/**
 * Turn a set of category scores into (winner, confidence).
 *
 * Confidence is deliberately NOT raw cosine similarity. Three things have to be
 * true before we claim to be sure, and the product of them is the confidence:
 *
 *   evidence — is there enough total signal at all? A single 0.45 neighbour
 *              should never produce a confident answer however lonely it is.
 *   margin   — how far clear is the winner of the runner-up?
 *   share    — how concentrated is the vote across all categories?
 *
 * Two of the three can be perfect while the answer is still worthless (one weak
 * neighbour: margin 1, share 1, evidence tiny), which is exactly why they
 * multiply rather than average.
 *
 * @param {Record<string, number>} scores
 */
function resolve(scores) {
  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0 || entries[0][1] <= 0) return null;

  const [category, top] = entries[0];
  const second = entries[1]?.[1] ?? 0;
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  const share = top / total;
  const floor = 1 / N_CATEGORIES;
  const shareN = Math.max(0, (share - floor) / (1 - floor));
  const margin = top > 0 ? (top - second) / top : 0;
  const evidence = 1 - Math.exp(-top / EVIDENCE_SCALE);

  const raw = evidence * (0.4 * shareN + 0.6 * margin);
  return { category, confidence: 0.05 + 0.9 * raw, top, margin, evidence };
}

/**
 * Classify one transaction.
 *
 * @param {import('../contracts.mjs').CategorisationInput} input
 * @param {Float64Array} vec  embedding of input.text
 * @param {ReturnType<typeof buildTrainingSet>} training
 * @returns {{category: string|null, confidence: number, source: 'model'|'rules'|'none', why: string}}
 */
export function classify(input, vec, training) {
  const vote = knnVote(vec, training);
  const knn = resolve(vote.scores);
  const rule = ruleMatch(input);
  const mcc = mccPrior(input?.mcc);

  /** Opinions from every tier, for the agreement adjustment below. */
  const opinions = [
    knn && { tier: 'knn', category: knn.category },
    rule && { tier: 'rules', category: rule.category },
    mcc && { tier: 'mcc', category: mcc.category },
  ].filter(Boolean);

  /** @type {{tier: string, category: string, base: number}|null} */
  let primary = null;
  if (knn && vote.top >= SIM_TRUST) {
    // This user has corrected something that clearly is this merchant. Their
    // word beats any brand table — a Tesco run is groceries for one person and
    // uni supplies for another, and only the correction knows which.
    primary = { tier: 'knn', category: knn.category, base: knn.confidence };
  } else if (rule) {
    primary = { tier: 'rules', category: rule.category, base: rule.confidence };
  } else if (mcc) {
    // An MCC is a decent hint but it is the bank's opinion about the merchant,
    // not about this user's budget. Discount it so a mid-strength code lands
    // below CONFIDENCE_THRESHOLD and surfaces as "needs review".
    primary = { tier: 'mcc', category: mcc.category, base: mcc.strength * 0.78 };
  } else if (knn) {
    // A neighbour too weak to outrank a brand, but nothing else fired. Worth
    // answering on — it lands near the threshold and surfaces for review.
    primary = { tier: 'knn', category: knn.category, base: knn.confidence };
  }

  if (!primary) {
    return { category: null, confidence: 0, source: 'none', why: 'no signal' };
  }

  let agree = 0;
  let disagree = 0;
  for (const o of opinions) {
    if (o.tier === primary.tier) continue;
    if (o.category === primary.category) agree += 1;
    else disagree += 1;
  }

  const confidence = clamp(
    primary.base + Math.min(0.12, 0.06 * agree) - Math.min(0.2, 0.1 * disagree),
    0.05,
    MAX_CONFIDENCE,
  );

  return {
    category: primary.category,
    confidence: round3(confidence),
    source: primary.tier === 'knn' ? 'model' : 'rules',
    why: `${primary.tier}${agree ? ` +${agree} agree` : ''}${disagree ? ` -${disagree} disagree` : ''}`,
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

export const _internals = {
  SIM_FLOOR,
  SIM_STRONG,
  SIM_TRUST,
  EVIDENCE_SCALE,
  K,
  HALF_LIFE_DAYS,
  knnVote,
  resolve,
  strength,
};
