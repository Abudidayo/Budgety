/**
 * Enable Banking payloads -> Budgety's internal shapes.
 *
 * The goal is that nothing downstream can tell live data from fixture data.
 * If you find yourself wanting a provider field in the UI, add it here first.
 */
import { createHash } from 'node:crypto';
import { buildEmbeddingText, deriveTransactionId } from './contracts.mjs';

const sha256Hex = (s) => createHash('sha256').update(s).digest('hex');

/**
 * "PRET A MANGER 421      LONDON GB" -> "Pret A Manger"
 *
 * Best-effort and deliberately conservative: it is better to show a slightly
 * ugly name than to mangle it into something wrong. The raw string survives as
 * `descriptor` for the categoriser regardless.
 */
export function cleanMerchant(raw) {
  if (!raw) return 'Unknown';
  let s = String(raw).replace(/\s+/g, ' ').trim();

  // Trailing card-scheme noise: "*1234", "  GB", reference digits.
  s = s.replace(/\b(?:VISA|MASTERCARD|MAESTRO|DEBIT|CREDIT)\b/gi, ' ');
  s = s.replace(/[*#]\d{3,}/g, ' ');
  s = s.replace(/\b\d{6,}\b/g, ' ');
  s = s.replace(/\bGB\b$/i, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  if (!s) return 'Unknown';

  // Title-case only if the bank shouted at us; preserve deliberate casing.
  if (s === s.toUpperCase()) {
    s = s
      .toLowerCase()
      .split(' ')
      .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
      .join(' ');
  }
  return s;
}

/** "12.34" (string, major units) -> 1234 (integer minor units). */
export function toPence(amount) {
  const n = Number.parseFloat(String(amount ?? '0'));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Pick the human-facing counterparty. For money out that is the creditor; for
 * money in, the debtor. Falls back through remittance info, which is often the
 * only thing populated for card payments.
 */
function counterparty(tx, isDebit) {
  const primary = isDebit ? tx.creditor?.name : tx.debtor?.name;
  if (primary) return String(primary);
  const remittance = Array.isArray(tx.remittance_information)
    ? tx.remittance_information.filter(Boolean).join(' ')
    : tx.remittance_information;
  if (remittance) return String(remittance);
  return tx.reference_number ? String(tx.reference_number) : 'Unknown';
}

/**
 * @param {any} raw Enable Banking account object (session `accounts[]` entry)
 * @returns {{id: string, name: string, currency: string, uid: string, balancePence: number}}
 */
export function normaliseAccount(raw) {
  const uid = raw.uid ?? raw.account_id?.iban ?? raw.resource_id ?? sha256Hex(JSON.stringify(raw)).slice(0, 16);
  const name =
    raw.name ??
    raw.product ??
    raw.details ??
    raw.account_id?.iban ??
    'Account';
  // No currency means we cannot safely treat it as GBP; surface it as unknown
  // so the GBP filter drops it rather than silently mixing currencies.
  return {
    id: String(uid),
    uid: String(uid),
    name: String(name).trim(),
    currency: raw.currency ?? 'UNKNOWN',
    balancePence: 0, // filled by attachBalance once /balances resolves
  };
}

/**
 * Choose the balance a human means by "how much have I got".
 * Preference order: interim available -> closing booked -> first available.
 */
export function pickBalancePence(balancesBody) {
  const list = balancesBody?.balances ?? [];
  if (!list.length) return 0;
  const byType = (t) => list.find((b) => b.balance_type === t);
  const chosen = byType('ITAV') ?? byType('CLBD') ?? byType('XPCD') ?? list[0];
  return toPence(chosen?.balance_amount?.amount);
}

/**
 * One Enable Banking transaction -> the input the categoriser sees.
 *
 * Note we do NOT decide `category` here. That is the engine's job; this file
 * only establishes identity, money and text.
 *
 * @param {any} tx
 * @param {{accountId: string}} ctx
 */
export function normaliseTransaction(tx, ctx) {
  const isDebit = (tx.credit_debit_indicator ?? 'DBIT') === 'DBIT';
  const magnitude = toPence(tx.transaction_amount?.amount);
  const amountPence = isDebit ? -Math.abs(magnitude) : Math.abs(magnitude);

  const descriptor = counterparty(tx, isDebit);
  const merchant = cleanMerchant(descriptor);
  const date = tx.booking_date ?? tx.value_date ?? tx.transaction_date ?? null;

  const id = deriveTransactionId(
    {
      accountId: ctx.accountId,
      reference: tx.entry_reference ?? null,
      date: date ?? '',
      amountPence,
      descriptor,
    },
    sha256Hex,
  );

  const mcc = tx.merchant_category_code ? String(tx.merchant_category_code) : null;

  return {
    id,
    merchant,
    descriptor,
    text: buildEmbeddingText({ merchant, descriptor, mcc }),
    amountPence,
    currency: tx.transaction_amount?.currency ?? 'GBP',
    date,
    kind: isDebit ? 'spend' : 'income',
    mcc,
    bankTransactionCode: tx.bank_transaction_code ? String(tx.bank_transaction_code) : null,
    accountId: ctx.accountId,
    /** Provider status; PDNG transactions can change on settlement. */
    pending: (tx.status ?? 'BOOK') !== 'BOOK',
  };
}

/**
 * Merge categorisation results back onto normalised transactions to produce
 * the exact shape src/data/types.ts declares.
 *
 * @param {ReturnType<typeof normaliseTransaction>[]} normalised
 * @param {import('./contracts.mjs').CategorisationResult[]} results
 * @param {number} confidenceThreshold
 */
export function toClientTransactions(normalised, results, confidenceThreshold) {
  const byId = new Map(results.map((r) => [r.id, r]));

  return normalised
    .filter((t) => t.date) // a transaction with no date cannot be placed in any period
    .map((t) => {
      const r = byId.get(t.id);
      const category = t.kind === 'income' ? null : (r?.category ?? null);
      const confident = (r?.confidence ?? 0) >= confidenceThreshold;
      return {
        id: t.id,
        date: t.date,
        merchant: t.merchant,
        amountPence: t.amountPence,
        category,
        account: t.accountId,
        kind: t.kind,
        // Income is never "needs review" — there is nothing for the user to fix.
        needsReview: t.kind === 'spend' && (category === null || !confident),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
