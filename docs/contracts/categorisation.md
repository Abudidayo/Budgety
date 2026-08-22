# Transaction categorisation contract

**Status:** agreed 2026-08-22. Owned jointly by the Enable Banking adapter PR
(`api/`) and the categorisation engine PR.

The adapter fetches and normalises. The engine labels. This document is the
seam between them, so the two can be built in parallel and merged without
either rewriting the other.

Runtime types live in [`api/src/contracts.mjs`](../../api/src/contracts.mjs).
Import from there rather than redeclaring shapes.

---

## The pipeline

```
Enable Banking          adapter                engine                 client
──────────────          ───────                ──────                 ──────
raw provider JSON  ──▶  normalise()       ──▶  categorise()     ──▶   Transaction[]
                        RawTransaction         CategorisationInput[]  (UI shape)
                                          ◀──  CategorisationResult[]
                                               ▲
                                               │ CategoryFeedback[]
                                          user corrections (volume)
```

Three rules that make this work:

1. **The engine never sees a provider payload.** It receives
   `CategorisationInput[]`. If we swap Enable Banking for TrueLayer, the engine
   does not change.
2. **The engine never writes.** It is a pure function of
   `(inputs, {userId, feedback})`. Persistence is the adapter's job.
3. **The engine is batch.** One call per sync, 200–600 transactions, not one
   call per transaction.

---

## What the engine receives

```ts
interface CategorisationInput {
  id: string;                  // stable; echo it back verbatim
  text: string;                // canonical embedding text — see below
  merchant: string;            // cleaned: "Pret A Manger"
  descriptor: string;          // RAW, never cleaned: "PRET A MANGER 421 LONDON GB"
  amountPence: number;         // signed minor units; negative = money out
  currency: string;            // "GBP"
  date: string;                // "YYYY-MM-DD" (booking date)
  kind: 'spend' | 'income';
  mcc: string | null;          // ISO 18245, when the bank supplies it
  bankTransactionCode: string | null;
  accountId: string;
}
```

**Both `merchant` and `descriptor` are present deliberately.** `merchant` is
lossy — it is what the UI shows. `descriptor` is the raw bank string, which
carries branch, city and terminal noise that is *signal* to an embedding model
and noise to a human. Embed the descriptor; display the merchant.

`mcc` is the single strongest feature available and costs nothing — Enable
Banking's Mock ASPSP and most real banks populate `merchant_category_code`.
Worth using as a prior even before the user has corrected anything.

### Embedding text

`buildEmbeddingText()` produces:

```
<merchant> | <descriptor> | mcc:<mcc>        // mcc segment omitted when null
Pret A Manger | PRET A MANGER 421 LONDON GB | mcc:5814
```

It deliberately **excludes amount and date**. Mixing a numeric amount into the
embedded string makes a £2.80 coffee and a £3.40 coffee look like different
merchants. Use amount and date as separate numeric features if you want them.

If you change this format, change it in `contracts.mjs` — any cached embeddings
keyed on the old string are invalidated.

---

## What the engine returns

```ts
interface CategorisationResult {
  id: string;                  // must match an input id
  category: CategoryId | null; // null = genuinely unknown
  confidence: number;          // 0..1
  source: 'user' | 'model' | 'rules' | 'none';
}
```

- One result per input, any order, matched by `id`.
- A missing `id` is **not** an error — it is treated as
  `{category: null, confidence: 0, source: 'none'}`.
- `confidence < 0.6` (`CONFIDENCE_THRESHOLD`) sets `needsReview: true` on the
  transaction the user sees, even though a category was predicted.
- **Do not throw for classification failures.** Degrade to `source: 'none'`.
  A thrown error is read as "categorisation unavailable" and the adapter falls
  back to rules for the entire batch — a sync returning uncategorised data is
  far better than a sync returning no data.

`source` exists so the UI can be honest ("we guessed" vs "you told us") and so
we can measure the engine against the rules baseline.

---

## Training signal

Every manual correction is persisted and replayed to the engine on each sync
via `ctx.feedback`, newest first:

```ts
interface CategoryFeedback {
  transactionId: string;
  userId: string;              // Auth0 `sub`
  category: CategoryId;        // what the user says it is
  previous: CategoryId | null; // what we had guessed
  descriptor: string;          // denormalised
  merchant: string;            // denormalised
  mcc: string | null;          // denormalised
  amountPence: number;         // denormalised
  correctedAt: string;         // ISO 8601
}
```

**Why denormalised:** the training set must stay self-contained. We only hold a
rolling 90-day transaction window, so a correction made in March must still be
trainable in August after the original transaction has aged out. Never design
the engine to join `transactionId` back to a live transaction — it will be
missing.

**Categorisation is per-user.** Two users may legitimately file the same
merchant differently (a Tesco run is `groceries` for one, `uni` for another).
`ctx.userId` is the Auth0 `sub`; do not pool training data across users without
an explicit decision to do so.

**Cold start is real and is the common case at demo time.** A brand-new user
has zero feedback. The engine must produce something sensible from MCC and
merchant text alone, or return `source:'none'` and let the rules fallback in
`api/src/categorise.mjs` handle it.

---

## Stable ids

```
entry_reference present  →  "<accountId>:<entry_reference>"
otherwise                →  "<accountId>:h<sha256(accountId|date|amountPence|descriptor)[0:16]>"
```

Account-prefixed because provider references are only unique within an account.

**Known limitation:** a pending transaction that settles with a different
amount or descriptor produces a *different* id and appears as a new
transaction. This is why `CategoryFeedback` carries `descriptor` and `merchant`
— corrections are matched back by merchant text, not by id.

---

## The categories

Fixed at 9, matching `src/data/types.ts`:

`eating_out`, `groceries`, `nights_out`, `transport`, `shopping`, `coffee`,
`subscriptions`, `health`, `uni`

`null` means unknown and surfaces as "Needs review". Income is **not** a
category — it is `kind: 'income'` with `category: null`. Do not attempt to
classify income into a spending category.

Adding a category means changing `CATEGORY_IDS` in `contracts.mjs`,
`CategoryId` in `src/data/types.ts`, and `CATEGORIES` in
`src/data/fixtures.ts` (which carries the emoji and budget). All three, or the
UI renders a blank row.

---

## Wiring it in

The adapter calls a single injected object:

```js
const categoriser = {
  async categorise(inputs, ctx) { /* your engine */ }
};
```

Default implementation is the rules matcher in `api/src/categorise.mjs`. Swap
it by exporting the same shape — no other adapter code changes.

Suggested split so the PRs don't collide:

| Owner | Files |
|---|---|
| Adapter PR | `api/server.mjs`, `api/src/enablebanking.mjs`, `api/src/normalise.mjs`, `api/src/sessions.mjs`, `api/src/auth.mjs`, `api/src/contracts.mjs` |
| Engine PR | `api/src/categorise.mjs` and anything new under `api/src/engine/` |

`contracts.mjs` is shared — coordinate before editing it.
