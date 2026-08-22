import { Navigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';

/**
 * Keeps the dashboard from rendering an empty shell.
 *
 * The dashboard is meaningless without transactions, so anyone without a
 * connected bank goes straight to /connect, and the first fetch gets an honest
 * loading state rather than a screen of zeroes.
 */
export function BankGate({ children }: { children: React.ReactNode }) {
  const { status, transactions, error, refresh } = useApp();

  if (status === 'disconnected') return <Navigate to="/connect" replace />;

  if (status === 'loading' && transactions.length === 0) {
    return (
      <main className="gate-page">
        <span className="gate-cat" aria-hidden="true">🐱</span>
        <p className="gate-msg" role="status">Fetching your spending…</p>
      </main>
    );
  }

  if (status === 'error' && transactions.length === 0) {
    return (
      <main className="gate-page">
        <span className="gate-cat" aria-hidden="true">🙀</span>
        <p className="gate-msg" role="alert">{error ?? 'Could not load your spending.'}</p>
        <button className="gate-btn" onClick={() => void refresh()}>Try again</button>
      </main>
    );
  }

  return <>{children}</>;
}
