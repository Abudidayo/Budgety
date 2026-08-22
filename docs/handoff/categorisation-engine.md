# Handoff: the categorisation engine

**For the chat/agent building the embedding-based transaction categoriser.**
Written 2026-08-22 by the Enable Banking adapter lane. Assumes you have no
prior context on this repo.

---

## 1. What Budgety is

A mobile-first personal budgeting app. One question: *"where did my money go?"*
React + Vite SPA, TypeScript, deployed on Railway. Pastel-green, cat mascot.

It is a **hackathon project with a hard 19:00 BST deadline on 2026-08-22.**
Scope accordingly: working beats complete.

Current state on `main`:

- Dashboard, categories, statistics and settings pages all built.
- Behind an **Auth0 login gate** (`@auth0/auth0-react`, gate lives in `src/App.tsx`).
- `src/data/fixtures.ts` exports **empty** `ACCOUNTS` and `TRANSACTIONS` arrays.
  There is no sample data. The app renders empty states until a bank is connected.
- No backend existed until this work. `server.mjs` is a static file server.

## 2. Repo facts you will need

- GitHub: `Abudidayo/Budgety`. Default branch **`main`**; there is also **`staging`**.
- Branching model the user wants: `main` → `staging` → feature branches.
- The adapter work is on branch **`enable-banking-integration`**, PR **#5**.
- Railway project `Budgety`, service `web`, live at
  `https://web-production-acf5c.up.railway.app`. A second `api` service is
  planned but **not yet created**.

> **Gotcha that will waste 20 minutes of your life:** a stale `GH_TOKEN`
> environment variable on this machine is invalid and shadows a working keyring
> credential. `gh auth status` reports bad credentials and `git push` fails.
> Prefix with `env -u GH_TOKEN -u GITHUB_TOKEN`. Do not conclude you lack
> GitHub access.

## 3. Where the data actually comes from

The provider is **Enable Banking**, not TrueLayer — ignore `docs/research/truelayer-*.md`
and the TrueLayer wording in Linear ABU-24, both are stale.

**Enable Banking does not cover the UK.** Verified against the live API: both
registered applications report the same 29 EEA countries, GB is not among them,
`GET /aspsps?country=GB` returns 200 with zero banks, and none of the 815
sandbox institutions is a UK brand.

So the demo runs against Enable Banking's **Mock ASPSP** — a real consent
redirect flow (no credentials, no SCA) against a fake institution whose
accounts and transactions we populate ourselves via the control panel, in
**GBP with UK merchant names**.

**What this means for you:** the transactions your engine sees are synthetic and
we control them. If you need particular merchants, MCCs or edge cases to
exercise the model, say so — they can be written into the mock dataset. That is
a lever you would not have with a real bank.

## 4. The contract — read this properly

Full spec: **`docs/contracts/categorisation.md`**.
Runtime types: **`api/src/contracts.mjs`** — import from there, do not redeclare.

The shape of the world:

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

Three invariants:

1. **You never see a provider payload.** Only `CategorisationInput[]`.
2. **You never write.** Pure function of `(inputs, {userId, feedback})`.
   Persistence is the adapter's job.
3. **You are batch.** One call per sync, 200–600 transactions.

You implement exactly one thing:

```js
const categoriser = {
  async categorise(inputs, ctx) { /* → CategorisationResult[] */ }
};
```

`ctx` is `{ userId, feedback }` where `userId` is the Auth0 `sub` and
`feedback` is every correction that user has ever made, newest first.

### The four things people get wrong here

- **Embed `descriptor`, display `merchant`.** Both are on the input. `merchant`
  is cleaned and lossy ("Pret A Manger"); `descriptor` is the raw bank string
  ("PRET A MANGER 421 LONDON GB") whose branch/city/terminal noise is *signal*
  to an embedding model.
- **`buildEmbeddingText()` excludes amount and date deliberately.** Mixing the
  amount into the embedded string makes a £2.80 coffee and a £3.40 coffee look
  like different merchants. Use them as separate numeric features if you want
  them.
- **Feedback is denormalised, and must stay that way.** We hold a rolling
  90-day window. A correction from March must still be trainable in August
  after the original transaction has aged out. **Never join `transactionId`
  back to a live transaction — it will be missing.**
- **Never throw for a classification failure.** Degrade to `source: 'none'`. A
  thrown error is read as "engine unavailable" and the whole batch falls back
  to rules — a sync returning uncategorised data beats a sync returning nothing.

### Cold start is the demo case

At judging time the user is brand new and `ctx.feedback` is **empty**. Your
engine must produce something sensible from `mcc` and merchant text alone, or
return `source: 'none'` and let the rules fallback handle it. Do not build
something that only works after 50 corrections — it will show nothing on stage.

`mcc` (ISO 18245) is the strongest free feature available and Mock ASPSP
populates it. A static MCC→category table is a legitimate cold-start prior and
costs you almost nothing.

## 5. Your scope vs mine

| Owner | Files |
|---|---|
| **You** | `api/src/categorise.mjs`, anything new under `api/src/engine/` |
| Adapter | `api/server.mjs`, `api/src/enablebanking.mjs`, `api/src/normalise.mjs`, `api/src/sessions.mjs`, `api/src/auth.mjs` |
| **Shared — coordinate first** | `api/src/contracts.mjs` |

`api/src/categorise.mjs` will contain a naive merchant-substring rules matcher
as the default implementation and fallback. **Replacing its internals is your
job; keep the exported shape.**

Do not edit `src/data/types.ts`, `src/data/selectors.ts`,
`src/state/AppContext.tsx` or `src/components/AccountSelector.tsx` — the adapter
lane is actively changing all four and we will conflict.

## 6. Decisions that are yours, and that I could not make for you

1. **Where the embedding model runs.** An API call per unseen string puts
   200–600 embeddings on the critical path of a connect flow budgeted at
   10–30s. A local model needs memory headroom on the Railway `api` service,
   which changes the plan tier. **This is the biggest open question and it
   affects infrastructure, so decide it early.**
2. **Embedding cache.** Strongly recommended: cache by the exact `text` string
   and only embed unseen ones. Merchants repeat heavily — a 600-transaction
   sync is typically well under 100 distinct strings. Where that cache lives
   (Railway volume, in-memory, keyed file) is yours.
3. **Classification method.** Nearest-neighbour over the user's own corrected
   transactions is the obvious fit given the feedback loop, but centroid
   per category, or kNN with an MCC prior, are all reasonable. Not my call.
4. **Confidence calibration.** `CONFIDENCE_THRESHOLD` is 0.6 in
   `contracts.mjs`; below it the UI shows "needs review". Whether raw cosine
   similarity is a sane confidence is your problem — please don't return
   similarity-as-confidence without at least sanity-checking the distribution.

## 7. Things that are decided and not up for renegotiation

These were settled in a design session with the user; changing them means
changing the adapter and the UI too.

- **9 fixed categories**: `eating_out`, `groceries`, `nights_out`, `transport`,
  `shopping`, `coffee`, `subscriptions`, `health`, `uni`. Adding one means
  editing `CATEGORY_IDS` (contracts), `CategoryId` (`src/data/types.ts`) and
  `CATEGORIES` (`src/data/fixtures.ts`) — all three, or the UI renders a blank row.
- **`null` means unknown** and surfaces as "Needs review".
- **Income is not a category.** `kind: 'income'` always has `category: null`.
  Do not classify income into a spending bucket.
- **Categorisation is per-user.** A Tesco run is `groceries` for one person and
  `uni` for another. Do not pool training data across users without an explicit
  decision.
- **Money is integer pence, signed.** Negative is money out. No floats.
- **Categorisation runs server-side**, in the API — not in the browser.

## 8. Running it

```bash
cd api && npm install && npm start     # API, port from $PORT (default 8080)
npm install && npm run dev             # SPA on :5173
```

The API is plain ESM Node with `jose` as its only dependency so far. There is
no test runner wired up yet; if you add one, `node --test` needs no dependency.

## 9. Who to ask

The adapter lane (this document's author) owns everything upstream of
`categorise()`. If you need a different field on `CategorisationInput`, a
different `text` format, or more/other mock data to train against — ask rather
than working around it. Changing `contracts.mjs` unilaterally will break the
adapter silently, because JSDoc typedefs are not enforced at runtime.
