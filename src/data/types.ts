export type Period = 'week' | 'fortnight' | 'month';

/**
 * Provider account identifier. A string, not a union: real accounts have
 * opaque uids assigned by the bank, and we only ever show accounts the user
 * actually connected.
 */
export type AccountId = string;

export interface Account {
  id: AccountId;
  name: string;
  balancePence: number;
}

export type CategoryId =
  | 'eating_out'
  | 'groceries'
  | 'nights_out'
  | 'transport'
  | 'shopping'
  | 'coffee'
  | 'subscriptions'
  | 'health'
  | 'uni';

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
  budgetPence: number;
}

export interface Transaction {
  id: string;
  /** ISO date, e.g. "2026-08-22" */
  date: string;
  merchant: string;
  /** Positive = money in, negative = money out. Pence. */
  amountPence: number;
  /** null when the categoriser couldn't classify it (needs review) or for income. */
  category: CategoryId | null;
  account: AccountId;
  kind: 'spend' | 'income';
  needsReview: boolean;
}
