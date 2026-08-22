import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { completeConnect } from '../api/client';
import { useApp } from '../state/AppContext';

/**
 * Where the bank sends the user back.
 *
 * The redirect lands here rather than on the API service because the SPA
 * already holds the Auth0 token, so the code exchange can be an authenticated
 * call and no server-side state->user mapping is needed.
 */
export function CallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { getToken, refresh } = useApp();
  const [message, setMessage] = useState('Talking to your bank…');
  const [failed, setFailed] = useState(false);

  // React 18 StrictMode double-invokes effects in dev; a consent code is
  // single-use, so exchanging it twice fails the second time.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const code = params.get('code');
    const state = params.get('state') ?? '';
    const error = params.get('error');

    if (error || !code) {
      setFailed(true);
      setMessage(
        error === 'access_denied' || !code
          ? 'You cancelled the connection. Nothing was shared.'
          : 'The bank could not complete the connection.',
      );
      return;
    }

    (async () => {
      try {
        setMessage('Asking your bank for the last 90 days…');
        await completeConnect(getToken, code, state);
        await refresh();
        navigate('/', { replace: true });
      } catch (err) {
        setFailed(true);
        setMessage(err instanceof Error ? err.message : 'Something went wrong.');
      }
    })();
  }, [params, getToken, refresh, navigate]);

  return (
    <main className="callback-page">
      <span className="callback-cat" aria-hidden="true">🐱</span>
      <p className="callback-msg" role="status">{message}</p>
      {failed && (
        <div className="callback-actions">
          <button className="callback-btn" onClick={() => navigate('/settings', { replace: true })}>
            Back to Settings
          </button>
        </div>
      )}
    </main>
  );
}
