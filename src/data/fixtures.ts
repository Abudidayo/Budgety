import type { Account, Category, Transaction } from './types';

/** Fixed "today" so the demo is stable regardless of when it runs. */
export const TODAY = '2026-08-22';

/** Populated once a bank account is connected (ABU-24 adapter). */
export const ACCOUNTS: Account[] = [];

export const CATEGORIES: Category[] = [
  { id: 'eating_out', name: 'Eating out', emoji: '🍜', budgetPence: 12000 },
  { id: 'groceries', name: 'Groceries', emoji: '🛒', budgetPence: 22000 },
  { id: 'nights_out', name: 'Nights out', emoji: '🎉', budgetPence: 8000 },
  { id: 'transport', name: 'Transport', emoji: '🚇', budgetPence: 9000 },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', budgetPence: 7000 },
  { id: 'coffee', name: 'Coffee', emoji: '☕️', budgetPence: 4000 },
  { id: 'subscriptions', name: 'Subscriptions', emoji: '📺', budgetPence: 3500 },
  { id: 'health', name: 'Health', emoji: '💊', budgetPence: 4500 },
  { id: 'uni', name: 'Uni supplies', emoji: '📚', budgetPence: 5000 },
];

/** Populated by the data adapter once transactions sync. */
export const TRANSACTIONS: Transaction[] = [];
