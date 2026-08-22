/**
 * Embedding cache, keyed on the exact canonical text.
 *
 * Merchants repeat heavily: a 600-transaction sync is typically well under 100
 * distinct strings, so caching turns "600 embeddings" into "~90 embeddings" on
 * the first sync and "0" on every sync after. That is the difference between
 * a hosted embedder being viable on the connect-flow critical path and not.
 *
 * Entries are namespaced by the embedder's fingerprint, so swapping embedders
 * (or changing buildEmbeddingText) can never serve a vector from the wrong
 * vector space.
 *
 * Storage is an append-only JSONL file so a crash mid-write costs one line, not
 * the cache. Set EMBEDDING_CACHE_PATH to a path on the Railway volume to make
 * it survive a redeploy; leave it unset and the cache is in-memory only.
 *
 * @module engine/cache
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * @param {{path?: string|null, fingerprint: string, maxEntries?: number}} opts
 */
export function createEmbeddingCache(opts) {
  const { path = null, fingerprint, maxEntries = 20000 } = opts;
  /** @type {Map<string, Float64Array>} */
  const mem = new Map();
  let hits = 0;
  let misses = 0;
  let persistBroken = false;

  if (path && existsSync(path)) {
    try {
      for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line) continue;
        let row;
        // A torn final line is expected after a crash. Skip it, keep going.
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        if (row?.f !== fingerprint || typeof row.t !== 'string' || !Array.isArray(row.v)) continue;
        mem.set(row.t, Float64Array.from(row.v));
      }
    } catch (err) {
      console.warn(`[engine] embedding cache unreadable, starting empty: ${err.message}`);
    }
  }

  function persist(text, vec) {
    if (!path || persistBroken) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      // 5 decimal places: well below the precision cosine similarity can
      // distinguish here, and roughly halves the file.
      const v = Array.from(vec, (n) => Math.round(n * 1e5) / 1e5);
      appendFileSync(path, `${JSON.stringify({ f: fingerprint, t: text, v })}\n`);
    } catch (err) {
      // A read-only or full volume must not break categorisation.
      persistBroken = true;
      console.warn(`[engine] embedding cache not persisting: ${err.message}`);
    }
  }

  return {
    /** @param {string} text @returns {Float64Array|undefined} */
    get(text) {
      const hit = mem.get(text);
      if (hit) hits += 1;
      else misses += 1;
      return hit;
    },
    /** @param {string} text @param {Float64Array} vec */
    set(text, vec) {
      if (mem.size >= maxEntries) {
        // Crude but bounded: drop the oldest insertion. Merchant vocabulary is
        // small and this ceiling exists to stop a pathological volume, not to
        // be a real eviction policy.
        const oldest = mem.keys().next().value;
        if (oldest !== undefined) mem.delete(oldest);
      }
      mem.set(text, vec);
      persist(text, vec);
    },
    stats() {
      return { size: mem.size, hits, misses, persisted: Boolean(path) && !persistBroken };
    },
  };
}

/**
 * Embed `texts`, consulting the cache and only calling the embedder for the
 * strings it has never seen. Duplicates within one batch are collapsed too.
 *
 * @param {{embed: (t: string[]) => Promise<Float64Array[]>}} embedder
 * @param {ReturnType<typeof createEmbeddingCache>} cache
 * @param {string[]} texts
 * @returns {Promise<Float64Array[]>} one vector per input, same order
 */
export async function embedCached(embedder, cache, texts) {
  /** @type {Map<string, Float64Array>} */
  const resolved = new Map();
  /** @type {Set<string>} */
  const missing = new Set();

  for (const text of texts) {
    if (resolved.has(text) || missing.has(text)) continue;
    const hit = cache.get(text);
    if (hit) resolved.set(text, hit);
    else missing.add(text);
  }

  if (missing.size) {
    const pending = [...missing];
    const vectors = await embedder.embed(pending);
    pending.forEach((text, i) => {
      const vec = vectors[i];
      if (!vec) return;
      cache.set(text, vec);
      resolved.set(text, vec);
    });
  }

  const zero = new Float64Array(0);
  return texts.map((t) => resolved.get(t) ?? zero);
}
