/**
 * Persistence: consent sessions and category feedback.
 *
 * Backed by a single JSON file on a Railway volume mounted at /data. Chosen
 * over a database because this is a hackathon and the entire dataset is
 * "which bank session does this user own" plus a list of corrections.
 *
 * Two deliberate properties:
 *  - writes are atomic (write temp, rename) so a crash mid-write cannot leave
 *    a truncated file that bricks every subsequent boot;
 *  - if the volume is missing or unwritable we fall back to memory with a loud
 *    log, because a demo that forgets sessions on redeploy is survivable and a
 *    demo that 500s on every request is not.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DATA_DIR = process.env.DATA_DIR ?? (process.env.RAILWAY_ENVIRONMENT ? '/data' : '.data');
const STORE_PATH = join(DATA_DIR, 'store.json');

/** @typedef {{sessionId: string, ebEnv: 'sandbox'|'production', aspspName: string, aspspCountry: string, accountUids: string[], createdAt: string, accessValidUntil: string|null}} ConsentSession */

/** @type {{sessions: Record<string, ConsentSession>, feedback: Record<string, import('./contracts.mjs').CategoryFeedback[]>, pendingAuth: Record<string, {userId: string, ebEnv: string, createdAt: string}>}} */
let cache = { sessions: {}, feedback: {}, pendingAuth: {} };
let usingMemoryOnly = false;
let loaded = false;

/** Serialises writes so concurrent requests cannot interleave read-modify-write. */
let writeChain = Promise.resolve();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const text = await readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(text);
    cache = {
      sessions: parsed.sessions ?? {},
      feedback: parsed.feedback ?? {},
      pendingAuth: parsed.pendingAuth ?? {},
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[store] could not read ${STORE_PATH}, starting empty:`, err.message);
    }
  }
}

async function persist() {
  if (usingMemoryOnly) return;
  writeChain = writeChain.then(async () => {
    const tmp = `${STORE_PATH}.tmp`;
    try {
      await mkdir(dirname(STORE_PATH), { recursive: true });
      await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf8');
      await rename(tmp, STORE_PATH);
    } catch (err) {
      usingMemoryOnly = true;
      console.error(
        `[store] VOLUME UNAVAILABLE (${STORE_PATH}): ${err.message}. ` +
          'Falling back to in-memory storage — sessions will be lost on restart.',
      );
    }
  });
  return writeChain;
}

/** Remember which user started an authorisation, keyed by the `state` we sent. */
export async function putPendingAuth(state, value) {
  await load();
  cache.pendingAuth[state] = { ...value, createdAt: new Date().toISOString() };
  await persist();
}

/** One-shot: consumes the entry so a `state` cannot be replayed. */
export async function takePendingAuth(state) {
  await load();
  const found = cache.pendingAuth[state];
  if (!found) return null;
  delete cache.pendingAuth[state];
  await persist();
  return found;
}

/** @param {string} userId Auth0 `sub` */
export async function getSessionFor(userId) {
  await load();
  return cache.sessions[userId] ?? null;
}

export async function putSessionFor(userId, session) {
  await load();
  cache.sessions[userId] = session;
  await persist();
}

export async function deleteSessionFor(userId) {
  await load();
  delete cache.sessions[userId];
  await persist();
}

/** Newest first — the categoriser contract depends on this ordering. */
export async function getFeedbackFor(userId) {
  await load();
  return cache.feedback[userId] ?? [];
}

export async function addFeedback(userId, entry) {
  await load();
  const list = cache.feedback[userId] ?? [];
  cache.feedback[userId] = [entry, ...list.filter((f) => f.transactionId !== entry.transactionId)];
  await persist();
  return cache.feedback[userId];
}

/** Exposed for /api/health so a broken volume is visible before the demo. */
export function storageStatus() {
  return { path: STORE_PATH, degradedToMemory: usingMemoryOnly };
}
