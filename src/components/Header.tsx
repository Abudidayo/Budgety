import { useAuth0 } from '@auth0/auth0-react';
import { getFirstName } from '../auth/userName';
import { AccountSelector } from './AccountSelector';

export function Header() {
  const { user } = useAuth0();

  return (
    <header className="header">
      <div>
        <div className="header-hi">Good afternoon 🌿</div>
        <div className="header-name">Hey, {getFirstName(user)}</div>
      </div>
      <AccountSelector />
    </header>
  );
}
