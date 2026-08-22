import { useEffect, useRef, useState } from 'react';
import { formatGBP, type AccountFilter } from '../data/selectors';
import { useApp } from '../state/AppContext';

/**
 * Account switcher.
 *
 * Renders only accounts the user actually connected — there is no hardcoded
 * bank list, because real account ids are opaque uids assigned by the bank.
 */
export function AccountSelector() {
  const { account, setAccount, accounts } = useApp();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (a: AccountFilter) => {
    setAccount(a);
    setOpen(false);
  };

  const label =
    account === 'all'
      ? 'All accounts'
      : (accounts.find((a) => a.id === account)?.name ?? 'Account');

  // Nothing to switch between until a bank is connected.
  if (accounts.length === 0) return null;

  return (
    <div className="acct" ref={rootRef}>
      <button
        className="acct-btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="acct-dot acct-swatch-all" />
        {label}
        <span className="acct-chev">▼</span>
      </button>
      {open && (
        <div className="acct-panel" role="listbox" aria-label="Accounts">
          {accounts.length > 1 && (
            <button
              className={`acct-row${account === 'all' ? ' sel' : ''}`}
              role="option"
              aria-selected={account === 'all'}
              onClick={() => pick('all')}
            >
              <span className="acct-card acct-swatch-all" />
              <span>
                <span className="acct-nm">All accounts</span>
                <br />
                <span className="acct-bal">{accounts.length} connected</span>
              </span>
              <span className="acct-tick">✓</span>
            </button>
          )}
          {accounts.map((a) => (
            <button
              key={a.id}
              className={`acct-row${account === a.id ? ' sel' : ''}`}
              role="option"
              aria-selected={account === a.id}
              onClick={() => pick(a.id)}
            >
              <span className="acct-card acct-swatch-all" />
              <span>
                <span className="acct-nm">{a.name}</span>
                <br />
                <span className="acct-bal">{formatGBP(a.balancePence)}</span>
              </span>
              <span className="acct-tick">✓</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
