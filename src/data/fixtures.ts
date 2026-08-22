import type { Account, Category, Transaction } from './types';

/** Fixed "today" so the demo is stable regardless of when it runs. */
export const TODAY = '2026-08-22';

export const ACCOUNTS: Account[] = [
  { id: 'monzo', name: 'Monzo · Current', balancePence: 120420 },
  { id: 'barclays', name: 'Barclays · Student', balancePence: 31055 },
  { id: 'amex', name: 'Amex · Credit', balancePence: -8610 },
];

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

const spend = (
  id: string,
  date: string,
  merchant: string,
  pence: number,
  category: Transaction['category'],
  account: Transaction['account'],
  needsReview = false,
): Transaction => ({
  id,
  date,
  merchant,
  amountPence: -pence,
  category: needsReview ? null : category,
  account,
  kind: 'spend',
  needsReview,
});

const income = (
  id: string,
  date: string,
  merchant: string,
  pence: number,
  account: Transaction['account'],
): Transaction => ({
  id,
  date,
  merchant,
  amountPence: pence,
  category: null,
  account,
  kind: 'income',
  needsReview: false,
});

/** August 2026. Month totals: spent £612.00, income £1,240.00. */
export const TRANSACTIONS: Transaction[] = [
  income('i1', '2026-08-01', 'Student Finance England', 90000, 'barclays'),
  income('i2', '2026-08-15', 'Beanhouse Café · payroll', 34000, 'monzo'),

  spend('t01', '2026-08-22', 'Tesco Express', 1240, 'groceries', 'monzo'),
  spend('t02', '2026-08-22', 'Wagamama', 1890, 'eating_out', 'monzo'),
  spend('t03', '2026-08-21', 'PAYPAL *WRLD', 999, null, 'monzo', true),
  spend('t04', '2026-08-21', 'TfL Travel', 560, 'transport', 'monzo'),
  spend('t05', '2026-08-21', 'Pret a Manger', 415, 'coffee', 'monzo'),
  spend('t06', '2026-08-20', 'Spotify', 1199, 'subscriptions', 'amex'),
  spend('t07', '2026-08-20', 'Sainsburys Local', 2860, 'groceries', 'barclays'),
  spend('t08', '2026-08-19', 'TfL Travel', 560, 'transport', 'monzo'),
  spend('t09', '2026-08-19', 'Kebabish', 1910, 'eating_out', 'monzo'),
  spend('t10', '2026-08-18', 'Costa Coffee', 380, 'coffee', 'monzo'),
  spend('t11', '2026-08-18', 'Boots', 1145, 'health', 'barclays'),
  spend('t12', '2026-08-17', 'Lidl', 3420, 'groceries', 'barclays'),
  spend('t13', '2026-08-16', 'Uniqlo', 2990, 'shopping', 'amex'),
  spend('t14', '2026-08-16', 'Deliveroo', 2450, 'eating_out', 'monzo'),
  spend('t15', '2026-08-15', 'Pryzm', 2500, 'nights_out', 'monzo'),
  spend('t16', '2026-08-15', 'Wetherspoons', 1400, 'nights_out', 'monzo'),
  spend('t17', '2026-08-14', 'Five Guys', 1520, 'eating_out', 'monzo'),
  spend('t18', '2026-08-14', 'TfL Travel', 840, 'transport', 'monzo'),
  spend('t19', '2026-08-13', 'Tesco Express', 1580, 'groceries', 'monzo'),
  spend('t20', '2026-08-13', 'AMZN MKTP UK', 1450, null, 'amex', true),
  spend('t21', '2026-08-12', 'Ryman Stationery', 660, 'uni', 'barclays'),
  spend('t22', '2026-08-12', 'TfL Travel', 560, 'transport', 'monzo'),
  spend('t23', '2026-08-11', 'Pret a Manger', 415, 'coffee', 'monzo'),
  spend('t24', '2026-08-10', 'Netflix', 1099, 'subscriptions', 'amex'),
  spend('t25', '2026-08-10', 'Aldi', 2790, 'groceries', 'barclays'),
  spend('t26', '2026-08-09', 'Amazon', 1810, 'shopping', 'amex'),
  spend('t27', '2026-08-09', 'Nandos', 2340, 'eating_out', 'monzo'),
  spend('t28', '2026-08-08', 'Bar Soho', 2200, 'nights_out', 'monzo'),
  spend('t29', '2026-08-08', 'Blank Street Coffee', 520, 'coffee', 'monzo'),
  spend('t30', '2026-08-07', 'Superdrug', 755, 'health', 'barclays'),
  spend('t31', '2026-08-07', 'TfL Travel', 1120, 'transport', 'monzo'),
  spend('t32', '2026-08-07', 'Pizza Union', 890, 'eating_out', 'monzo'),
  spend('t33', '2026-08-06', 'Sainsburys Local', 2130, 'groceries', 'barclays'),
  spend('t34', '2026-08-06', 'Costa Coffee', 380, 'coffee', 'monzo'),
  spend('t35', '2026-08-05', 'Apple iCloud+', 402, 'subscriptions', 'amex'),
  spend('t36', '2026-08-05', 'SQ *POPUP MARKET', 851, null, 'monzo', true),
  spend('t37', '2026-08-05', 'TfL Travel', 560, 'transport', 'monzo'),
  spend('t38', '2026-08-04', 'WHSmith', 740, 'uni', 'barclays'),
  spend('t39', '2026-08-04', 'Pret a Manger', 415, 'coffee', 'monzo'),
  spend('t40', '2026-08-03', 'Tesco Express', 2780, 'groceries', 'monzo'),
  spend('t41', '2026-08-02', 'Dishoom', 3200, 'eating_out', 'monzo'),
  spend('t42', '2026-08-02', 'Campus Coffee Cart', 575, 'coffee', 'monzo'),
  spend('t43', '2026-08-01', 'Corporation Nightclub', 1300, 'nights_out', 'monzo'),
  spend('t44', '2026-08-01', 'Trainline', 1400, 'transport', 'monzo'),
];
