import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Period } from '../data/types';
import type { AccountFilter } from '../data/selectors';

interface AppState {
  period: Period;
  setPeriod: (p: Period) => void;
  account: AccountFilter;
  setAccount: (a: AccountFilter) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<Period>('month');
  const [account, setAccount] = useState<AccountFilter>('all');
  const value = useMemo(
    () => ({ period, setPeriod, account, setAccount }),
    [period, account],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
