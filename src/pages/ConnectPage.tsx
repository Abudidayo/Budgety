import { useEffect, useState } from 'react';
import { ApiError, listBanks, startConnect, type Bank } from '../api/client';
import { useApp } from '../state/AppContext';

/**
 * Bank picker.
 *
 * Enable Banking has no UK coverage, so the real institutions here are EEA and
 * the demo path is their Mock ASPSP. We surface that honestly rather than
 * pretending a mock bank is Monzo.
 */
const DEMO_COUNTRY = 'FI';

export function ConnectPage() {
  const { getToken, error: appError } = useApp();
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

  return (
    <main className="connect-page">
      <div className="connect-hero">
        <span className="connect-cat" aria-hidden="true">🐱</span>
        <h1>Connect your bank</h1>
        <p>Budgety reads the last 90 days so it can show you where your money went. Read-only — it can never move money.</p>
      </div>

      {(error ?? appError) && (
        <p className="connect-error" role="alert">{error ?? appError}</p>
      )}

      {loading ? (
        <p className="connect-muted">Loading banks…</p>
      ) : (
        <>
          {mock.length > 0 && (
            <section className="connect-group">
              <h2>Demo bank</h2>
              <p className="connect-muted">Sample UK spending data. No real account, no credentials.</p>
              {mock.map((bank) => (
                <button
                  key={`${bank.country}-${bank.name}`}
                  className="connect-bank"
                  onClick={() => void connect(bank)}
                  disabled={busy !== null}
                >
                  <span className="connect-bank-name">{bank.name}</span>
                  <span className="connect-bank-go">{busy === bank.name ? '…' : '→'}</span>
                </button>
              ))}
            </section>
          )}

          {real.length > 0 && (
            <section className="connect-group">
              <h2>Other banks</h2>
              <p className="connect-muted">
                UK banks aren’t available through our provider yet, so these are {DEMO_COUNTRY} institutions.
              </p>
              {real.slice(0, 6).map((bank) => (
                <button
                  key={`${bank.country}-${bank.name}`}
                  className="connect-bank"
                  onClick={() => void connect(bank)}
                  disabled={busy !== null}
                >
                  <span className="connect-bank-name">{bank.name}</span>
                  <span className="connect-bank-go">{busy === bank.name ? '…' : '→'}</span>
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
