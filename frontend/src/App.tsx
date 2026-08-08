import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from './services/api';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import BotSettingsPage from './pages/BotSettingsPage';
import AccessGate from './pages/AccessGate';

function App() {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const res = await api.auth.check();
      setIsAuth(res.authorized);
      if (res.authorized) setUser(res.user);
    } catch { setIsAuth(false); }
  };

  const handleLogout = async () => {
    try { await api.auth.logout(); } catch {}
    setIsAuth(false); setUser(null);
  };

  const handleLoginSuccess = (userData: any) => {
    setIsAuth(true); setUser(userData);
  };

  if (isAuth === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-tg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const appContent = !isAuth ? (
    <LoginPage onLoginSuccess={handleLoginSuccess} />
  ) : (
    <Routes>
      <Route path="/chat" element={<ChatPage user={user} onLogout={handleLogout} />} />
      <Route path="/bot" element={<BotSettingsPage />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );

  return <AccessGate>{appContent}</AccessGate>;
}

export default App;
