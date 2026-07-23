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
import InsufficientBalanceModal from './components/InsufficientBalanceModal';
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
  const [balance, setBalance] = useState(0);
  const [insufficientModal, setInsufficientModal] = useState(null);

  // Contacto por WhatsApp para activar el plan Pro (reemplaza el pago por creditos)
  const openProWhatsApp = () => window.api.openExternal?.('https://wa.me/51931119176?text=' + encodeURIComponent('Hola, quiero activar el plan Pro para usar todas las funciones.'));

  // Refrescar saldo del user logueado
  useEffect(() => {
    if (!user) { setBalance(0); return; }
    const fetchBalance = () => {
      window.api.getBalance?.().then((r) => setBalance(Number(r?.balance) || 0)).catch(() => {});
    };
    fetchBalance();
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [user]);

  // Listen para updates de saldo desde charges del backend
  useEffect(() => {
    window.api.onBalanceUpdated?.((data) => {
      if (typeof data?.balance === 'number') setBalance(data.balance);
    });
    window.api.onBalanceInsufficient?.((data) => {
      setInsufficientModal({
        currentBalance: data?.currentBalance ?? 0,
        needed: data?.needed,
      });
    });
  }, []);

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
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} tabs={TABS} tier={tier} user={user} balance={balance} onLogout={handleLogout} onUpgrade={openProWhatsApp} proTabs={PRO_TABS} />
      <main className="flex-1 overflow-y-auto p-6">
        <UpdateNotification />
        {/* Scaling LATAM Banner */}
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); window.api.openExternal?.('https://www.scalinglatam.site/agendar'); }}
          className="block mb-5 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer group"
        >
          <div className="relative bg-gradient-to-r from-[#0f0c29] via-[#302b63] to-[#24243e] px-8 py-5 flex items-center gap-6">
            {/* Phone farm icon */}
            <div className="shrink-0 flex items-center gap-1">
              <div className="flex gap-0.5">
                <div className="w-7 h-11 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                  <div className="w-4 h-7 rounded-sm bg-gradient-to-b from-green-400 to-green-600 opacity-80"></div>
                </div>
                <div className="w-7 h-11 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                  <div className="w-4 h-7 rounded-sm bg-gradient-to-b from-orange-400 to-orange-600 opacity-80"></div>
                </div>
                <div className="w-7 h-11 bg-gradient-to-b from-gray-700 to-gray-900 rounded-md border border-gray-600 flex items-center justify-center">
                  <div className="w-4 h-7 rounded-sm bg-gradient-to-b from-pink-400 to-pink-600 opacity-80"></div>
                </div>
              </div>
            </div>
            {/* Text */}
            <div className="flex-1">
              <div className="text-[10px] font-bold text-orange-300 uppercase tracking-widest mb-1">Scaling LATAM</div>
              <h3 className="text-xl font-extrabold text-white leading-tight">
                Arma tu Granja de Bots <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-pink-500">desde cero</span>
              </h3>
              <p className="text-purple-200/70 text-xs mt-1">Te asesoramos gratis para montar tu bot farm y generar ingresos automatizados</p>
            </div>
            {/* CTA */}
            <div className="shrink-0">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-pink-600 text-white text-sm font-bold rounded-xl shadow-lg group-hover:from-yellow-400 group-hover:to-orange-500 group-hover:text-gray-900 transition-all">
                Agendar Asesoria
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
              </span>
            </div>
            {/* Decorative glow */}
            <div className="absolute top-0 right-0 w-64 h-full bg-gradient-to-l from-purple-500/10 to-transparent pointer-events-none"></div>
          </div>
        </a>
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'profiles' && <ProfileList tier={tier} onUpgrade={openProWhatsApp} />}
        {activeTab === 'automations' && <FacebookAutomations tier={tier} onUpgrade={openProWhatsApp} />}
        {activeTab === 'marketplace' && <Marketplace tier={tier} />}
        {activeTab === 'messenger' && <Messenger tier={tier} onUpgrade={openProWhatsApp} />}
        {activeTab === 'groups' && <GroupManager tier={tier} />}
        {activeTab === 'pages' && <PageManager tier={tier} />}
        {activeTab === 'warmup' && <Warmup tier={tier} onUpgrade={openProWhatsApp} />}
        {activeTab === 'shadowban' && <ShadowbanCheck tier={tier} onUpgrade={openProWhatsApp} />}
        {activeTab === 'followers' && <Followers />}
        {activeTab === 'scraper' && <Scraper tier={tier} onUpgrade={openProWhatsApp} />}
        {activeTab === 'scheduler' && <Scheduler tier={tier} onUpgrade={openProWhatsApp} />}
        {activeTab === 'proxies' && <ProxyImport />}
        {activeTab === 'settings' && <Settings tier={tier} user={user} onUpgrade={openProWhatsApp} />}
      </main>
      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} onSuccess={() => { setTier('pro'); setShowPayment(false); }} />}
      {insufficientModal && (
        <InsufficientBalanceModal
          currentBalance={insufficientModal.currentBalance}
          needed={insufficientModal.needed}
          onClose={() => setInsufficientModal(null)}
        />
      )}
    </div>
  );
}
