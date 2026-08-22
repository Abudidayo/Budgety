import { useAuth0 } from '@auth0/auth0-react';
import { getDisplayName } from '../auth/userName';
import { useState } from 'react';
import { BankPicker } from '../components/BankPicker';
import { formatGBP } from '../data/selectors';
import { useApp } from '../state/AppContext';
import './SettingsPage.css';

export function SettingsPage() {
  const { logout, user } = useAuth0();
  const { accounts, bankName, disconnect } = useApp();
  const [picking, setPicking] = useState(false);

  const handleDisconnect = async () => {
    await disconnect();
    // Stay on Settings — this is where reconnecting happens.
    setPicking(false);
  };

  const handleLogout = () => {
    void logout({
      logoutParams: { returnTo: `${window.location.origin}/login` },
    });
  };

  return (
    <div className="settings-page">
      <h2 className="section-title settings-title">Settings</h2>

      <div className="card settings-hero">
        <span className="settings-hero-icon" aria-hidden="true">
          ⚙️
        </span>
        <p className="settings-hero-heading">Settings live here soon</p>
        <p className="settings-hero-sub">
          Connected accounts, budgets and notifications — placeholder for now.
        </p>
      </div>

      <div className="card settings-accounts">
        <p className="settings-accounts-label">Connected accounts</p>
        {accounts.length === 0 && (
          <p className="settings-accounts-empty">No accounts connected yet.</p>
        )}
        {bankName && <p className="settings-accounts-empty">via {bankName}</p>}
        <ul className="settings-accounts-list">
          {accounts.map((account) => (
            <li key={account.id} className="settings-account-row">
              <div className="settings-account-info">
                <span className="settings-account-name">{account.name}</span>
                <span className="settings-account-balance">
                  {formatGBP(account.balancePence)}
                </span>
              </div>
              <button type="button" className="settings-manage-pill" disabled>
                Manage
              </button>
            </li>
          ))}
        </ul>
        {picking ? (
          <BankPicker onCancel={() => setPicking(false)} />
        ) : accounts.length > 0 ? (
          <button type="button" className="settings-logout" onClick={() => void handleDisconnect()}>
            Disconnect bank
          </button>
        ) : (
          <button type="button" className="settings-connect" onClick={() => setPicking(true)}>
            Connect a bank
          </button>
        )}
      </div>

      <div className="card settings-profile">
        <div>
          <p className="settings-profile-label">Signed in as</p>
          <p className="settings-profile-name">{getDisplayName(user)}</p>
        </div>
        <button type="button" className="settings-logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}
