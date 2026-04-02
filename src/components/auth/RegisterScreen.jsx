import React, { useState } from 'react';

export default function RegisterScreen({ onSwitchToLogin, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const validate = () => {
    if (!email || !password || !confirmPassword) {
      setError('Por favor completa todos los campos.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Ingresa un correo electronico valido.');
      return false;
    }
    if (password.length < 6) {
      setError('La contrasena debe tener al menos 6 caracteres.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return false;
    }
    return true;
  };

  const translateError = (msg) => {
    if (!msg) return 'Error desconocido. Intenta de nuevo.';
    const lower = msg.toLowerCase();
    if (lower.includes('rate limit') || lower.includes('rate_limit')) return 'Demasiados intentos. Espera 1-2 minutos antes de intentar de nuevo.';
    if (lower.includes('already registered') || lower.includes('already been registered')) return 'Este correo ya tiene una cuenta. Intenta iniciar sesion.';
    if (lower.includes('password') && lower.includes('short')) return 'La contrasena es muy corta. Usa al menos 6 caracteres.';
    if (lower.includes('valid email') || lower.includes('invalid email')) return 'Ingresa un correo electronico valido.';
    if (lower.includes('network') || lower.includes('fetch')) return 'Error de conexion. Verifica tu internet.';
    if (lower.includes('too many requests')) return 'Demasiadas solicitudes. Espera unos minutos.';
    if (lower.includes('signup is disabled')) return 'El registro esta desactivado temporalmente.';
    return msg;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setLoading(true);
    try {
      const result = await window.api.register(email, password);
      if (result.error) {
        setError(translateError(result.error));
      } else if (result.autoLogin && result.user && onLogin) {
        onLogin(result.user, result.tier);
      } else {
        setSuccess(true);
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
          <p className="text-trust-muted mt-1 text-sm">Crea tu cuenta</p>
        </div>

        {/* Card */}
        <div className="bg-[#2a2830] rounded-2xl p-8 shadow-trust-lg border border-[#3a3840]">
          {success ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-trust-green/20 mb-4">
                <svg className="w-7 h-7 text-trust-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Cuenta creada</h3>
              <p className="text-gray-400 text-sm mb-6">
                Revisa tu correo para verificar tu cuenta. Puede tardar unos minutos.
              </p>
              <button
                onClick={onSwitchToLogin}
                className="text-trust-accent-light hover:text-white font-medium text-sm transition-colors"
              >
                Volver a Iniciar Sesion
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-white mb-6">Crear Cuenta</h2>

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
                    placeholder="Minimo 6 caracteres"
                    className="w-full px-4 py-2.5 rounded-lg bg-[#1f1d24] border border-[#3a3840] text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-trust-accent focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    Confirmar contrasena
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu contrasena"
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
                      Creando cuenta...
                    </>
                  ) : (
                    'Crear Cuenta'
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-[#3a3840]" />
                <span className="text-xs text-gray-500">o continua con</span>
                <div className="flex-1 h-px bg-[#3a3840]" />
              </div>

              {/* Google button */}
              <button
                onClick={async () => {
                  setGoogleLoading(true);
                  setError('');
                  try {
                    const result = await window.api.loginWithGoogle();
                    if (result.error) {
                      if (result.error !== 'Login cancelado') setError(result.error);
                    } else if (onLogin) {
                      onLogin(result.user, result.tier);
                    }
                  } catch (err) {
                    setError(err.message);
                  } finally {
                    setGoogleLoading(false);
                  }
                }}
                disabled={googleLoading}
                className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-gray-100 text-gray-800 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-3 border border-[#3a3840]"
              >
                {googleLoading ? (
                  <svg className="animate-spin h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                {googleLoading ? 'Conectando...' : 'Registrarse con Google'}
              </button>
            </>
          )}
        </div>

        {/* Switch to login */}
        {!success && (
          <p className="text-center mt-6 text-sm text-gray-400">
            Ya tienes cuenta?{' '}
            <button
              onClick={onSwitchToLogin}
              className="text-trust-accent-light hover:text-white font-medium transition-colors"
            >
              Iniciar Sesion
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
