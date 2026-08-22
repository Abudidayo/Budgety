/**
 * Shared contracts between the Enable Banking adapter (this PR) and the
 * categorisation engine (separate PR).
 *
 * Nothing here mentions Enable Banking on purpose. The adapter owns the
 * provider; the categoriser owns the labels; this file is the seam.
 *
 * @module contracts
 */

/**
 * The 9 category slugs. Must stay in sync with src/data/types.ts CategoryId.
 * `null` is not a member — it is the explicit "unknown" value everywhere.
 */
export const CATEGORY_IDS = /** @type {const} */ ([
  'eating_out',
  'groceries',
  'nights_out',
  'transport',
  'shopping',
  'coffee',
  'subscriptions',
  'health',
  'uni',
]);

/**
 * Everything the categoriser is allowed to see about one transaction.
 *
 * Derived from the provider payload by the adapter. Deliberately
 * provider-agnostic: if we ever swap Enable Banking for TrueLayer, this shape
 * does not change and the categorisation engine needs no edits.
 *
 * @typedef {object} CategorisationInput
 * @property {string}  id                  Stable transaction id. See deriveTransactionId().
 * @property {string}  text                Canonical embedding text. See buildEmbeddingText().
 * @property {string}  merchant            Cleaned display name, e.g. "Pret A Manger".
 * @property {string}  descriptor          RAW unmodified bank descriptor. Never cleaned.
 * @property {number}  amountPence         Signed minor units. Negative = money out.
 * @property {string}  currency            ISO 4217, e.g. "GBP".
 * @property {string}  date                Booking date, ISO "YYYY-MM-DD".
 * @property {'spend'|'income'} kind
 * @property {string|null} mcc             ISO 18245 merchant category code, if the bank sent one.
 * @property {string|null} bankTransactionCode  Provider's own code, if any.
 * @property {string}  accountId           Which connected account this came from.
 */

/**
 * What the categoriser returns for one transaction.
 *
 * @typedef {object} CategorisationResult
 * @property {string} id                   Must echo CategorisationInput.id.
 * @property {import('./contracts.mjs').CategoryId|null} category
 * @property {number} confidence           0..1. Below CONFIDENCE_THRESHOLD => needsReview.
 * @property {'user'|'model'|'rules'|'none'} source
 *   'user'  - an explicit past correction for this merchant; always wins.
 *   'model' - the embedding engine.
 *   'rules' - the cold-start fallback in categorise.mjs.
 *   'none'  - could not classify; category MUST be null.
 */

/**
 * The interface the categorisation engine implements.
 *
 * BATCH, not per-transaction: embedding models want batches, and a 90-day sync
 * is 200-600 transactions. Implementations must return one result per input,
 * in any order, matched by id. Missing ids are treated as {category: null,
 * confidence: 0, source: 'none'} rather than an error.
 *
 * Must not throw for classification failures - degrade to source:'none'. The
 * adapter treats a thrown error as "categorisation unavailable" and falls back
 * to rules for the whole batch, because a sync that returns no data is worse
 * than a sync that returns uncategorised data.
 *
 * @typedef {object} Categoriser
 * @property {(inputs: CategorisationInput[], ctx: CategoriserContext) => Promise<CategorisationResult[]>} categorise
 */

/**
 * @typedef {object} CategoriserContext
 * @property {string} userId               Auth0 `sub`. Categorisation is per-user:
 *                                         two users may label the same merchant differently.
 * @property {CategoryFeedback[]} feedback Every correction this user has ever made,
 *                                         newest first. This is the training set.
 */

/**
 * One user correction. Persisted on the Railway volume and replayed as the
 * training signal on every sync.
 *
 * Denormalised on purpose: `descriptor`, `merchant`, `mcc` and `amountPence`
 * are copied in so the training set is self-contained and does not need a join
 * against transactions that may have aged out of the 90-day window.
 *
 * @typedef {object} CategoryFeedback
 * @property {string}  transactionId
 * @property {string}  userId
 * @property {import('./contracts.mjs').CategoryId} category   What the user says it is.
 * @property {import('./contracts.mjs').CategoryId|null} previous  What we had guessed.
 * @property {string}  descriptor
 * @property {string}  merchant
 * @property {string|null} mcc
 * @property {number}  amountPence
 * @property {string}  correctedAt         ISO 8601 datetime.
 */

/**
 * Below this, the transaction is surfaced as "needs review" in the UI even
 * though a category was predicted. Tune from the engine side; the adapter only
 * reads it.
 */
export const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Canonical text handed to the embedding model.
 *
 * MUST be deterministic and MUST NOT include the amount or date - those are
 * numeric features, and mixing them into the embedded string makes every
 * coffee at a different price look like a different merchant.
 *
 * Format: "<merchant> | <descriptor> | mcc:<mcc>"
 * with mcc omitted entirely when null (not "mcc:null").
 *
 * @param {{merchant: string, descriptor: string, mcc: string|null}} t
 * @returns {string}
 */
export function buildEmbeddingText(t) {
  const parts = [t.merchant, t.descriptor];
  if (t.mcc) parts.push(`mcc:${t.mcc}`);
  return parts.join(' | ');
}

/**
 * Stable id for a transaction.
 *
 * Providers are inconsistent: `entry_reference` is optional, and a pending
 * transaction's reference is not guaranteed to survive settlement. So:
 *
 *   - if the provider gave a reference, use it (prefixed by account, because
 *     references are only unique within an account);
 *   - otherwise derive a content hash.
 *
 * KNOWN LIMITATION: a pending transaction that settles with a different
 * amount or descriptor gets a different id, and will appear as a new
 * transaction. Any category the user assigned to the pending version is
 * matched back by merchant, not by id - which is why CategoryFeedback carries
 * the descriptor.
 *
 * @param {{accountId: string, reference: string|null, date: string, amountPence: number, descriptor: string}} t
 * @param {(s: string) => string} sha256Hex  injected so this file stays dependency-free
 * @returns {string}
 */
export function deriveTransactionId(t, sha256Hex) {
  if (t.reference) return `${t.accountId}:${t.reference}`;
  const material = `${t.accountId}|${t.date}|${t.amountPence}|${t.descriptor}`;
  return `${t.accountId}:h${sha256Hex(material).slice(0, 16)}`;
}
