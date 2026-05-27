import React from 'react';

export default function InsufficientBalanceModal({ currentBalance, needed, onClose }) {
  const handleRecharge = () => {
    window.api.openExternal?.('https://www.trustmind.online/smm/funds');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-trust-dark border-2 border-red-500/40 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-white text-center mb-2">Saldo insuficiente</h2>
        <p className="text-white/60 text-sm text-center mb-6">
          Tus automatizaciones se pausaron porque te quedaste sin saldo.
        </p>

        {/* Balance breakdown */}
        <div className="bg-black/40 border border-white/10 rounded-xl p-4 mb-6 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Saldo actual</span>
            <span className="font-mono font-bold text-red-400">${Number(currentBalance || 0).toFixed(4)}</span>
          </div>
          {needed != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/50">Necesario</span>
              <span className="font-mono font-bold text-yellow-400">${Number(needed).toFixed(4)}</span>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={handleRecharge}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-500/30 mb-3"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          Recargar saldo en trustmind.online
        </button>

        <button
          onClick={onClose}
          className="w-full py-2 text-white/40 hover:text-white text-xs transition-colors"
        >
          Cerrar (las automatizaciones siguen pausadas)
        </button>

        {/* Helper text */}
        <p className="text-[10px] text-white/30 text-center mt-4 leading-relaxed">
          Cada acción descuenta una pequeña cantidad de tu saldo. Recarga cuando quieras seguir operando.
        </p>
      </div>
    </div>
  );
}
