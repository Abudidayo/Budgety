import { AccountSelector } from './AccountSelector';

export function Header() {
  return (
    <header className="header">
      <div>
        <div className="header-hi">Good afternoon 🌿</div>
        <div className="header-name">Hey, Abdullah</div>
      </div>
      <AccountSelector />
    </header>
  );
}
