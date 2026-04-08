import React, { useState, useEffect } from 'react';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-trust-accent focus:ring-1 focus:ring-trust-accent/20';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

export default function Settings({ tier, user, onUpgrade }) {
  const [capsolverKey, setCapsolverKey] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiProvider, setAiProvider] = useState('anthropic');
  const [saved, setSaved] = useState(false);
  const [balance, setBalance] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    window.api.getSetting('capsolver_api_key').then((val) => {
      if (val) setCapsolverKey(val);
    });
    window.api.getSetting('ai_api_key').then((val) => {
      if (val) setAiApiKey(val);
    });
    window.api.getSetting('ai_provider').then((val) => {
      if (val) setAiProvider(val);
    });
  }, []);

  const handleSave = async () => {
    await window.api.setSetting('capsolver_api_key', capsolverKey.trim());
    await window.api.setSetting('ai_api_key', aiApiKey.trim());
    await window.api.setSetting('ai_provider', aiProvider);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCheckBalance = async () => {
    if (!capsolverKey.trim()) return;
    setChecking(true);
    setBalance(null);
    try {
      const res = await fetch('https://api.capsolver.com/getBalance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: capsolverKey.trim() }),
      });
      const data = await res.json();
      if (data.errorId === 0) {
        setBalance({ valid: true, amount: data.balance });
      } else {
        setBalance({ valid: false, error: data.errorDescription || 'API key invalida' });
      }
    } catch (err) {
      setBalance({ valid: false, error: 'Error de conexion' });
    }
    setChecking(false);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-trust-dark mb-1">Configuracion</h2>
      <p className="text-trust-muted text-sm mb-6">Servicios externos y preferencias</p>

      {/* Subscription */}
      <div className="bg-white border border-trust-border rounded-xl p-6 shadow-trust max-w-2xl mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-trust-yellow/10 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-trust-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-trust-dark">Suscripcion</h3>
            <p className="text-xs text-trust-muted">Administra tu plan y facturacion</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
            tier === 'pro'
              ? 'bg-trust-yellow/10 text-trust-yellow'
              : 'bg-trust-border text-trust-muted'
          }`}>
            <span className={`w-2 h-2 rounded-full ${tier === 'pro' ? 'bg-trust-yellow' : 'bg-trust-muted'}`} />
            {tier === 'pro' ? 'Plan Pro' : 'Plan Gratuito'}
          </div>
          {tier === 'pro' && (
            <span className="text-xs text-trust-muted">Renovacion automatica activa</span>
          )}
        </div>

        {tier === 'pro' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-trust-muted">Email de la cuenta</span>
              <span className="text-trust-dark font-medium">{user?.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-trust-muted">Estado</span>
              <span className="text-trust-green font-medium">Activo</span>
            </div>
            <div className="border-t border-trust-border pt-3">
              <button className="text-sm text-trust-accent hover:text-trust-accent-hover font-medium transition-colors">
                Ver historial de pagos
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-trust-muted">
              Desbloquea todas las funciones: Programador, Warm-up, Shadowban, Scraper y mas.
            </p>
            <button
              onClick={onUpgrade}
              className="px-5 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors"
            >
              Actualizar a Pro
            </button>
          </div>
        )}
      </div>

      {/* AI Text Generation */}
      <div className="bg-white border border-trust-border rounded-xl p-6 shadow-trust max-w-2xl mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center"><span className="text-lg">✨</span></div>
          <div><h3 className="text-base font-bold text-trust-dark">AI — Generacion de texto</h3><p className="text-xs text-trust-muted">Para variar titulos y generar descripciones en Marketplace</p></div>
        </div>
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLASS}>Proveedor</label>
            <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className={INPUT_CLASS}>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS}>API Key</label>
            <input type="password" value={aiApiKey} onChange={e => setAiApiKey(e.target.value)} placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'} className={INPUT_CLASS} />
          </div>
          <p className="text-[11px] text-trust-muted">Obtiene tu key en {aiProvider === 'anthropic' ? 'console.anthropic.com' : 'platform.openai.com'}</p>
          <button onClick={handleSave} className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
            {saved ? 'Guardado' : 'Guardar API Key'}
          </button>
        </div>
      </div>

      {/* CapSolver */}
      <div className="bg-white border border-trust-border rounded-xl p-6 shadow-trust max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-trust-accent/10 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-trust-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-trust-dark">CapSolver — Auto CAPTCHA</h3>
            <p className="text-xs text-trust-muted">Resuelve captchas automaticamente al iniciar sesion en Instagram</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>API Key de CapSolver</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={capsolverKey}
                onChange={(e) => setCapsolverKey(e.target.value)}
                placeholder="CAP-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                className={INPUT_CLASS + ' font-mono'}
              />
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors shrink-0"
              >
                {saved ? 'Guardado' : 'Guardar'}
              </button>
            </div>
          </div>

          {/* Check balance */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleCheckBalance}
              disabled={!capsolverKey.trim() || checking}
              className="px-4 py-2 bg-trust-surface border border-trust-border text-trust-dark rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-40"
            >
              {checking ? 'Verificando...' : 'Verificar API Key'}
            </button>
            {balance && (
              <span className={`text-sm font-medium ${balance.valid ? 'text-trust-green' : 'text-trust-red'}`}>
                {balance.valid ? `Saldo: $${balance.amount.toFixed(4)}` : balance.error}
              </span>
            )}
          </div>

          {saved && (
            <div className="bg-trust-green/10 text-trust-green text-sm px-4 py-2 rounded-lg font-medium">
              API key guardada. Se aplicara al abrir nuevos navegadores.
            </div>
          )}

          <div className="border-t border-trust-border pt-4 mt-4">
            <h4 className="text-sm font-semibold text-trust-dark mb-2">Como funciona</h4>
            <ul className="text-xs text-trust-muted space-y-1.5">
              <li>1. Se carga una extension en cada navegador que detecta captchas automaticamente</li>
              <li>2. Cuando aparece un captcha (FunCaptcha, reCAPTCHA, hCaptcha), lo envia a CapSolver</li>
              <li>3. CapSolver lo resuelve con AI en 2-5 segundos</li>
              <li>4. La solucion se inyecta y el login continua</li>
            </ul>
          </div>

          <div className="border-t border-trust-border pt-4">
            <h4 className="text-sm font-semibold text-trust-dark mb-2">Obtener API Key</h4>
            <p className="text-xs text-trust-muted">
              1. Crea una cuenta en capsolver.com{' '}
              2. Ve a Dashboard → API Key{' '}
              3. Copia tu key (empieza con CAP-){' '}
              4. Recarga saldo ($1 alcanza para ~600 captchas)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
