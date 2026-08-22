import { CATEGORIES } from '../data/fixtures';
import type { Period, Transaction } from '../data/types';
import {
  categorySummaries,
  formatGBP,
  friendlyDate,
  heroInsight,
  needsReview,
  visibleTransactions,
} from '../data/selectors';
import { useApp } from '../state/AppContext';
import './HomePage.css';

const CATEGORY_EMOJI = new Map(CATEGORIES.map((c) => [c.id, c.emoji]));
const CATEGORY_NAME = new Map(CATEGORIES.map((c) => [c.id, c.name]));

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Weekly' },
  { id: 'fortnight', label: '2 weeks' },
  { id: 'month', label: 'Monthly' },
];

function txEmoji(t: Transaction): string {
  if (t.kind === 'income') return '💷';
  if (t.needsReview || !t.category) return '❓';
  return CATEGORY_EMOJI.get(t.category) ?? '❓';
}

function txSubline(t: Transaction): string {
  const label =
    t.kind === 'income'
      ? 'Income'
      : t.needsReview || !t.category
        ? 'Needs review'
        : CATEGORY_NAME.get(t.category) ?? 'Needs review';
  return `${label} · ${friendlyDate(t.date)}`;
}

export function HomePage() {
  const { period, setPeriod, account, transactions } = useApp();

  const txs = visibleTransactions(transactions, period, account);
  const review = needsReview(txs);
  const monthTxs = visibleTransactions(transactions, 'month', account);
  const insight = heroInsight(categorySummaries(monthTxs));

  return (
    <div className="home">
      {review.length > 0 && (
        <div className="home-review">
          <span className="home-review-emoji">🕵️</span>
          <div className="home-review-text">
            <b>
              {review.length} purchase{review.length === 1 ? '' : 's'} need
              {review.length === 1 ? 's' : ''} a look
            </b>
            Mochi couldn&rsquo;t tell what &ldquo;{review[0].merchant}&rdquo; was.
          </div>
          <button type="button" className="home-review-btn" onClick={() => {}}>
            Review
          </button>
        </div>
      )}

      <div className="home-hero">
        <div className="home-bubble">{insight}</div>
      </div>

      <div className="home-period" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <h2 className="home-sec">
        Transactions{' '}
        <a href="#" onClick={(e) => e.preventDefault()}>
          See all
        </a>
      </h2>
      <div className="home-tx">
        {txs.length === 0 && (
          <div className="home-tx-empty">
            No transactions yet. Connect an account to see your spending here.
          </div>
        )}
        {txs.map((t) => (
          <div className="home-tx-row" key={t.id}>
            <div className="home-tx-ic">{txEmoji(t)}</div>
            <div>
              <div className="home-tx-nm">{t.merchant}</div>
              <div
                className={
                  t.needsReview ? 'home-tx-cat home-tx-cat-review' : 'home-tx-cat'
                }
              >
                {txSubline(t)}
              </div>
            </div>
            <div
              className={
                t.kind === 'income' ? 'home-tx-amt home-tx-amt-in' : 'home-tx-amt'
              }
            >
              {t.kind === 'income' ? `+${formatGBP(t.amountPence)}` : formatGBP(t.amountPence)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
