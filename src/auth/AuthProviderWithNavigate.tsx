import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import type { PropsWithChildren } from 'react';
import { useNavigate } from 'react-router-dom';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
/**
 * Required for the SPA to receive an ACCESS token rather than only an ID token.
 * Must match an API registered in Auth0, and AUTH0_AUDIENCE on the API service.
 * Without it the API cannot verify who is calling.
 */
const audience = import.meta.env.VITE_AUTH0_AUDIENCE;

export function AuthProviderWithNavigate({ children }: PropsWithChildren) {
  const navigate = useNavigate();

  if (!domain || !clientId) {
    return (
      <main className="auth-page auth-page--error">
        <section className="auth-state" role="alert">
          <span className="auth-state-mark" aria-hidden="true">
            !
          </span>
          <h1>Login needs configuring</h1>
          <p>
            Add the Auth0 domain and client ID to this environment, then reload
            Budgety.
          </p>
        </section>
      </main>
    );
  }

  const handleRedirect = (_appState?: AppState) => {
    navigate('/', { replace: true });
  };

  /**
   * Enable Banking returns the user to /callback with ?code=&state= — the exact
   * query parameters the Auth0 SPA SDK watches for on every page load. Without
   * this, Auth0 grabs the BANK's authorisation code, tries to exchange it for
   * an Auth0 token, fails, and shows "We couldn't verify your session".
   *
   * skipRedirectCallback tells Auth0 that this one route is not its business.
   */
  const isBankCallback = window.location.pathname === '/callback';

  return (
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        ...(audience ? { audience } : {}),
      }}
      onRedirectCallback={handleRedirect}
      skipRedirectCallback={isBankCallback}
      /**
       * The bank connect flow is a FULL-PAGE redirect off to the bank and back.
       * Auth0 caches tokens in memory by default, so that round trip destroys
       * the session and the user lands back on /login having lost their place.
       *
       * Persisting to localStorage (plus refresh tokens, so silent renewal does
       * not depend on third-party cookies) is what makes returning from the
       * bank land on the dashboard instead of the login screen.
       */
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
      {children}
    </Auth0Provider>
  );
}
