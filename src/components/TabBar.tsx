import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/categories', label: 'Categories', icon: '🧺' },
  { to: '/statistics', label: 'Statistics', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="App">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          aria-label={t.label}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          {t.icon}
        </NavLink>
      ))}
    </nav>
  );
}
