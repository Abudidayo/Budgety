/**
 * The categorisation engine.
 *
 * Implements the `Categoriser` contract in contracts.mjs — the single object the
 * adapter injects. Everything under engine/ is an implementation detail of this
 * file; nothing outside it should import from there.
 *
 *   1. income          -> no category, by contract. Never guessed at.
 *   2. user correction -> an exact past correction on this merchant always wins.
 *   3. classifier      -> kNN over this user's corrections, with MCC and brand
 *                         priors for the cold start.
 *   4. nothing         -> source 'none'.
 *
 * This function does not throw. A thrown error is read by the adapter as
 * "engine unavailable" and drops the whole batch to rules, so every failure
 * here degrades one transaction to source 'none' instead.
 *
 * @module categorise
 */

import { buildEmbeddingText, CATEGORY_IDS } from './contracts.mjs';
import { createEmbedder } from './engine/embedder.mjs';
import { createEmbeddingCache, embedCached } from './engine/cache.mjs';
import { buildTrainingSet, classify } from './engine/classifier.mjs';
import { merchantKey } from './engine/tokenise.mjs';

const VALID_CATEGORIES = new Set(CATEGORY_IDS);

/**
 * @param {{embedder?: object, cachePath?: string|null, now?: () => number, logger?: Console}} [options]
 * @returns {import('./contracts.mjs').Categoriser & {stats: () => object}}
 */
export function createCategoriser(options = {}) {
  const embedder = options.embedder ?? createEmbedder();
  const cache = createEmbeddingCache({
    path: options.cachePath ?? process.env.EMBEDDING_CACHE_PATH ?? null,
    fingerprint: embedder.id,
  });
  const now = options.now ?? (() => Date.now());
  const log = options.logger ?? console;

  return {
    /**
     * @param {import('./contracts.mjs').CategorisationInput[]} inputs
     * @param {import('./contracts.mjs').CategoriserContext} ctx
     * @returns {Promise<import('./contracts.mjs').CategorisationResult[]>}
     */
    async categorise(inputs, ctx) {
      const batch = Array.isArray(inputs) ? inputs : [];
      if (batch.length === 0) return [];

      try {
        return await run(batch, ctx ?? {});
      } catch (err) {
        // Belt and braces. Every layer below already degrades on its own, so
        // reaching here means something genuinely unexpected — still not a
        // reason to fail a sync.
        log.error(`[engine] categorise failed, returning unclassified: ${err?.stack ?? err}`);
        return batch.map((t) => unclassified(t?.id));
      }
    },
    stats() {
      return { embedder: embedder.id, cache: cache.stats() };
    },
  };

  async function run(inputs, ctx) {
    const feedback = Array.isArray(ctx.feedback) ? ctx.feedback.filter(isUsableFeedback) : [];

    // Exact-merchant lookup. feedback arrives newest-first by contract, so the
    // first entry for a key is the user's most recent word on it and wins.
    /** @type {Map<string, string>} */
    const corrected = new Map();
    for (const f of feedback) {
      for (const key of [merchantKey(f.merchant), merchantKey(f.descriptor)]) {
        if (key && !corrected.has(key)) corrected.set(key, f.category);
      }
    }

    // One embedder call for the union of the training set and the batch, so a
    // merchant appearing in both is embedded once.
    const feedbackTexts = feedback.map((f) =>
      buildEmbeddingText({
        merchant: str(f.merchant),
        descriptor: str(f.descriptor),
        mcc: f.mcc ?? null,
      }),
    );
    const inputTexts = inputs.map(embeddingTextFor);

    let vectors;
    try {
      vectors = await embedCached(embedder, cache, [...feedbackTexts, ...inputTexts]);
    } catch (err) {
      // No vectors means no kNN, but the MCC and brand priors do not need them.
      log.warn(`[engine] embeddings unavailable, priors only: ${err?.message ?? err}`);
      vectors = [];
    }

    const empty = new Float64Array(0);
    const feedbackVecs = feedbackTexts.map((_, i) => vectors[i] ?? empty);
    const inputVecs = inputTexts.map((_, i) => vectors[feedbackTexts.length + i] ?? empty);

    const training = buildTrainingSet(feedback, feedbackVecs, now());

    return inputs.map((input, i) => {
      try {
        return classifyOne(input, inputVecs[i], training, corrected);
      } catch (err) {
        log.warn(`[engine] could not classify ${input?.id}: ${err?.message ?? err}`);
        return unclassified(input?.id);
      }
    });
  }

  function classifyOne(input, vec, training, corrected) {
    const id = input?.id;
    if (typeof id !== 'string' || id === '') {
      // Nothing to echo back. The adapter treats a missing id as unclassified
      // anyway, so returning a placeholder would only obscure the problem.
      throw new Error('input has no id');
    }

    // Income has no category, by contract. Confidence 1 rather than 0 because
    // we are certain it has none — a 0 would surface it as "needs review",
    // which would put every salary payment in the user's review queue.
    if (input.kind === 'income') {
      return { id, category: null, confidence: 1, source: 'none' };
    }

    for (const key of [merchantKey(str(input.merchant)), merchantKey(str(input.descriptor))]) {
      const hit = key && corrected.get(key);
      if (hit) return { id, category: hit, confidence: 1, source: 'user' };
    }

    const result = classify(input, vec, training);
    if (!result.category || !VALID_CATEGORIES.has(result.category)) {
      return unclassified(id);
    }
    return {
      id,
      category: result.category,
      confidence: result.confidence,
      source: result.source,
    };
  }
}

function embeddingTextFor(input) {
  // Prefer the canonical text the adapter computed; rebuild it only if absent,
  // so a cache keyed on the adapter's exact string stays valid.
  if (typeof input?.text === 'string' && input.text.trim() !== '') return input.text;
  return buildEmbeddingText({
    merchant: str(input?.merchant),
    descriptor: str(input?.descriptor),
    mcc: input?.mcc ?? null,
  });
}

function isUsableFeedback(f) {
  return Boolean(
    f &&
      VALID_CATEGORIES.has(f.category) &&
      (typeof f.merchant === 'string' || typeof f.descriptor === 'string'),
  );
}

function str(v) {
  return typeof v === 'string' ? v : '';
}

function unclassified(id) {
  return { id: typeof id === 'string' ? id : '', category: null, confidence: 0, source: 'none' };
}

/**
 * The default instance the adapter imports. Process-wide on purpose: the
 * embedding cache is most useful when it outlives a single request.
 */
export const categoriser = createCategoriser();
