import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProviderWithNavigate } from './auth/AuthProviderWithNavigate';
import { AppProvider } from './state/AppContext';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProviderWithNavigate>
        <AppProvider>
          <App />
        </AppProvider>
      </AuthProviderWithNavigate>
    </BrowserRouter>
  </StrictMode>,
);
