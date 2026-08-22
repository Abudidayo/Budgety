/**
 * Enable Banking API client.
 *
 * The only file that knows this provider exists. Everything downstream speaks
 * the shapes in contracts.mjs.
 *
 * Auth is an RS256 JWT signed with an RSA private key downloaded from the
 * Enable Banking control panel. The key can never reach the browser, which is
 * the entire reason this service exists.
 */
import { createSign } from 'node:crypto';

const BASE = 'https://api.enablebanking.com';

/** Max lifetime Enable Banking accepts for an app token. */
const MAX_TOKEN_TTL = 86400;
/** We re-sign well inside that so clock skew can never expire us mid-request. */
const TOKEN_TTL = 3600;

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

/**
 * @typedef {object} EbApp
 * @property {string} applicationId  Becomes the JWT `kid`.
 * @property {string} privateKeyPem
 * @property {'sandbox'|'production'} env  Ours, not theirs — selects which keypair.
 */

/**
 * Sign an application JWT. Cheap (one RSA sign), so we do not cache: a cached
 * token that outlives its `exp` is a far worse failure than a few milliseconds.
 *
 * @param {EbApp} app
 * @param {number} [nowSeconds] injectable for tests
 */
export function signAppToken(app, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!app?.applicationId) throw new Error('enablebanking: missing applicationId');
  if (!app?.privateKeyPem) throw new Error('enablebanking: missing privateKeyPem');

  const header = b64url({ typ: 'JWT', alg: 'RS256', kid: app.applicationId });
  const payload = b64url({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: nowSeconds,
    exp: nowSeconds + Math.min(TOKEN_TTL, MAX_TOKEN_TTL),
  });
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(app.privateKeyPem)
    .toString('base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Error carrying a code the UI can branch on rather than a raw provider blob.
 */
export class EbError extends Error {
  /** @param {string} code @param {string} message @param {number} [status] @param {unknown} [detail] */
  constructor(code, message, status = 502, detail = undefined) {
    super(message);
    this.name = 'EbError';
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Map a provider failure onto one of our stable error codes.
 * Deliberately small: codes the UI actually renders differently.
 */
function toEbError(status, body) {
  const message = body?.message ?? body?.error ?? 'Enable Banking request failed';
  if (status === 401 || status === 403) {
    if (/not active/i.test(String(message))) {
      return new EbError('app_inactive', 'This Enable Banking application is not active yet.', 503, body);
    }
    return new EbError('provider_auth_failed', 'Could not authenticate with Enable Banking.', 502, body);
  }
  if (status === 404) return new EbError('not_found', String(message), 404, body);
  if (status === 422) return new EbError('invalid_request', String(message), 400, body);
  return new EbError('bank_unavailable', String(message), 502, body);
}

/**
 * @param {EbApp} app
 * @param {string} path
 * @param {{method?: string, body?: unknown, query?: Record<string,string|number|undefined>}} [opts]
 */
async function request(app, path, opts = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  let response;
  try {
    response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${signAppToken(app)}`,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch (cause) {
    // Network-level failure: DNS, TLS, timeout. Never leak the stack to the client.
    throw new EbError('bank_unavailable', 'Could not reach Enable Banking.', 502, String(cause));
  }

  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) throw toEbError(response.status, body);
  return body;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 200) };
  }
}

/** Sanity check + capability discovery. Used by /api/health. */
export function getApplication(app) {
  return request(app, '/application');
}

/**
 * List institutions. Country is required by us (not by them) because the
 * unfiltered list is 800+ entries and useless in a picker.
 *
 * @param {EbApp} app
 * @param {string} country ISO 3166-1 alpha-2
 */
export async function listAspsps(app, country) {
  const body = await request(app, '/aspsps', { query: { country } });
  return (body?.aspsps ?? []).map((a) => ({
    name: a.name,
    country: a.country,
    logo: a.logo ?? null,
    beta: Boolean(a.beta),
    psuTypes: a.psu_types ?? [],
    maxConsentValiditySeconds: a.maximum_consent_validity ?? null,
  }));
}

/**
 * Start user authorisation. Returns the URL to send the browser to.
 *
 * `state` is ours and comes back on the redirect — we use it to tie the
 * callback to the user who started it.
 *
 * @param {EbApp} app
 * @param {{aspspName: string, aspspCountry: string, redirectUrl: string, state: string, validUntil: Date, psuType?: string}} p
 */
export async function startAuthorisation(app, p) {
  const body = await request(app, '/auth', {
    method: 'POST',
    body: {
      access: { valid_until: p.validUntil.toISOString() },
      aspsp: { name: p.aspspName, country: p.aspspCountry },
      state: p.state,
      redirect_url: p.redirectUrl,
      psu_type: p.psuType ?? 'personal',
    },
  });
  if (!body?.url) throw new EbError('bank_unavailable', 'Enable Banking did not return an authorisation URL.');
  return { authUrl: body.url, authorizationId: body.authorization_id ?? null };
}

/**
 * Exchange the redirect `code` for a session. This is the point consent
 * becomes usable data access.
 */
export async function createSession(app, code) {
  const body = await request(app, '/sessions', { method: 'POST', body: { code } });
  if (!body?.session_id) throw new EbError('consent_cancelled', 'Bank authorisation did not complete.', 400, body);
  return {
    sessionId: body.session_id,
    accounts: body.accounts ?? [],
    aspsp: body.aspsp ?? null,
    accessValidUntil: body.access?.valid_until ?? null,
  };
}

export function getSession(app, sessionId) {
  return request(app, `/sessions/${encodeURIComponent(sessionId)}`);
}

/**
 * Accounts for an existing session, as objects.
 *
 * Enable Banking is inconsistent here and it will bite you: POST /sessions
 * returns `accounts` as an array of account OBJECTS, while
 * GET /sessions/{id} returns `accounts` as an array of bare uid STRINGS and
 * puts the objects in `accounts_data`. This normalises both to objects so no
 * caller has to know.
 *
 * Also surfaces `status`: anything other than AUTHORIZED means the consent is
 * no longer usable and the user must reconnect.
 *
 * @param {EbApp} app
 * @param {string} sessionId
 * @returns {Promise<{status: string, accounts: any[]}>}
 */
export async function getSessionAccounts(app, sessionId) {
  const body = await getSession(app, sessionId);
  const raw = body?.accounts ?? [];
  const objects = body?.accounts_data?.length
    ? body.accounts_data
    : raw.every((a) => typeof a === 'object' && a !== null)
      ? raw
      : raw.map((uid) => ({ uid }));
  return { status: body?.status ?? 'UNKNOWN', accounts: objects };
}

/**
 * Account name, currency and identifiers.
 *
 * Required, not optional: GET /sessions returns only uids, so this is the only
 * way to learn what an account is actually called or what currency it holds.
 */
export function getAccountDetails(app, accountUid) {
  return request(app, `/accounts/${encodeURIComponent(accountUid)}/details`);
}

export function getBalances(app, accountUid) {
  return request(app, `/accounts/${encodeURIComponent(accountUid)}/balances`);
}

/**
 * Fetch transactions, following continuation keys.
 *
 * Enable Banking pages in small batches (documented as ~10, and it varies by
 * institution), so a 90-day window is many round trips. `maxPages` is a hard
 * stop: without it a misbehaving continuation key is an infinite loop holding
 * a user's connect flow open.
 *
 * @param {EbApp} app
 * @param {string} accountUid
 * @param {{dateFrom: string, dateTo?: string, maxPages?: number}} p
 */
export async function getTransactions(app, accountUid, p) {
  const out = [];
  let continuationKey;
  let pages = 0;
  const maxPages = p.maxPages ?? 60;

  do {
    const body = await request(app, `/accounts/${encodeURIComponent(accountUid)}/transactions`, {
      query: {
        date_from: p.dateFrom,
        date_to: p.dateTo,
        continuation_key: continuationKey,
      },
    });
    out.push(...(body?.transactions ?? []));
    continuationKey = body?.continuation_key ?? undefined;
    pages += 1;
  } while (continuationKey && pages < maxPages);

  return { transactions: out, truncated: Boolean(continuationKey), pages };
}
