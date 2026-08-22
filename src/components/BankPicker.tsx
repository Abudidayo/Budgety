import { useEffect, useState } from 'react';
import { ApiError, listBanks, startConnect, type Bank } from '../api/client';
import { useApp } from '../state/AppContext';

/**
 * Bank picker, rendered inline inside Settings.
 *
 * Deliberately not its own route: signing in is an account action, and adding
 * a bank is a thing the user chooses to do from Settings. A standalone
 * /connect page invited a post-login redirect that conflated the two.
 *
 * Enable Banking has no UK coverage, so the real institutions here are EEA and
 * the demo path is their Mock ASPSP. We say so rather than implying otherwise.
 */
const DEMO_COUNTRY = 'FI';

export function BankPicker({ onCancel }: { onCancel: () => void }) {
  const { getToken } = useApp();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { banks: found } = await listBanks(getToken, DEMO_COUNTRY, 'sandbox');
        if (!cancelled) setBanks(found);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError && err.code === 'provider_not_configured'
              ? 'The banking service is not configured yet.'
              : 'Could not load the list of banks.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const connect = async (bank: Bank) => {
    setBusy(bank.name);
    setError(null);
    try {
      const { authUrl } = await startConnect(getToken, bank, 'sandbox');
      window.location.href = authUrl;
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : 'Could not start the connection.');
    }
  };

  const mock = banks.filter((b) => /mock/i.test(b.name));
  const real = banks.filter((b) => !/mock/i.test(b.name));

  const row = (bank: Bank) => (
    <button
      key={`${bank.country}-${bank.name}`}
      className="connect-bank"
      onClick={() => void connect(bank)}
      disabled={busy !== null}
    >
      <span className="connect-bank-name">{bank.name}</span>
      <span className="connect-bank-go">{busy === bank.name ? '…' : '→'}</span>
    </button>
  );

  return (
    <div className="bank-picker">
      <p className="connect-muted">
        Budgety reads the last 90 days so it can show you where your money went.
        Read-only — it can never move money.
      </p>

      {error && <p className="connect-error" role="alert">{error}</p>}

      {loading ? (
        <p className="connect-muted">Loading banks…</p>
      ) : (
        <>
          {mock.length > 0 && (
            <>
              <p className="bank-picker-group">Demo bank</p>
              {mock.map(row)}
            </>
          )}
          {real.length > 0 && (
            <>
              <p className="bank-picker-group">Other banks</p>
              {real.slice(0, 5).map(row)}
            </>
          )}
        </>
      )}

      <button type="button" className="bank-picker-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
