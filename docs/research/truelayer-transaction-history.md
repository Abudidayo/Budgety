# TrueLayer transaction-history data for Budgety

Research date: 2026-08-22

## Executive summary

Budgety's prototype is clearly UK-oriented: it uses pounds and names Monzo, Barclays, and Amex. There is no provider integration or application data model in the repository yet, so this report treats the phrase "tool layer" as **TrueLayer**, which fits that evidence.

For a new implementation, Budgety should design against **TrueLayer Data API v3**, not v1. TrueLayer explicitly directs first-time Data integrations to v3, and v3 is currently UK-only. Its transaction model is intentionally small: a transaction has an ID, RFC 3339 timestamp, original description, ISO currency, signed integer amount in minor units, and `pending` or `settled` status. Merchant and category data are optional enrichments. ([TrueLayer v1 overview](https://docs.truelayer.com/docs/data-api-basics), [Data v3 overview](https://docs.truelayer.com/docs/enable-your-users-to-connect-their-bank-account))

The most consequential modeling decisions are:

- Keep TrueLayer's raw object separately from Budgety's normalized record.
- Store money as integer minor units. In v3, a debit is negative.
- Treat merchant and category enrichment as nullable, mutable annotations, not transaction identity.
- Model syncs as asynchronous, cursor-paginated snapshots rather than a permanent event feed.
- Treat pending items as replaceable observations. The docs do not promise that the same ID survives settlement.
- Do not expect location, running balance, provider transaction IDs, or the older classification array in the current v3 object.

## Current TrueLayer Data v3 model

### Connected accounts

`GET /v3/connected-accounts` returns `items` plus `pagination`. For a bank account, the documented fields are:

| Field | Shape | Notes |
| --- | --- | --- |
| `id` | string | TrueLayer connected-account ID |
| `type` | `account` | Discriminator; the endpoint also reserves `card` |
| `account_type` | `current \| savings` | Bank-account type |
| `customer_segment` | `retail \| business` | Customer segment |
| `currency` | `GBP \| EUR` | Currently documented account currencies |
| `account_identifiers` | array | One or more discriminated objects: UK sort code/account number and/or IBAN |
| `bic` | string, optional | Bank Identifier Code |
| `account_holder_names` | string[] | Can be empty if the bank does not supply names |

An account response looks like:

```json
{
  "items": [
    {
      "id": "56c7b029e0f8ec5a2334fb0ffc2fface",
      "type": "account",
      "account_type": "current",
      "customer_segment": "retail",
      "currency": "GBP",
      "account_identifiers": [
        {
          "type": "sort_code_account_number",
          "sort_code": "560029",
          "account_number": "26207729"
        },
        {
          "type": "iban",
          "iban": "GB32CLRB04066800012315"
        }
      ],
      "bic": "MONZGB2LXXX",
      "account_holder_names": ["John Smith"]
    }
  ],
  "pagination": { "next_cursor": null }
}
```

The current v3 reference says the endpoint returns at most 50 items and that account-list cursor pagination is not active yet. It also says richer card-specific fields will be added when card support is introduced, so Budgety's Amex concept should be validated against TrueLayer before committing to v3 card coverage. ([TrueLayer connected-accounts reference](https://docs.truelayer.com/reference/get-accounts), [account guide](https://docs.truelayer.com/docs/get-all-user-accounts))

### Transaction request and response

Transaction history is an asynchronous request resource:

1. `POST /v3/connected-accounts/{account_id}/transactions/requests` with the `Connection-Id` header and `{from, to, cursor?, page_size?, enrichment?}`.
2. Receive HTTP 202 with `{id, status: "pending"}`.
3. Poll `GET /v3/connected-accounts/{account_id}/transactions/requests/{request_id}`, or wait for a signed completion/failure webhook.
4. A completed request contains one precomputed page. Create another POST request using `next_cursor` for the next page.

`from` and `to` are required inclusive `YYYY-MM-DD` dates. `page_size` defaults to 50 and is capped at 500. Results are ordered stably by `timestamp` descending and then `id` descending. Reading the same request ID again returns the same precomputed page. A null `next_cursor` means the end. The date range applies to settled transactions; pending items may fall outside it depending on the bank. ([create transaction request](https://docs.truelayer.com/reference/connected-accounts-create-transactions-request), [get transaction request](https://docs.truelayer.com/reference/connected-accounts-get-transactions-request), [transaction-request webhooks](https://docs.truelayer.com/reference/transactions-request-webhooks))

The completed raw shape is:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "completed",
  "result": {
    "items": [
      {
        "id": "1d6f5f1b9b0e4c0a8f2d3e4b5a6c7d8e",
        "timestamp": "2025-04-01T12:34:56Z",
        "description": "ANKH-MORPORK POST OFFICE",
        "currency": "GBP",
        "amount_in_minor": -4200,
        "status": "settled",
        "enrichment": {
          "merchant_name": "Ankh-Morpork Post Office",
          "transaction_category": {
            "category_code": "C_BL_00",
            "category_name": "Bills - Generic"
          }
        }
      }
    ],
    "pagination": {
      "next_cursor": null
    }
  }
}
```

#### Exact transaction fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | TrueLayer's transaction identifier |
| `timestamp` | yes | RFC 3339 transaction timestamp |
| `description` | yes | Original text reported by the bank |
| `currency` | yes | ISO 4217 currency code |
| `amount_in_minor` | yes | Integer minor units; **negative for debits** |
| `status` | yes | `pending` or `settled` |
| `enrichment.merchant_name` | no | Derived merchant/company name when requested and determined |
| `enrichment.transaction_category.category_code` | no | Enriched category code |
| `enrichment.transaction_category.category_name` | no | Enriched human-readable category |

Enrichment is present only when requested, and its individual fields appear only when TrueLayer can determine them. The current schema contains no first-class `location`, running balance, provider transaction ID, debit/credit enum, or v1-style category/classification fields. ([TrueLayer get-transaction-request OpenAPI reference](https://docs.truelayer.com/reference/connected-accounts-get-transactions-request))

### Pending-to-settled lifecycle

V3 combines pending and settled items in the same result using `status`. TrueLayer defines `id` as its transaction identifier but does **not** document that a pending item's ID, timestamp, amount, or description will remain identical after the bank settles it. This means a blind `UPDATE status = settled WHERE provider_id = ...` strategy relies on a guarantee that the published contract does not make. ([TrueLayer transaction request schema](https://docs.truelayer.com/reference/connected-accounts-get-transactions-request))

A safer Budgety strategy is therefore to treat each fetch as a snapshot:

- upsert exact-ID matches;
- re-fetch an overlap window, not only dates after the last seen timestamp;
- allow a pending observation to disappear and a new settled observation to appear;
- link likely replacements conservatively using account, amount, currency, description/merchant, and nearby timestamp;
- never discard the original raw observations during reconciliation.

That algorithm is a **Budgety design recommendation inferred from the documented contract**, not a TrueLayer-prescribed pending matching algorithm.

## Recommended Budgety normalized record

Keep this internal model provider-neutral, with a separate immutable raw payload. Suggested fields:

```text
Transaction
  id                          Budgety UUID
  account_id                  FK to Budgety account
  provider                    "truelayer"
  provider_transaction_id     TrueLayer v3 transaction id
  observed_status             pending | settled
  occurred_at                 parsed RFC 3339 timestamp
  description_raw             bank-supplied description
  merchant_name               nullable enriched value
  amount_minor                signed integer; debit < 0
  currency                    ISO 4217 code
  provider_category_code      nullable
  provider_category_name      nullable
  budget_category_id          nullable, user/Budgety-owned category
  needs_review                Budgety-owned flag
  replaces_transaction_id     nullable pending-to-settled reconciliation link
  first_seen_at
  last_seen_at
  raw_payload                  exact provider JSON
```

Important separations:

- `provider_category_*` is external enrichment; `budget_category_id` is Budgety's stable, user-correctable classification.
- `description_raw` should never be overwritten by cleaned merchant text.
- `observed_status` describes what the provider returned, while `replaces_transaction_id` captures Budgety's uncertain reconciliation.
- The natural uniqueness scope should include the connection/account, not the transaction ID alone.

## Legacy Data v1: why older examples look richer

Many TrueLayer examples on the web use v1. It is materially different from v3 and should not define a new integration, but it explains fields the product team may expect.

V1 returns settled transactions from `/data/v1/accounts/{account_id}/transactions` and pending transactions from a separate `/transactions/pending` endpoint. Both accept optional inclusive `from`/`to` dates, plus asynchronous mode and a webhook URI. No cursor or page-size contract is documented for these endpoints; the response is `{results: [...]}`, so large backfills must be partitioned by date if v1 is ever used. ([settled endpoint](https://docs.truelayer.com/reference/getaccounttransactions), [pending endpoint](https://docs.truelayer.com/reference/getaccountpendingtransactions))

A v1 account transaction can contain:

```json
{
  "transaction_id": "03c333979b729315545816aaa365c33f",
  "normalised_provider_transaction_id": "txn-ajdifh38fheu5hgue",
  "provider_transaction_id": "9882ks-00js",
  "timestamp": "2018-03-06T00:00:00",
  "description": "GOOGLE PLAY STORE",
  "amount": -2.99,
  "currency": "GBP",
  "transaction_type": "DEBIT",
  "transaction_category": "PURCHASE",
  "transaction_classification": ["Entertainment", "Games"],
  "merchant_name": "Google play",
  "running_balance": { "amount": 1238.6, "currency": "GBP" },
  "meta": {
    "bank_transaction_id": "9882ks-00js",
    "provider_transaction_category": "DEB"
  }
}
```

For account transactions, positive amounts mean incoming funds and negative amounts mean outgoing funds. Credit-card v1 endpoints reverse that convention: positive is card spending and negative is money flowing back to the card, such as a refund. A single sign-normalization rule across v1 accounts and cards would therefore be wrong. ([TrueLayer account and card data guide](https://docs.truelayer.com/docs/account-and-card-data))

V1 also warns that `transaction_id` may change between requests. The optional `normalised_provider_transaction_id` is TrueLayer's recommended stable identifier, while `provider_transaction_id` is bank-specific and varies in format. Durable identity must not rely only on v1 `transaction_id`. ([TrueLayer account transaction fields](https://docs.truelayer.com/docs/account-and-card-data))

The v1 normalized `transaction_category` is a coarse enum including `ATM`, `BILL_PAYMENT`, `DIRECT_DEBIT`, `FEE_CHARGE`, `PURCHASE`, `STANDING_ORDER`, `TRANSFER`, and `UNKNOWN`. `transaction_classification` and `merchant_name` are supported for UK, Irish, and French banks, but classification may be missing and can change over time; credit transactions are not classified by the purchase-focused system. ([TrueLayer transaction-data reference](https://docs.truelayer.com/docs/transaction-data-reference))

Location is not a portable field. A v1 card example contains `meta.location`, but `meta` is explicitly provider-specific and changes shape across banks. Preserve it as raw JSON if using v1, but do not build a universal location feature on it. The same guide says most pending transactions clear within seven days but can remain pending for up to 120 days; it does not provide guaranteed pending-to-posted linkage. ([TrueLayer account and card data guide](https://docs.truelayer.com/docs/account-and-card-data))

## UK Open Banking considerations

- Data v3 currently supports the UK only. A recurring connection permits repeated access during the consent window, but consent must be reconfirmed after 90 days. TrueLayer currently labels the v3 reconfirmation endpoint as still in development; an expired or revoked connection may require a new authorization journey. ([TrueLayer Data v3 overview](https://docs.truelayer.com/docs/enable-your-users-to-connect-their-bank-account))
- Send the end user's IP in `Tl-User-IP` when the user is present. TrueLayer documents this as necessary to get around banks' limit of four unattended calls per day. This makes “refresh constantly” a poor sync design; batch user-visible refreshes and background refreshes deliberately. ([transaction-request reference](https://docs.truelayer.com/reference/connected-accounts-create-transactions-request))
- Historical depth is ultimately bank/provider dependent. V1 explicitly says how far back transactions can be requested varies by provider; v3 exposes a requested range but does not promise that every bank supplies that full history. Budgety should display the actual earliest imported date rather than advertise a fixed historical window. ([TrueLayer account-data guide](https://docs.truelayer.com/docs/account-and-card-data))
- The underlying UK Open Banking transaction model permits richer optional bank data than TrueLayer v3 currently exposes, including booking/value times, debit/credit indicator, bank transaction codes, merchant category code, parties, agents, balances, and addresses. Availability varies because many fields are optional. TrueLayer's v3 normalized contract should remain Budgety's integration boundary unless a direct-bank integration is planned. ([UK Open Banking Transactions v4.0](https://openbankinguk.github.io/read-write-api-site3/v4.0/resources-and-data-models/aisp/Transactions.html))
- Account number, sort code, IBAN, holder names, raw descriptions, and raw payloads are sensitive financial data. Store only what the product needs, encrypt secrets/connection credentials, restrict raw-payload access, and define retention/deletion behavior alongside the consent design.

## Product implications for the current prototype

- The prototype's “Needs review” flow is justified: merchant/category enrichment is optional and classifications can be absent or change.
- Daily and monthly budget totals should normally include settled debits; pending debits can be shown separately or included as an explicitly provisional total.
- Do not derive debit/credit from description text. In v3, use the sign of `amount_in_minor`; retain `status` independently.
- Do not use floating-point pounds in storage. Save `-1240` GBP and format it as `−£12.40` at the UI boundary.
- Credit-card coverage, especially Amex, needs an explicit TrueLayer v3 capability check before it is promised. The current v3 connected-account schema reserves `card` but says card-specific fields are future work.
- Category budgets need a Budgety-owned taxonomy/mapping layer. Provider enrichment is valuable input, not the product's canonical category model.

## Open questions to resolve before implementation

1. Confirm with TrueLayer whether the intended commercial account has v3 transaction enrichment enabled and what it costs.
2. Confirm v3 production support for each launch bank and for standalone credit-card accounts, especially Amex.
3. Ask TrueLayer whether transaction IDs are stable across repeated requests and pending-to-settled transitions; the public v3 contract does not promise this.
4. Decide whether pending spending counts against a live budget, and how reversals/expired pending items change previously shown totals.
5. Choose the initial backfill period based on the history actually returned per connected bank, then use overlapping incremental snapshots.
