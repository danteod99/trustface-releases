import React, { useState } from 'react';

export default function LoginScreen({ onLogin, onSwitchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0=hidden, 1=enter email, 2=enter new password, 3=done
  const [resetLoading, setResetLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const translateError = (msg) => {
    if (!msg) return 'Error desconocido. Intenta de nuevo.';
    const lower = msg.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('rate_limit')) return 'Demasiados intentos. Espera 1-2 minutos antes de intentar de nuevo.';
    if (lower.includes('invalid login') || lower.includes('invalid_credentials')) return 'Correo o contrasena incorrectos.';
    if (lower.includes('email not confirmed')) return 'Tu correo no esta verificado. Revisa tu bandeja de entrada.';
    if (lower.includes('user not found')) return 'No existe una cuenta con este correo.';
    if (lower.includes('network') || lower.includes('fetch')) return 'Error de conexion. Verifica tu internet.';
    if (lower.includes('too many requests')) return 'Demasiadas solicitudes. Espera unos minutos.';
    return msg;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Por favor completa todos los campos.');
      return;
    }

    setLoading(true);
    try {
      const result = await window.api.login(email, password);
      if (result.error) {
        setError(translateError(result.error));
      } else {
        onLogin(result.user, result.tier);
      }
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-trust-dark flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-trust-accent mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">TrustFace</h1>
          <p className="text-trust-muted mt-1 text-sm">Gestion inteligente de cuentas</p>
        </div>

        {/* Card */}
        <div className="bg-[#2a2830] rounded-2xl p-8 shadow-trust-lg border border-[#3a3840]">
          <h2 className="text-xl font-semibold text-white mb-6">Iniciar Sesion</h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-trust-red/10 border border-trust-red/30 text-trust-red text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Correo electronico
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                className="w-full px-4 py-2.5 rounded-lg bg-[#1f1d24] border border-[#3a3840] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-trust-accent focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Contrasena
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 rounded-lg bg-[#1f1d24] border border-[#3a3840] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-trust-accent focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-trust-accent hover:bg-trust-accent-hover text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ingresando...
                </>
              ) : (
                'Iniciar Sesion'
              )}
            </button>
          </form>

          {/* Forgot password */}
          <div className="mt-4">
            {resetStep === 0 && (
              <div className="text-center">
                <button
                  onClick={() => { setResetStep(1); setResetEmail(email); setError(''); }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Olvide mi contrasena
                </button>
              </div>
            )}

            {resetStep === 1 && (
              <div className="bg-[#1f1d24] rounded-lg p-4 border border-[#3a3840]">
                <p className="text-sm text-white font-medium mb-3">Restablecer contrasena</p>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  className="w-full px-3 py-2 rounded-lg bg-[#2a2830] border border-[#3a3840] text-white text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-trust-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setError('');
                      if (!resetEmail) { setError('Ingresa tu correo.'); return; }
                      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resetEmail)) { setError('Ingresa un correo valido (ej: tu@gmail.com)'); return; }
                      setResetLoading(true);
                      try {
                        const result = await window.api.resetPassword(resetEmail);
                        if (result.error) setError(result.error);
                        else setResetStep(2);
                      } catch (err) { setError(err.message); }
                      setResetLoading(false);
                    }}
                    disabled={resetLoading}
                    className="flex-1 py-2 bg-trust-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {resetLoading ? 'Verificando...' : 'Continuar'}
                  </button>
                  <button onClick={() => { setResetStep(0); setError(''); }} className="px-3 py-2 text-gray-400 text-sm hover:text-white">Cancelar</button>
                </div>
              </div>
            )}

            {resetStep === 2 && (
              <div className="bg-[#1f1d24] rounded-lg p-4 border border-[#3a3840]">
                <p className="text-sm text-white font-medium mb-1">Nueva contrasena para</p>
                <p className="text-xs text-gray-400 mb-3">{resetEmail}</p>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nueva contrasena"
                  className="w-full px-3 py-2 rounded-lg bg-[#2a2830] border border-[#3a3840] text-white text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-trust-accent"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmar contrasena"
                  className="w-full px-3 py-2 rounded-lg bg-[#2a2830] border border-[#3a3840] text-white text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-trust-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setError('');
                      if (!newPassword || newPassword.length < 6) { setError('La contrasena debe tener al menos 6 caracteres.'); return; }
                      if (newPassword !== confirmPassword) { setError('Las contrasenas no coinciden.'); return; }
                      setResetLoading(true);
                      try {
                        const result = await window.api.resetPassword(resetEmail, newPassword);
                        if (result.error) setError(result.error);
                        else setResetStep(3);
                      } catch (err) { setError(err.message); }
                      setResetLoading(false);
                    }}
                    disabled={resetLoading}
                    className="flex-1 py-2 bg-trust-accent text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {resetLoading ? 'Cambiando...' : 'Cambiar contrasena'}
                  </button>
                  <button onClick={() => { setResetStep(1); setError(''); }} className="px-3 py-2 text-gray-400 text-sm hover:text-white">Atras</button>
                </div>
              </div>
            )}

            {resetStep === 3 && (
              <div className="bg-[#1f1d24] rounded-lg p-4 border border-green-500/30 text-center">
                <p className="text-sm text-green-400 mb-2">Contrasena cambiada exitosamente</p>
                <button
                  onClick={() => { setResetStep(0); setEmail(resetEmail); setError(''); }}
                  className="text-sm text-trust-accent hover:text-white transition-colors"
                >
                  Iniciar sesion ahora
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Switch to register */}
        <p className="text-center mt-6 text-sm text-gray-400">
          No tienes cuenta?{' '}
          <button
            onClick={onSwitchToRegister}
            className="text-trust-accent-light hover:text-white font-medium transition-colors"
          >
            Crear una
          </button>
        </p>
      </div>
    </div>
  );
}
