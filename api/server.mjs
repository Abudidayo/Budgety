/**
 * Budgety API — the Enable Banking adapter.
 *
 * Deployed as a separate Railway service from the SPA, so every response is
 * cross-origin and CORS is load-bearing rather than incidental.
 *
 * Surface:
 *   GET    /api/health
 *   GET    /api/banks?country=GB&env=sandbox
 *   POST   /api/connect        { bankName, bankCountry, env }  -> { authUrl }
 *   POST   /api/sessions       { code, state }                 -> { accounts }
 *   GET    /api/data                                           -> { accounts, transactions }
 *   POST   /api/feedback       { transactionId, category }     -> { ok }
 *   DELETE /api/session
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { CONFIDENCE_THRESHOLD } from './src/contracts.mjs';
import { categoriser } from './src/categorise.mjs';
import {
  EbError,
  createSession,
  getApplication,
  getAccountDetails,
  getBalances,
  getSessionAccounts,
  getTransactions,
  listAspsps,
  startAuthorisation,
} from './src/enablebanking.mjs';
import {
  normaliseAccount,
  normaliseTransaction,
  pickBalancePence,
  toClientTransactions,
} from './src/normalise.mjs';
import * as store from './src/sessions.mjs';
import { AuthError, authStatus, authenticate } from './src/auth.mjs';

const PORT = Number.parseInt(process.env.PORT ?? '8080', 10);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? WEB_ORIGIN).split(',').map((s) => s.trim()).filter(Boolean),
);
const REDIRECT_URL = process.env.EB_REDIRECT_URL ?? `${WEB_ORIGIN}/callback`;
const HISTORY_DAYS = Number.parseInt(process.env.HISTORY_DAYS ?? '90', 10);
/** Consent lifetime we request. Banks cap this; Mock ASPSP allows 180 days. */
const CONSENT_DAYS = Number.parseInt(process.env.CONSENT_DAYS ?? '90', 10);

/**
 * Load a PEM from either an inline env var or a path. Railway variables cannot
 * hold newlines reliably, so `\n` escapes are unescaped here.
 */
function loadPem(inline, path) {
  if (inline) return inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
  if (path) return readFileSync(path, 'utf8');
  return null;
}

/** @type {Record<string, import('./src/enablebanking.mjs').EbApp|null>} */
const APPS = {
  sandbox: buildApp('EB_SANDBOX'),
  production: buildApp('EB_PRODUCTION'),
};

function buildApp(prefix) {
  const applicationId = process.env[`${prefix}_APP_ID`];
  const privateKeyPem = loadPem(process.env[`${prefix}_PRIVATE_KEY`], process.env[`${prefix}_KEY_PATH`]);
  if (!applicationId || !privateKeyPem) return null;
  return { applicationId, privateKeyPem, env: prefix === 'EB_SANDBOX' ? 'sandbox' : 'production' };
}

function appFor(env) {
  const key = env === 'production' ? 'production' : 'sandbox';
  const app = APPS[key];
  if (!app) {
    throw new EbError(
      'provider_not_configured',
      `Enable Banking ${key} credentials are not configured on the API.`,
      503,
    );
  }
  return app;
}

// ---------------------------------------------------------------- http plumbing

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Dev-User');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function fail(res, status, code, message) {
  send(res, status, { error: { code, message } });
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('payload too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('invalid JSON body');
  }
}

const isoDaysAgo = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- handlers

async function handleHealth(req, res) {
  const configured = Object.entries(APPS)
    .filter(([, v]) => v)
    .map(([k]) => k);

  let provider = null;
  const probe = APPS.sandbox ?? APPS.production;
  if (probe) {
    try {
      const app = await getApplication(probe);
      provider = { reachable: true, name: app.name, env: app.environment, active: app.active };
    } catch (err) {
      provider = { reachable: false, code: err.code ?? 'unknown' };
    }
  }

  send(res, 200, {
    ok: true,
    enableBankingApps: configured,
    provider,
    auth: authStatus(),
    storage: store.storageStatus(),
  });
}

async function handleBanks(req, res, url) {
  const country = (url.searchParams.get('country') ?? 'GB').toUpperCase();
  const env = url.searchParams.get('env') ?? 'sandbox';
  const banks = await listAspsps(appFor(env), country);
  send(res, 200, { country, env, banks });
}

async function handleConnect(req, res) {
  const { userId } = await authenticate(req);
  const body = await readJson(req);

  const env = body.env === 'production' ? 'production' : 'sandbox';
  const bankName = body.bankName;
  const bankCountry = (body.bankCountry ?? '').toUpperCase();
  if (!bankName || !bankCountry) {
    return fail(res, 400, 'invalid_request', 'bankName and bankCountry are required.');
  }

  const state = randomUUID();
  const validUntil = new Date(Date.now() + CONSENT_DAYS * 86400_000);

  const { authUrl } = await startAuthorisation(appFor(env), {
    aspspName: bankName,
    aspspCountry: bankCountry,
    redirectUrl: REDIRECT_URL,
    state,
    validUntil,
  });

  // Bind the eventual callback to the user who started it. The browser never
  // gets to assert its own identity here.
  await store.putPendingAuth(state, { userId, ebEnv: env });

  send(res, 200, { authUrl, state });
}

async function handleCreateSession(req, res) {
  const { userId } = await authenticate(req);
  const { code, state } = await readJson(req);
  if (!code) return fail(res, 400, 'consent_cancelled', 'No authorisation code was returned by the bank.');

  const pending = state ? await store.takePendingAuth(state) : null;
  if (state && !pending) {
    return fail(res, 400, 'invalid_state', 'This authorisation link has already been used or has expired.');
  }
  if (pending && pending.userId !== userId) {
    return fail(res, 403, 'state_mismatch', 'This authorisation was started by a different account.');
  }

  const env = pending?.ebEnv ?? 'sandbox';
  const session = await createSession(appFor(env), code);

  await store.putSessionFor(userId, {
    sessionId: session.sessionId,
    ebEnv: env,
    aspspName: session.aspsp?.name ?? 'Bank',
    aspspCountry: session.aspsp?.country ?? '',
    accountUids: session.accounts.map((a) => a.uid ?? a.resource_id).filter(Boolean).map(String),
    createdAt: new Date().toISOString(),
    accessValidUntil: session.accessValidUntil,
  });

  send(res, 200, { connected: true, accountCount: session.accounts.length });
}

async function handleData(req, res) {
  const { userId } = await authenticate(req);
  const consent = await store.getSessionFor(userId);
  if (!consent) return fail(res, 404, 'no_session', 'No bank is connected yet.');

  const app = appFor(consent.ebEnv);

  // The session tells us which accounts the consent actually covers. Re-read it
  // rather than trusting what we stored, so a revoked account disappears.
  let accountsRaw;
  try {
    const session = await getSessionAccounts(app, consent.sessionId);
    if (session.status !== 'AUTHORIZED') {
      await store.deleteSessionFor(userId);
      return fail(res, 410, 'consent_expired', 'Your bank connection is no longer authorised. Please reconnect.');
    }
    accountsRaw = session.accounts;
  } catch (err) {
    if (err instanceof EbError && (err.status === 404 || err.code === 'not_found')) {
      await store.deleteSessionFor(userId);
      return fail(res, 410, 'consent_expired', 'Your bank connection has expired. Please reconnect.');
    }
    throw err;
  }

  // GET /sessions gives us uids only, so every account needs a details call
  // before we can even tell what currency it is.
  const detailed = [];
  for (const raw of accountsRaw) {
    const uid = raw.uid ?? raw;
    try {
      detailed.push(await getAccountDetails(app, uid));
    } catch (err) {
      console.warn(`[data] details unavailable for ${uid}: ${err.code ?? err.message}`);
    }
  }

  const accounts = detailed.map(normaliseAccount).filter((a) => a.currency === 'GBP');
  const skippedNonGbp = detailed.length - accounts.length;

  const dateFrom = isoDaysAgo(HISTORY_DAYS);
  const normalised = [];

  // Sequential on purpose: Enable Banking rate-limits per application, and a
  // burst across many accounts is the fastest way to get 429s mid-demo.
  for (const account of accounts) {
    try {
      const balances = await getBalances(app, account.uid);
      account.balancePence = pickBalancePence(balances);
    } catch (err) {
      console.warn(`[data] balance unavailable for ${account.uid}: ${err.code ?? err.message}`);
    }

    const { transactions, truncated } = await getTransactions(app, account.uid, { dateFrom });
    if (truncated) {
      console.warn(`[data] transaction history truncated for ${account.uid} at the page cap`);
    }
    for (const tx of transactions) {
      normalised.push(normaliseTransaction(tx, { accountId: account.id }));
    }
  }

  const feedback = await store.getFeedbackFor(userId);
  let results;
  try {
    results = await categoriser.categorise(normalised, { userId, feedback });
  } catch (err) {
    // Uncategorised data beats no data. Never let the engine take the sync down.
    console.error('[data] categoriser failed, returning uncategorised:', err.message);
    results = [];
  }

  send(res, 200, {
    accounts: accounts.map(({ uid, currency, ...rest }) => ({ ...rest })),
    transactions: toClientTransactions(normalised, results, CONFIDENCE_THRESHOLD),
    source: { provider: 'enablebanking', env: consent.ebEnv, bank: consent.aspspName },
    ...(skippedNonGbp > 0 ? { notice: `${skippedNonGbp} non-GBP account(s) hidden.` } : {}),
  });
}

async function handleFeedback(req, res) {
  const { userId } = await authenticate(req);
  const body = await readJson(req);
  if (!body.transactionId || !body.category) {
    return fail(res, 400, 'invalid_request', 'transactionId and category are required.');
  }

  await store.addFeedback(userId, {
    transactionId: String(body.transactionId),
    userId,
    category: body.category,
    previous: body.previous ?? null,
    descriptor: String(body.descriptor ?? ''),
    merchant: String(body.merchant ?? ''),
    mcc: body.mcc ? String(body.mcc) : null,
    amountPence: Number.isFinite(body.amountPence) ? body.amountPence : 0,
    correctedAt: new Date().toISOString(),
  });

  send(res, 200, { ok: true });
}

async function handleDisconnect(req, res) {
  const { userId } = await authenticate(req);
  await store.deleteSessionFor(userId);
  send(res, 200, { ok: true });
}

// ---------------------------------------------------------------- router

const ROUTES = [
  ['GET', '/api/health', handleHealth],
  ['GET', '/api/banks', handleBanks],
  ['POST', '/api/connect', handleConnect],
  ['POST', '/api/sessions', handleCreateSession],
  ['GET', '/api/data', handleData],
  ['POST', '/api/feedback', handleFeedback],
  ['DELETE', '/api/session', handleDisconnect],
];

const server = createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const route = ROUTES.find(([method, path]) => method === req.method && path === url.pathname);
  if (!route) return fail(res, 404, 'not_found', `No route for ${req.method} ${url.pathname}`);

  try {
    await route[2](req, res, url);
  } catch (err) {
    if (err instanceof AuthError) return fail(res, err.status, err.code, err.message);
    if (err instanceof EbError) return fail(res, err.status, err.code, err.message);
    console.error(`[api] unhandled error on ${url.pathname}:`, err);
    fail(res, 500, 'internal_error', 'Something went wrong.');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Budgety API listening on :${PORT}`);
  console.log(`  web origin(s): ${[...ALLOWED_ORIGINS].join(', ')}`);
  console.log(`  redirect url : ${REDIRECT_URL}`);
  console.log(`  EB apps      : ${Object.entries(APPS).filter(([, v]) => v).map(([k]) => k).join(', ') || 'NONE'}`);
});
