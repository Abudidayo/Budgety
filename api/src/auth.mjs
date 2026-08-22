/**
 * Auth0 access-token verification.
 *
 * The SPA is already behind an Auth0 gate. Consent sessions are scoped to the
 * Auth0 `sub`, so every data endpoint needs a verified token — not a token we
 * merely decode.
 *
 * Requires an API registered in Auth0 so the SPA can request an access token
 * with an `audience`. Without AUTH0_AUDIENCE set, an ID token would be the only
 * thing available, and ID tokens are not API credentials.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

const domain = process.env.AUTH0_DOMAIN;
const audience = process.env.AUTH0_AUDIENCE;
/**
 * Auth0 SPA client id. Used as the accepted audience for ID tokens.
 *
 * WHY: an access token only exists once an API is registered in Auth0 and the
 * SPA requests that `audience`. Until then the SPA can only obtain an ID token.
 * Rather than ship an app that 401s on every call, we accept an ID token whose
 * `aud` is this client id — still fully JWKS-verified, so it is a real
 * cryptographic identity check, not a decode-and-trust.
 *
 * It is a weaker guarantee than an access token (ID tokens are meant for the
 * client, not for APIs), so once AUTH0_AUDIENCE is set, access tokens are
 * accepted too and should be preferred.
 */
const clientId = process.env.AUTH0_CLIENT_ID;

/**
 * Escape hatch for local development only. Never set this in Railway.
 * When on, the caller may pass `x-dev-user` and skip verification entirely.
 */
const devBypass = process.env.ALLOW_DEV_AUTH === 'true';

let jwks;
function getJwks() {
  if (!domain) throw new AuthError('auth_not_configured', 'AUTH0_DOMAIN is not set on the API.');
  jwks ??= createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  return jwks;
}

export class AuthError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<{userId: string, claims?: object}>}
 */
export async function authenticate(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (devBypass) {
    const devUser = req.headers['x-dev-user'];
    if (devUser) return { userId: String(devUser) };
  }

  if (!token) throw new AuthError('unauthenticated', 'Missing bearer token.');

  // Auth0 issues an OPAQUE access token when the SPA requests no audience.
  // getAccessTokenSilently() resolves happily with it, so the client cannot
  // tell it failed — but it is not a JWT and will never verify. Say so plainly.
  if (token.split('.').length !== 3) {
    throw new AuthError(
      'unauthenticated',
      'Received an opaque Auth0 token, not a JWT. Register an API in Auth0 and set AUTH0_AUDIENCE / VITE_AUTH0_AUDIENCE.',
    );
  }

  try {
    const accepted = [audience, clientId].filter(Boolean);
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://${domain}/`,
      // Accept either an access token (our API audience) or an ID token (the
      // SPA client id). Both are verified against Auth0's JWKS.
      ...(accepted.length ? { audience: accepted } : {}),
    });
    if (!payload.sub) throw new AuthError('unauthenticated', 'Token has no subject.');
    return { userId: String(payload.sub), claims: payload };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    // Log the real reason server-side: 'Token verification failed' on its own
    // is useless when the cause is an opaque token, a clock skew, or an
    // audience mismatch.
    console.warn('[auth] rejected token:', err.code ?? err.name, '-', err.message);
    throw new AuthError('unauthenticated', `Token rejected: ${err.message}`);
  }
}

export function authStatus() {
  return {
    domainConfigured: Boolean(domain),
    audienceConfigured: Boolean(audience),
    idTokenFallback: Boolean(clientId) && !audience,
    devBypassEnabled: devBypass,
  };
}
