import { useMemo } from 'react';
import { useApp } from '../state/AppContext';
import {
  categorySummaries,
  formatGBP,
  needsReview,
  visibleTransactions,
} from '../data/selectors';
import './CategoriesPage.css';

export function CategoriesPage() {
  const { period, account, transactions } = useApp();
  const txs = useMemo(
    () => visibleTransactions(transactions, period, account),
    [transactions, period, account],
  );
  const summaries = useMemo(() => categorySummaries(txs), [txs]);
  const review = useMemo(() => needsReview(txs), [txs]);

  return (
    <section className="cats">
      <h2 className="cats-sec">Your categories</h2>
      <div className="cats-grid">
        {summaries.map((s) => (
          <div key={s.id} className={`cats-card${s.status !== 'ok' ? ` ${s.status}` : ''}`}>
            <span className="cats-em">{s.emoji}</span>
            <div className="cats-nm">{s.name}</div>
            <div className="cats-amt">
              {formatGBP(s.spentPence)} of {formatGBP(s.budgetPence)}
            </div>
            <div className="cats-bar">
              <i style={{ width: `${Math.min(s.ratio, 1) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {review.length > 0 && (
        <div className="cats-review">
          <h3 className="cats-review-title">Needs review</h3>
          {review.map((t) => (
            <div key={t.id} className="cats-review-row">
              <span className="cats-review-ic" aria-hidden="true">
                ❓
              </span>
              <span className="cats-review-nm">{t.merchant}</span>
              <span className="cats-review-amt">{formatGBP(t.amountPence)}</span>
              <button type="button" className="cats-assign" onClick={() => {}}>
                Assign
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
