import { useAuth0 } from '@auth0/auth0-react';
import { useState } from 'react';
import './LoginPage.css';

export function LoginPage() {
  const { loginWithRedirect } = useAuth0();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [loginError, setLoginError] = useState(false);

  const handleLogin = async () => {
    setIsRedirecting(true);
    setLoginError(false);

    try {
      await loginWithRedirect({ appState: { returnTo: '/' } });
    } catch {
      setLoginError(true);
      setIsRedirecting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand" aria-label="Budgety">
          <span className="login-brand-mark" aria-hidden="true">
            b
          </span>
          <span>Budgety</span>
        </div>

        <div className="balance-window" aria-hidden="true">
          <div className="balance-window-sun" />
          <div className="balance-line balance-line--one">
            <span />
            <span />
          </div>
          <div className="balance-line balance-line--two">
            <span />
            <span />
            <span />
          </div>
          <div className="balance-sprout">⌁</div>
        </div>

        <div className="login-copy">
          <p className="login-eyebrow">Your money, in your hands</p>
          <h1 id="login-title">Come back to your balance.</h1>
          <p className="login-subtitle">
            Sign in securely to keep your budgets, accounts and connections
            private to you.
          </p>
        </div>

        {loginError && (
          <p className="login-inline-error" role="alert">
            Login could not start. Check your connection and try again.
          </p>
        )}

        <button
          type="button"
          className="login-button"
          onClick={handleLogin}
          disabled={isRedirecting}
        >
          <span>{isRedirecting ? 'Opening secure login…' : 'Continue to Budgety'}</span>
          <span aria-hidden="true">→</span>
        </button>

        <p className="login-note">
          Continue with Google or email. Authentication is securely handled by
          Auth0.
        </p>
      </section>
    </main>
  );
}

export function AuthLoadingPage() {
  return (
    <main className="auth-page" aria-live="polite" aria-busy="true">
      <section className="auth-state">
        <span className="auth-loader" aria-hidden="true" />
        <h1>Opening your Budgety</h1>
        <p>Checking your secure session…</p>
      </section>
    </main>
  );
}

interface AuthErrorPageProps {
  onRetry: () => void;
}

export function AuthErrorPage({ onRetry }: AuthErrorPageProps) {
  return (
    <main className="auth-page auth-page--error">
      <section className="auth-state" role="alert">
        <span className="auth-state-mark" aria-hidden="true">
          !
        </span>
        <h1>We couldn’t verify your session</h1>
        <p>Your Budgety data is still private. Try signing in again.</p>
        <button type="button" className="auth-retry-button" onClick={onRetry}>
          Retry login
        </button>
      </section>
    </main>
  );
}

interface VerifyEmailPageProps {
  onLogout: () => void;
}

export function VerifyEmailPage({ onLogout }: VerifyEmailPageProps) {
  return (
    <main className="auth-page">
      <section className="auth-state auth-state--verify">
        <span className="auth-state-mark auth-state-mark--mail" aria-hidden="true">
          ✉
        </span>
        <p className="login-eyebrow">One last check</p>
        <h1>Verify your email</h1>
        <p>
          Use the link Auth0 sent to your inbox. Then return here and sign in
          again.
        </p>
        <button type="button" className="auth-retry-button" onClick={onLogout}>
          Return to login
        </button>
      </section>
    </main>
  );
}
