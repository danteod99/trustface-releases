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

const PRO_TABS = ['marketplace', 'scheduler', 'messenger', 'warmup', 'shadowban', 'scraper'];

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
        {/* GenFarmer Banner */}
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.api.openExternal?.('https://genfarmer.com/') || window.open('https://genfarmer.com/', '_blank'); }}
          className="block mb-5 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer group"
        >
          <div className="relative bg-gradient-to-r from-[#1a1f3c] via-[#2a3a6e] to-[#1a2955] px-8 py-5 flex items-center gap-6">
            {/* Farm illustration */}
            <div className="shrink-0 flex items-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  <div className="w-8 h-12 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                    <div className="w-5 h-8 rounded-sm bg-gradient-to-b from-blue-400 to-blue-600 opacity-80"></div>
                  </div>
                  <div className="w-8 h-12 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                    <div className="w-5 h-8 rounded-sm bg-gradient-to-b from-green-400 to-green-600 opacity-80"></div>
                  </div>
                  <div className="w-8 h-12 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                    <div className="w-5 h-8 rounded-sm bg-gradient-to-b from-purple-400 to-purple-600 opacity-80"></div>
                  </div>
                  <div className="w-8 h-12 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                    <div className="w-5 h-8 rounded-sm bg-gradient-to-b from-pink-400 to-pink-600 opacity-80"></div>
                  </div>
                  <div className="w-8 h-12 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                    <div className="w-5 h-8 rounded-sm bg-gradient-to-b from-yellow-400 to-yellow-600 opacity-80"></div>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full opacity-60"></div>
              </div>
            </div>
            {/* Text */}
            <div className="flex-1">
              <div className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-1">GenFarmer Technologies</div>
              <h3 className="text-xl font-extrabold text-white leading-tight">
                Compra tu Granja de Bots <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#52aff7] to-[#ffe787]">YA</span>
              </h3>
              <p className="text-blue-200/70 text-xs mt-1">Box phones, cloud phones y software de automatizacion para escalar tus cuentas</p>
            </div>
            {/* CTA */}
            <div className="shrink-0">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#52aff7] to-[#3b8dd4] text-white text-sm font-bold rounded-xl shadow-lg group-hover:from-[#ffe787] group-hover:to-[#f5c842] group-hover:text-gray-900 transition-all">
                Ver Ofertas
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </span>
            </div>
            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none"></div>
          </div>
        </a>
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
