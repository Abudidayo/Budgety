import { useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';

/**
 * Stands in for the dashboard while there is nothing to show.
 *
 * Deliberately does NOT redirect: signing in is an account action, and adding
 * a bank is something the user chooses to do from Settings. Being bounced to a
 * bank picker immediately after login conflates the two.
 */
export function BankGate({ children }: { children: React.ReactNode }) {
  const { status, transactions, error, refresh } = useApp();
  const navigate = useNavigate();

  if (status === 'disconnected') {
    return (
      <main className="gate-page">
        <span className="gate-cat" aria-hidden="true">🐱</span>
        <p className="gate-msg">No bank connected yet.</p>
        <p className="connect-muted">
          Add one in Settings and Budgety will show you where your money went.
        </p>
        <button className="gate-btn" onClick={() => navigate('/settings')}>
          Go to Settings
        </button>
      </main>
    );
  }

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
