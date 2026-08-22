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

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://${domain}/`,
      // Only enforce audience when configured, so the service still boots
      // before the Auth0 API has been registered.
      ...(audience ? { audience } : {}),
    });
    if (!payload.sub) throw new AuthError('unauthenticated', 'Token has no subject.');
    return { userId: String(payload.sub), claims: payload };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('unauthenticated', 'Token verification failed.');
  }
}

export function authStatus() {
  return {
    domainConfigured: Boolean(domain),
    audienceConfigured: Boolean(audience),
    devBypassEnabled: devBypass,
  };
}
