import { useAuth0 } from '@auth0/auth0-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import {
  AuthErrorPage,
  AuthLoadingPage,
  LoginPage,
  VerifyEmailPage,
} from './pages/LoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatisticsPage } from './pages/StatisticsPage';

export default function App() {
  const { error, isAuthenticated, isLoading, loginWithRedirect, logout, user } =
    useAuth0();

  if (isLoading) {
    return <AuthLoadingPage />;
  }

  if (error) {
    return (
      <AuthErrorPage
        onRetry={() => void loginWithRedirect({ appState: { returnTo: '/' } })}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (user?.email && user.email_verified === false) {
    return (
      <VerifyEmailPage
        onLogout={() =>
          void logout({
            logoutParams: { returnTo: `${window.location.origin}/login` },
          })
        }
      />
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route
        path="*"
        element={
          <div className="shell">
            <Header />
            <main className="shell-main">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/statistics" element={<StatisticsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <TabBar />
          </div>
        }
      />
    </Routes>
  );
}
