import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ProfileList from './components/ProfileList';
import ProxyImport from './components/ProxyImport';
import FacebookAutomations from './components/FacebookAutomations';
import Marketplace from './components/Marketplace';
import Messenger from './components/Messenger';
import GroupManager from './components/GroupManager';
import PageManager from './components/PageManager';
import Scheduler from './components/Scheduler';
import Warmup from './components/Warmup';
import ShadowbanCheck from './components/ShadowbanCheck';
import Followers from './components/Followers';
import Scraper from './components/Scraper';
import Settings from './components/Settings';
import LoginScreen from './components/auth/LoginScreen';
import RegisterScreen from './components/auth/RegisterScreen';
import PaymentModal from './components/payments/PaymentModal';
import UpdateNotification from './components/UpdateNotification';

const TABS = {
  dashboard: 'Dashboard',
  profiles: 'Perfiles',
  automations: 'Automatizaciones',
  marketplace: 'Marketplace',
  messenger: 'Messenger',
  groups: 'Grupos',
  pages: 'Paginas',
  warmup: 'Warm-up',
  shadowban: 'Restricciones',
  followers: 'Amigos',
  scraper: 'Scraper',
  scheduler: 'Programador',
  proxies: 'Proxies',
  settings: 'Configuracion',
};

const PRO_TABS = ['scheduler', 'messenger', 'warmup', 'shadowban', 'scraper'];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState(null);
  const [tier, setTier] = useState('free');
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState('login');
  const [showPayment, setShowPayment] = useState(false);

  useEffect(() => {
    window.api.getSession().then((session) => {
      if (session?.user) { setUser(session.user); setTier(session.tier || 'free'); }
      setAuthLoading(false);
    }).catch(() => setAuthLoading(false));
    window.api.onAuthStateChange?.((data) => {
      if (data.user) { setUser(data.user); setTier(data.tier || 'free'); }
      else { setUser(null); setTier('free'); }
    });
  }, []);

  const handleLogin = (userData, userTier) => { setUser(userData); setTier(userTier || 'free'); };
  const handleLogout = async () => { await window.api.logout(); setUser(null); setTier('free'); setActiveTab('dashboard'); };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-trust-dark">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2"><span className="text-white">Trust</span><span className="text-blue-400">Face</span></h1>
          <p className="text-white/40 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authView === 'register') return <RegisterScreen onSwitchToLogin={() => setAuthView('login')} onLogin={handleLogin} />;
    return <LoginScreen onLogin={handleLogin} onSwitchToRegister={() => setAuthView('register')} />;
  }

  return (
    <div className="flex h-screen bg-trust-bg">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} tabs={TABS} tier={tier} user={user} onLogout={handleLogout} onUpgrade={() => setShowPayment(true)} proTabs={PRO_TABS} />
      <main className="flex-1 overflow-y-auto p-6">
        <UpdateNotification />
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'profiles' && <ProfileList tier={tier} onUpgrade={() => setShowPayment(true)} />}
        {activeTab === 'automations' && <FacebookAutomations tier={tier} onUpgrade={() => setShowPayment(true)} />}
        {activeTab === 'marketplace' && <Marketplace tier={tier} />}
        {activeTab === 'messenger' && <Messenger tier={tier} onUpgrade={() => setShowPayment(true)} />}
        {activeTab === 'groups' && <GroupManager tier={tier} />}
        {activeTab === 'pages' && <PageManager tier={tier} />}
        {activeTab === 'warmup' && <Warmup tier={tier} onUpgrade={() => setShowPayment(true)} />}
        {activeTab === 'shadowban' && <ShadowbanCheck tier={tier} onUpgrade={() => setShowPayment(true)} />}
        {activeTab === 'followers' && <Followers />}
        {activeTab === 'scraper' && <Scraper tier={tier} onUpgrade={() => setShowPayment(true)} />}
        {activeTab === 'scheduler' && <Scheduler tier={tier} onUpgrade={() => setShowPayment(true)} />}
        {activeTab === 'proxies' && <ProxyImport />}
        {activeTab === 'settings' && <Settings tier={tier} user={user} onUpgrade={() => setShowPayment(true)} />}
      </main>
      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} onSuccess={() => { setTier('pro'); setShowPayment(false); }} />}
    </div>
  );
}
