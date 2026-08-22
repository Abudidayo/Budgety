import { useMemo } from 'react';
import { TODAY } from '../data/fixtures';
import {
  categorySummaries,
  dailySpend,
  formatGBP,
  incomeDays,
  incomeTotal,
  spentTotal,
  visibleTransactions,
} from '../data/selectors';
import { useApp } from '../state/AppContext';
import './StatisticsPage.css';

const SEGMENT_COLORS = ['#5FA873', '#E89A9A', '#F0B860', '#7FA8C9', '#B69AD6', '#A98B6F'];
const OTHER_COLOR = '#6FBFB5';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Segment {
  name: string;
  color: string;
  pence: number;
}

function bucketClass(pence: number): string {
  if (pence === 0) return '';
  if (pence < 1000) return 'stats-s1';
  if (pence <= 3000) return 'stats-s2';
  return 'stats-s3';
}

export function StatisticsPage() {
  const { account } = useApp();

  const txs = useMemo(() => visibleTransactions('month', account), [account]);
  const spent = spentTotal(txs);
  const income = incomeTotal(txs);
  const spendByDay = useMemo(() => dailySpend(account), [account]);
  const incomeByDay = useMemo(() => incomeDays(account), [account]);

  // --- Card 1: donut segments ---
  const summaries = categorySummaries(txs);
  const topCats = [...summaries]
    .filter((s) => s.spentPence > 0)
    .sort((a, b) => b.spentPence - a.spentPence)
    .slice(0, 6);
  const topSum = topCats.reduce((sum, s) => sum + s.spentPence, 0);
  const otherPence = spent - topSum; // remaining categories + needs-review spend

  const segments: Segment[] = topCats.map((s, i) => ({
    name: s.name,
    color: SEGMENT_COLORS[i],
    pence: s.spentPence,
  }));
  if (otherPence > 0) {
    segments.push({ name: 'Other', color: OTHER_COLOR, pence: otherPence });
  }

  let acc = 0;
  const stops = segments.map((seg) => {
    const from = spent > 0 ? (acc / spent) * 100 : 0;
    acc += seg.pence;
    const to = spent > 0 ? (acc / spent) * 100 : 0;
    return `${seg.color} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  });
  const donutBackground =
    stops.length > 0 ? `conic-gradient(${stops.join(', ')})` : '#F2F8F3';

  // --- Card 2: income vs spending ---
  const spentPct = income > 0 ? Math.min(100, Math.round((spent / income) * 100)) : 0;
  const keptPence = Math.max(0, income - spent);
  const keptPct = income > 0 ? Math.round((keptPence / income) * 100) : 0;

  // --- Card 3: calendar for TODAY's month ---
  const year = Number(TODAY.slice(0, 4));
  const month = Number(TODAY.slice(5, 7)); // 1-based
  const todayDay = Number(TODAY.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sun
  const leadingBlanks = (firstDow + 6) % 7; // Mon-first
  const monthName = MONTH_NAMES[month - 1];

  const dayCells = [];
  for (let i = 0; i < leadingBlanks; i++) {
    dayCells.push(<span key={`b${i}`} className="stats-day stats-blank" />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${TODAY.slice(0, 8)}${String(d).padStart(2, '0')}`;
    const future = d > todayDay;
    const spentThatDay = spendByDay.get(iso) ?? 0;
    const classes = ['stats-day'];
    if (future) {
      classes.push('stats-future');
    } else {
      const bucket = bucketClass(spentThatDay);
      if (bucket) classes.push(bucket);
      if (incomeByDay.has(iso)) classes.push('stats-inc');
    }
    if (d === todayDay) classes.push('stats-today');
    dayCells.push(
      <span key={d} className={classes.join(' ')}>
        {d}
      </span>,
    );
  }

  return (
    <div className="stats-page">
      <div className="stats-card">
        <div className="stats-title">Spending by category</div>
        <div className="stats-pie-wrap">
          <div
            className="stats-pie"
            role="img"
            aria-label={`Spending split by category, ${formatGBP(spent)} total`}
            style={{ background: donutBackground }}
          >
            <div className="stats-pie-in">
              <b>{formatGBP(spent)}</b>
              <span>{monthName.toUpperCase()}</span>
            </div>
          </div>
          <div className="stats-legend">
            {segments.map((seg) => (
              <div key={seg.name}>
                <i style={{ background: seg.color }} />
                {seg.name}
                <span className="stats-amt">{formatGBP(seg.pence)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stats-card">
        <div className="stats-title">Income vs spending</div>
        <div className="stats-flow">
          <div className="stats-flow-row stats-flow-inc">
            <span>Income</span>
            <span className="stats-flow-bar">
              <i style={{ width: income > 0 ? '100%' : '0%' }} />
            </span>
            <span>{formatGBP(income)}</span>
          </div>
          <div className="stats-flow-row stats-flow-exp">
            <span>Spent</span>
            <span className="stats-flow-bar">
              <i style={{ width: `${spentPct}%` }} />
            </span>
            <span>{formatGBP(spent)}</span>
          </div>
        </div>
        {income > 0 ? (
          <div className="stats-flow-note">
            You&rsquo;ve kept {formatGBP(keptPence)} so far &mdash; {keptPct}% of what came in
            this month.
          </div>
        ) : (
          <div className="stats-flow-note">No income recorded this month yet.</div>
        )}
      </div>

      <div className="stats-card">
        <div className="stats-title">{monthName} &middot; daily spending</div>
        <div className="stats-cal-head">
          <span>Mo</span>
          <span>Tu</span>
          <span>We</span>
          <span>Th</span>
          <span>Fr</span>
          <span>Sa</span>
          <span>Su</span>
        </div>
        <div className="stats-cal">{dayCells}</div>
        <div className="stats-cal-legend">
          <span>
            <i style={{ background: '#F2F8F3' }} />
            £0
          </span>
          <span>
            <i style={{ background: '#F8E3E3' }} />
            Under £10
          </span>
          <span>
            <i style={{ background: '#F2C4C4' }} />
            £10–30
          </span>
          <span>
            <i style={{ background: '#E89A9A' }} />
            £30+
          </span>
          <span>
            <span className="stats-dot" />
            Income day
          </span>
        </div>
      </div>
    </div>
  );
}
