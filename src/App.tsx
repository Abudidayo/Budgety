import { useAuth0 } from '@auth0/auth0-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { BankGate } from './components/BankGate';
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
import { CallbackPage } from './pages/CallbackPage';
import { ConnectPage } from './pages/ConnectPage';
import { PrivacyPage, TermsPage } from './pages/LegalPages';
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
        {/* Public on purpose: these URLs are registered with Enable Banking
            and must resolve for anyone, signed in or not. */}
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
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
      <Route path="/callback" element={<CallbackPage />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route
        path="*"
        element={
          <div className="shell">
            <Header />
            <main className="shell-main">
              <Routes>
                {/* Settings must stay reachable with no bank connected, so the
                    user has somewhere to connect one from. */}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/" element={<BankGate><HomePage /></BankGate>} />
                <Route path="/categories" element={<BankGate><CategoriesPage /></BankGate>} />
                <Route path="/statistics" element={<BankGate><StatisticsPage /></BankGate>} />
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
