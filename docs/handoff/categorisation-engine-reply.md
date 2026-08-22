# Reply: the categorisation engine

**For the Enable Banking adapter lane.** Answers the four open decisions in
`categorisation-engine.md`, and lists what I need back from you.

Branch `categorisation-engine`, branched off `enable-banking-integration`
(that is where `contracts.mjs` lives). **I did not touch `contracts.mjs`.**

---

## Wiring it in

Nothing changes on your side beyond the import:

```js
import { categoriser } from './src/categorise.mjs';
// or, if you want to control the cache location / clock:
import { createCategoriser } from './src/categorise.mjs';
const categoriser = createCategoriser({ cachePath: '/data/embeddings.jsonl' });
```

`categorise(inputs, ctx)` is the contract shape, unchanged. It is pure, it does
not write, and it does not throw — every failure path inside it degrades to
`source: 'none'` for the affected transaction. There is a spare
`categoriser.stats()` if you want the embedder id and cache hit rate in a health
endpoint.

```
cd api && npm test        # 33 tests, no dependencies, node --test
cd api && npm run calibrate   # accuracy + confidence distribution
```

---

## Your four decisions

### 1. Where the embedding model runs — **locally, in-process, no new infra**

This was your biggest open question and the answer is the boring one: **no
infrastructure change at all.** No `api` plan tier bump, no new dependency, no
network call on the connect-flow critical path. A 600-transaction sync
categorises in **~6ms**.

The default embedder is a deterministic hashed-n-gram vectoriser over word
unigrams, bigrams, character 4-grams and the MCC. It is lexical, not neural: it
is excellent at "these two bank descriptors are the same merchant" and cannot
tell you that Odeon is a cinema. That second job is done by the MCC table and
the brand rules, which is why it does not need to be.

I did build the seam for a hosted provider — set `EMBEDDINGS_URL`,
`EMBEDDINGS_MODEL` and `EMBEDDINGS_API_KEY` and it will use any
OpenAI-compatible embeddings endpoint (Voyage is Anthropic's embeddings partner;
there is no Anthropic embeddings API, do not go looking for one). If the
provider errors or times out it fails over to local permanently for that
process. Unset, which is the default, none of that code runs.

**Why not neural for the hackathon:** 200–600 embeddings on the critical path of
a flow budgeted at 10–30s is a real latency risk, a live network dependency
during a stage demo is a worse one, and a local transformer needs memory
headroom on the `api` service — which is exactly the plan-tier change you did
not want to be forced into. The measured numbers below say the lexical version
is good enough that the trade is not close.

### 2. Embedding cache — **exact-text keyed, optional volume persistence**

Keyed on the exact canonical `text`, as you suggested. Duplicates within a batch
collapse too, so a 600-transaction sync across 3 merchants calls the embedder
**3 times, once**.

Set `EMBEDDING_CACHE_PATH` to a path on the Railway volume to persist it
(append-only JSONL, tolerates a torn line after a crash, never fails a sync if
the volume is read-only or full). Unset, it is in-memory for the process
lifetime. Entries are namespaced by an embedder fingerprint, so swapping
embedders — or changing `buildEmbeddingText` — invalidates them rather than
silently serving vectors from the wrong vector space.

### 3. Classification method — **kNN, but with strict tier precedence**

Three tiers, highest first:

| Tier | Signal | `source` |
|---|---|---|
| exact | this user has corrected this exact merchant before | `user` |
| knn | nearest neighbours among this user's corrections | `model` |
| rules | named UK brand (`rules.mjs`) | `rules` |
| mcc | ISO 18245 code (`mcc.mjs`) | `rules` |

Strict precedence rather than blending all the scores together, because blending
gets Costa wrong: the brand says `coffee`, MCC 5814 says fast food, and summing
them produces a low-confidence tie on a merchant we are certain about. Lower
tiers still adjust confidence — up when they agree with the winner, down when
they contradict it.

kNN only outranks a brand rule when its best neighbour clears cosine 0.45. Below
that it still answers when nothing else fires, but it will not overrule "this is
Costa" on the strength of a marginal match.

### 4. Confidence calibration — **no, raw cosine is not confidence**

You asked me not to return similarity-as-confidence without checking the
distribution. I checked it, and the check changed the design twice.

Measured on the held-out set: cosine between **different** merchants tops out at
**0.254** (p99 0.158). The **same** merchant reworded runs **0.373 to 0.759**.
That is a clean separation with a wide empty band, and it means two things:

- My first similarity floor (0.42) was **above three true positives** and was
  throwing away real matches.
- Absolute cosine is the wrong scale for confidence. In this space 0.4 is
  already a near-certain match. My first version cubed raw cosine and scored
  every correct held-out answer between **0.21 and 0.38** — i.e. it would have
  put 100%-correct predictions into the user's review queue. That is the exact
  failure you warned about, and it was live until I measured it.

The shipped confidence is the product of three things, because any two can look
perfect while the answer is worthless: **evidence** (is there signal at all),
**margin** (how far clear is the winner), **share** (how concentrated is the vote).
A single lonely neighbour scores high on margin and share and low on evidence,
which is correct.

`CONFIDENCE_THRESHOLD` stays at **0.6**. It earns its place: accuracy above it is
higher than below it, which is asserted in `calibration.test.mjs` so it stays
true.

**Measured** (`npm run calibrate`):

| Scenario | n | accuracy | coverage | precision above threshold |
|---|---|---|---|---|
| Cold start, zero feedback | 63 | 95% | 97% | 98% |
| After 5 corrections | 63 | 98% | 100% | 98% |
| Held-out, kNN only | 10 | 100% | 100% | 100% |

Read the cold-start row with suspicion — those merchants overlap the ones I
wrote rules for, so it partly measures my own table. The **held-out** row is the
honest one: invented merchant names, no brand rule possible, MCC stripped from
the test row, trained only on a differently-worded descriptor. The three lowest
scorers there land at 0.51/0.53/0.58 — correct, but flagged for review. That is
the behaviour I want.

---

## What I need from you

1. **Mock ASPSP data.** You offered; here is the list. The rows in
   `api/test/fixtures/labelled.mjs` are written as a shopping list — 63 UK
   merchants with realistic descriptors and MCCs. The ones worth having in the
   mock dataset are the awkward ones, because they are what makes the demo look
   clever rather than lucky:
   - **Costa / Starbucks with `merchant_category_code: 5814`** — brand and MCC
     disagree, and the engine visibly resolves it to `coffee`.
   - **Uber and Uber Eats in the same sync** — same brand token, two categories.
   - **Amazon and Amazon Prime in the same sync** — same, for subscriptions.
   - **One or two merchants with no recognisable brand and no MCC**, so there is
     something genuinely showing "Needs review" on stage for the user to correct
     — that is the moment that demonstrates the feedback loop exists.
   - Please do populate `merchant_category_code`. It is the whole cold start.
2. **One interpretation to sign off.** Income returns
   `{category: null, confidence: 1, source: 'none'}`. Confidence **1**, not 0 —
   we are certain it has no category, and a 0 would set `needsReview` on every
   salary payment and fill the user's review queue with wages. If your
   `needsReview` derivation special-cases income already, this is harmless
   either way; if it does not, this is the bit that matters.
3. **Nothing else.** `CategorisationInput` has everything I need, the `text`
   format is right, and I have no changes to request on `contracts.mjs`. The
   engine reads `input.text` when present and only rebuilds it if absent, so the
   cache stays keyed on your exact string.

---

## Limitations, stated plainly

- **The brand rules are a UK-shaped hand-written table.** They will not
  generalise to a merchant nobody thought of. That is what the MCC prior and the
  user feedback loop are for, but on a brand-new user with a bank that sends no
  MCC, the honest answer is `null` and the engine gives it.
- **The embedder is lexical.** It matches merchant strings; it does not know
  what a business does. A user correcting "Odeon" teaches it Odeon, not cinemas.
- **`5942` book stores and `5943` stationery map to `uni`, not `shopping`.**
  That is a deliberate call for a student budgeting app and is wrong for any
  other audience. Flagged in `mcc.mjs`.
- **The similarity thresholds are fitted to 10 held-out pairs.** They are
  measured rather than guessed, which is better than where they started, but ten
  pairs is ten pairs. `npm run calibrate` re-prints the distribution; re-run it
  if you change `buildEmbeddingText`, since that invalidates both the cached
  vectors and the numbers.
