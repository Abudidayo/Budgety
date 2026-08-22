import { CATEGORIES, TODAY, TRANSACTIONS } from './fixtures';
import type { AccountId, Category, CategoryId, Period, Transaction } from './types';

export type AccountFilter = AccountId | 'all';

export function formatGBP(pence: number): string {
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const rem = abs % 100;
  const body =
    rem === 0
      ? `£${pounds.toLocaleString('en-GB')}`
      : `£${pounds.toLocaleString('en-GB')}.${String(rem).padStart(2, '0')}`;
  return pence < 0 ? `−${body}` : body;
}

function periodStart(period: Period, today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  if (period === 'month') {
    return `${today.slice(0, 8)}01`;
  }
  const days = period === 'week' ? 6 : 13;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Transactions in the selected period/account, newest first. */
export function visibleTransactions(
  period: Period,
  account: AccountFilter,
  today: string = TODAY,
): Transaction[] {
  const start = periodStart(period, today);
  return TRANSACTIONS.filter(
    (t) =>
      t.date >= start &&
      t.date <= today &&
      (account === 'all' || t.account === account),
  ).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function spentTotal(txs: Transaction[]): number {
  return txs
    .filter((t) => t.kind === 'spend')
    .reduce((sum, t) => sum + Math.abs(t.amountPence), 0);
}

export function incomeTotal(txs: Transaction[]): number {
  return txs
    .filter((t) => t.kind === 'income')
    .reduce((sum, t) => sum + t.amountPence, 0);
}

export interface CategorySummary extends Category {
  spentPence: number;
  /** spent / budget, can exceed 1 */
  ratio: number;
  status: 'ok' | 'warn' | 'over';
}

/** Per-category totals for the given transactions, in CATEGORIES order. */
export function categorySummaries(txs: Transaction[]): CategorySummary[] {
  const byCat = new Map<CategoryId, number>();
  for (const t of txs) {
    if (t.kind === 'spend' && t.category) {
      byCat.set(t.category, (byCat.get(t.category) ?? 0) + Math.abs(t.amountPence));
    }
  }
  return CATEGORIES.map((c) => {
    const spentPence = byCat.get(c.id) ?? 0;
    const ratio = spentPence / c.budgetPence;
    return {
      ...c,
      spentPence,
      ratio,
      status: ratio > 1 ? 'over' : ratio >= 0.9 ? 'warn' : 'ok',
    };
  });
}

export function needsReview(txs: Transaction[]): Transaction[] {
  return txs.filter((t) => t.needsReview);
}

/** Total budget across all categories. */
export const TOTAL_BUDGET_PENCE = CATEGORIES.reduce(
  (sum, c) => sum + c.budgetPence,
  0,
);

/**
 * Deterministic hero insight (ABU-15: budget maths stays deterministic).
 * Prioritises the biggest overspend, then near-limit categories.
 */
export function heroInsight(summaries: CategorySummary[]): string {
  const over = [...summaries]
    .filter((s) => s.status === 'over')
    .sort((a, b) => b.spentPence - b.budgetPence - (a.spentPence - a.budgetPence));
  if (over.length > 0) {
    const s = over[0];
    const overBy = s.spentPence - s.budgetPence;
    const best = [...summaries]
      .filter((x) => x.status === 'ok' && x.spentPence > 0)
      .sort((a, b) => a.ratio - b.ratio)[0];
    const tail = best
      ? ` ${best.name} ${best.name.endsWith('s') ? 'are' : 'is'} looking great though!`
      : '';
    return `You've spent ${formatGBP(s.spentPence)} on ${s.name.toLowerCase()} this month — that's ${formatGBP(overBy)} over budget.${tail}`;
  }
  const warn = [...summaries].filter((s) => s.status === 'warn').sort((a, b) => b.ratio - a.ratio);
  if (warn.length > 0) {
    const s = warn[0];
    return `${s.name} is close to its limit — ${formatGBP(s.spentPence)} of ${formatGBP(s.budgetPence)}. Everything else is on track.`;
  }
  return `All categories are on track. Nicely done!`;
}

/** Spend per calendar day for the month containing `today`: { "2026-08-07": 4570, ... } */
export function dailySpend(
  account: AccountFilter,
  today: string = TODAY,
): Map<string, number> {
  const start = `${today.slice(0, 8)}01`;
  const map = new Map<string, number>();
  for (const t of TRANSACTIONS) {
    if (
      t.kind === 'spend' &&
      t.date >= start &&
      t.date <= today &&
      (account === 'all' || t.account === account)
    ) {
      map.set(t.date, (map.get(t.date) ?? 0) + Math.abs(t.amountPence));
    }
  }
  return map;
}

/** Dates in the current month with income (green dot on the calendar). */
export function incomeDays(account: AccountFilter, today: string = TODAY): Set<string> {
  const start = `${today.slice(0, 8)}01`;
  return new Set(
    TRANSACTIONS.filter(
      (t) =>
        t.kind === 'income' &&
        t.date >= start &&
        t.date <= today &&
        (account === 'all' || t.account === account),
    ).map((t) => t.date),
  );
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Today · Sat 22 Aug", "Yesterday · Fri 21 Aug", else "Wed 19 Aug". */
export function friendlyDate(date: string, today: string = TODAY): string {
  const d = new Date(`${date}T00:00:00Z`);
  const label = `${DAY_NAMES[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
  const t = new Date(`${today}T00:00:00Z`);
  const diffDays = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return `Today · ${label}`;
  if (diffDays === 1) return `Yesterday · ${label}`;
  return label;
}
