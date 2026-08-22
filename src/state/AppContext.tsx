import { useAuth0 } from '@auth0/auth0-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  clearCache,
  disconnect as apiDisconnect,
  fetchBankData,
  readCache,
  writeCache,
  type TokenGetter,
} from '../api/client';
import type { Account, Period, Transaction } from '../data/types';
import type { AccountFilter } from '../data/selectors';

/** Where the app is in the connect lifecycle. Drives which screen renders. */
export type ConnectionStatus =
  | 'loading'      // first fetch in flight, nothing cached
  | 'refreshing'   // cached data on screen, fetch in flight
  | 'connected'
  | 'disconnected' // no bank linked yet
  | 'error';

interface AppState {
  period: Period;
  setPeriod: (p: Period) => void;
  account: AccountFilter;
  setAccount: (a: AccountFilter) => void;

  accounts: Account[];
  transactions: Transaction[];
  status: ConnectionStatus;
  error: string | null;
  bankName: string | null;

  refresh: () => Promise<void>;
  disconnect: () => Promise<void>;
  getToken: TokenGetter;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { getAccessTokenSilently, getIdTokenClaims, isAuthenticated } = useAuth0();

  const [period, setPeriod] = useState<Period>('month');
  const [account, setAccount] = useState<AccountFilter>('all');

  const cached = useMemo(() => readCache(), []);
  const [accounts, setAccounts] = useState<Account[]>(cached?.accounts ?? []);
  const [transactions, setTransactions] = useState<Transaction[]>(cached?.transactions ?? []);
  const [bankName, setBankName] = useState<string | null>(cached?.source?.bank ?? null);
  const [status, setStatus] = useState<ConnectionStatus>(cached ? 'refreshing' : 'loading');
  const [error, setError] = useState<string | null>(null);

  /**
   * Auth0 only issues an access token when an audience is configured. Until the
   * Auth0 API is registered, fall back to no token rather than throwing — the
   * API's dev-auth path still works locally, and the failure is legible.
   */
  const getToken = useCallback<TokenGetter>(async () => {
    if (!isAuthenticated) return null;
    try {
      // Preferred: a real access token, which only exists once an API is
      // registered in Auth0 and VITE_AUTH0_AUDIENCE is set.
      return await getAccessTokenSilently();
    } catch {
      // Fallback: the ID token. The API verifies it against Auth0's JWKS with
      // the SPA client id as the audience, so this is still a real identity
      // check — just a weaker one. Remove once the audience is configured.
      try {
        const claims = await getIdTokenClaims();
        return claims?.__raw ?? null;
      } catch {
        return null;
      }
    }
  }, [getAccessTokenSilently, getIdTokenClaims, isAuthenticated]);

  const refresh = useCallback(async () => {
    setError(null);
    setStatus(transactions.length ? 'refreshing' : 'loading');
    try {
      const data = await fetchBankData(getToken);
      setAccounts(data.accounts);
      setTransactions(data.transactions);
      setBankName(data.source?.bank ?? null);
      writeCache(data);
      setStatus('connected');
      // An account filter pinned to an account that is no longer connected
      // would silently render an empty dashboard.
      setAccount((current) =>
        current !== 'all' && !data.accounts.some((a) => a.id === current) ? 'all' : current,
      );
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'no_session' || err.code === 'consent_expired')) {
        clearCache();
        setAccounts([]);
        setTransactions([]);
        setStatus('disconnected');
        setError(err.code === 'consent_expired' ? 'Your bank connection expired. Please reconnect.' : null);
        return;
      }
      setStatus(transactions.length ? 'connected' : 'error');
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }, [getToken, transactions.length]);

  const disconnect = useCallback(async () => {
    try {
      await apiDisconnect(getToken);
    } finally {
      clearCache();
      setAccounts([]);
      setTransactions([]);
      setBankName(null);
      setStatus('disconnected');
    }
  }, [getToken]);

  useEffect(() => {
    if (isAuthenticated) void refresh();
    // Deliberately only on auth transition: refresh() changes identity on every
    // transaction update, and depending on it here would loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      period, setPeriod, account, setAccount,
      accounts, transactions, status, error, bankName,
      refresh, disconnect, getToken,
    }),
    [period, account, accounts, transactions, status, error, bankName, refresh, disconnect, getToken],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
