import type { Account, CategoryId, Transaction } from '../data/types';

/**
 * Base URL of the Budgety API service.
 *
 * Build-time: Vite inlines this at build, so changing it on Railway requires a
 * rebuild, not just a variable edit. Empty string means "same origin", which
 * is what the dev proxy in vite.config.ts provides.
 */
const BASE = import.meta.env.VITE_API_URL ?? '';

export interface Bank {
  name: string;
  country: string;
  logo: string | null;
  beta: boolean;
  psuTypes: string[];
}

export interface BankData {
  accounts: Account[];
  transactions: Transaction[];
  source: { provider: string; env: string; bank: string };
  notice?: string;
}

/** Error codes the UI branches on. Anything else is treated as unexpected. */
export type ApiErrorCode =
  | 'no_session'
  | 'consent_expired'
  | 'consent_cancelled'
  | 'invalid_state'
  | 'state_mismatch'
  | 'bank_unavailable'
  | 'app_inactive'
  | 'provider_not_configured'
  | 'unauthenticated'
  | 'internal_error';

export class ApiError extends Error {
  code: ApiErrorCode | string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** Supplied by AppProvider so this module never imports Auth0 directly. */
export type TokenGetter = () => Promise<string | null>;

async function request<T>(path: string, getToken: TokenGetter, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const err = body?.error;
    throw new ApiError(
      err?.code ?? 'internal_error',
      err?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  return body as T;
}

export function listBanks(getToken: TokenGetter, country = 'GB', env = 'sandbox') {
  return request<{ banks: Bank[] }>(
    `/api/banks?country=${encodeURIComponent(country)}&env=${encodeURIComponent(env)}`,
    getToken,
  );
}

export function startConnect(
  getToken: TokenGetter,
  bank: { name: string; country: string },
  env: string,
) {
  return request<{ authUrl: string; state: string }>('/api/connect', getToken, {
    method: 'POST',
    body: JSON.stringify({ bankName: bank.name, bankCountry: bank.country, env }),
  });
}

export function completeConnect(getToken: TokenGetter, code: string, state: string) {
  return request<{ connected: boolean; accountCount: number }>('/api/sessions', getToken, {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  });
}

export function fetchBankData(getToken: TokenGetter) {
  return request<BankData>('/api/data', getToken);
}

export function disconnect(getToken: TokenGetter) {
  return request<{ ok: true }>('/api/session', getToken, { method: 'DELETE' });
}

export function sendFeedback(
  getToken: TokenGetter,
  entry: { transactionId: string; category: CategoryId; previous: CategoryId | null; merchant: string },
) {
  return request<{ ok: true }>('/api/feedback', getToken, {
    method: 'POST',
    body: JSON.stringify(entry),
  });
}

/**
 * Last successful payload, so the dashboard renders instantly on every load
 * after the first while a refresh happens in the background. A bank fetch is
 * 10-30s; nobody should watch a spinner twice.
 */
const CACHE_KEY = 'budgety.bankdata.v1';

export function readCache(): BankData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as BankData) : null;
  } catch {
    return null;
  }
}

export function writeCache(data: BankData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Quota or private mode. A missing cache is a slower app, not a broken one.
  }
}

export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
