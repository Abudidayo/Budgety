import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import { TabBar } from './components/TabBar';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { StatisticsPage } from './pages/StatisticsPage';

export default function App() {
  return (
    <div className="shell">
      <Header />
      <main className="shell-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/statistics" element={<StatisticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      <TabBar />
    </div>
  );
}
