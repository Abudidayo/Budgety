/**
 * Embedders. Pluggable on purpose — see docs/handoff/categorisation-engine-reply.md
 * for why the default is local.
 *
 * An embedder is:
 *   { id: string, dim: number, embed(texts: string[]): Promise<Float64Array[]> }
 *
 * `id` is a fingerprint. It is baked into cache keys, so swapping embedders
 * invalidates cached vectors instead of silently mixing two vector spaces.
 * Every vector returned is L2-normalised, so cosine similarity is a dot product.
 *
 * @module engine/embedder
 */

import { features } from './tokenise.mjs';

const DEFAULT_DIM = 512;

/** FNV-1a, 32-bit. Cheap, stable across processes, good enough for hashing. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic, dependency-free, offline embedder.
 *
 * This is the hashing trick: every feature from tokenise.features() is hashed
 * to a dimension and a sign, and accumulated with sub-linear term weighting.
 * The result behaves like a TF-weighted lexical vector — it captures "these two
 * bank descriptors are the same merchant" very well, and "Odeon is a cinema"
 * not at all. The MCC prior and the brand rules cover that second job.
 *
 * The signed hash matters: without it, colliding features always add, and every
 * vector drifts toward a common direction, inflating every similarity.
 *
 * @param {{dim?: number}} [opts]
 */
export function createLocalEmbedder(opts = {}) {
  const dim = opts.dim ?? DEFAULT_DIM;

  return {
    id: `local-hash-v1-d${dim}`,
    dim,
    /**
     * @param {string[]} texts
     * @returns {Promise<Float64Array[]>}
     */
    async embed(texts) {
      return texts.map((text) => {
        const vec = new Float64Array(dim);
        for (const [feature, count] of features(text)) {
          const h = fnv1a(feature);
          const idx = h % dim;
          const sign = (h >>> 31) & 1 ? -1 : 1;
          // Sub-linear in the repeat count: a merchant named twice in the
          // descriptor should not weigh twice as much as one named once.
          vec[idx] += sign * (1 + Math.log(count));
        }
        let norm = 0;
        for (let i = 0; i < dim; i += 1) norm += vec[i] * vec[i];
        norm = Math.sqrt(norm);
        if (norm > 0) for (let i = 0; i < dim; i += 1) vec[i] /= norm;
        return vec;
      });
    },
  };
}

/**
 * OpenAI-compatible embeddings endpoint. Voyage (Anthropic's embeddings
 * partner) and OpenAI both speak `{input, model} -> {data:[{embedding}]}`, so
 * one client covers both — the URL and model id are configuration, not code.
 *
 * There is no Anthropic embeddings API; do not go looking for one.
 *
 * Throws on any failure. Callers are expected to fall back, not to retry:
 * this sits on the critical path of a connect flow budgeted at 10-30s.
 *
 * @param {{url: string, model: string, apiKey: string, dim?: number, batchSize?: number, timeoutMs?: number, fetchImpl?: typeof fetch}} config
 */
export function createRemoteEmbedder(config) {
  const {
    url,
    model,
    apiKey,
    dim = 0,
    batchSize = 96,
    timeoutMs = 15000,
    fetchImpl = globalThis.fetch,
  } = config;

  if (!url || !model || !apiKey) {
    throw new Error('remote embedder needs url, model and apiKey');
  }

  return {
    id: `remote:${model}`,
    dim,
    async embed(texts) {
      /** @type {Float64Array[]} */
      const out = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const chunk = texts.slice(i, i + batchSize);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let payload;
        try {
          const res = await fetchImpl(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ input: chunk, model }),
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new Error(`embeddings HTTP ${res.status}`);
          }
          payload = await res.json();
        } finally {
          clearTimeout(timer);
        }

        const rows = payload?.data;
        if (!Array.isArray(rows) || rows.length !== chunk.length) {
          throw new Error('embeddings response shape unexpected');
        }
        // Providers are permitted to return rows out of order; `index` is
        // authoritative when present.
        const ordered = new Array(chunk.length);
        rows.forEach((row, n) => {
          const at = Number.isInteger(row?.index) ? row.index : n;
          ordered[at] = row?.embedding;
        });
        for (const embedding of ordered) {
          if (!Array.isArray(embedding) || embedding.length === 0) {
            throw new Error('embeddings response missing a vector');
          }
          out.push(l2(Float64Array.from(embedding)));
        }
      }
      return out;
    },
  };
}

function l2(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i += 1) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vec.length; i += 1) vec[i] /= norm;
  return vec;
}

/**
 * Wrap an embedder so a failure degrades to the local one instead of taking the
 * sync down. Fails over permanently for the life of the process after the first
 * error — a provider that is down stays down for the next 600 strings, and
 * retrying each batch would blow the connect-flow latency budget.
 *
 * @param {{id: string, dim: number, embed: (t: string[]) => Promise<Float64Array[]>}} primary
 * @param {{onFallback?: (err: Error) => void}} [opts]
 */
export function withLocalFallback(primary, opts = {}) {
  const local = createLocalEmbedder();
  let failed = false;
  return {
    get id() {
      return failed ? local.id : primary.id;
    },
    dim: primary.dim,
    async embed(texts) {
      if (failed) return local.embed(texts);
      try {
        return await primary.embed(texts);
      } catch (err) {
        failed = true;
        opts.onFallback?.(/** @type {Error} */ (err));
        return local.embed(texts);
      }
    },
  };
}

/**
 * Build the embedder the environment asks for.
 *
 * Default is local. Set EMBEDDINGS_URL + EMBEDDINGS_MODEL + EMBEDDINGS_API_KEY
 * to use a hosted provider; anything missing falls back to local silently,
 * because a missing key on the demo machine must not break the demo.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function createEmbedder(env = process.env) {
  const url = env.EMBEDDINGS_URL;
  const model = env.EMBEDDINGS_MODEL;
  const apiKey = env.EMBEDDINGS_API_KEY;
  if (!url || !model || !apiKey) return createLocalEmbedder();

  return withLocalFallback(
    createRemoteEmbedder({
      url,
      model,
      apiKey,
      timeoutMs: Number(env.EMBEDDINGS_TIMEOUT_MS) || 15000,
    }),
    {
      onFallback: (err) => {
        console.warn(`[engine] remote embeddings unavailable, using local: ${err.message}`);
      },
    },
  );
}

/**
 * Cosine similarity of two L2-normalised vectors.
 * @param {Float64Array} a
 * @param {Float64Array} b
 */
export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i += 1) dot += a[i] * b[i];
  return dot;
}
