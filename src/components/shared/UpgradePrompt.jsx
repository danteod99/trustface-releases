import React, { useState } from 'react';

const featureDescriptions = {
  scraper: 'El Scraper avanzado te permite extraer seguidores, emails y datos de cualquier perfil sin limites.',
  automations: 'Las Automatizaciones Pro incluyen secuencias ilimitadas, delays personalizados y acciones en cadena.',
  scheduler: 'El Programador Pro permite programar publicaciones ilimitadas con calendario visual y mejores horarios.',
  shadowban: 'El detector de Shadowban Pro analiza multiples cuentas simultaneamente con reportes detallados.',
  restrictions: 'El detector de Restricciones Pro analiza Marketplace, Grupos y Mensajes simultaneamente.',
  warmup: 'El Warmup Pro incluye patrones avanzados de calentamiento y simulacion de actividad humana realista.',
  proxy: 'La gestion de Proxies Pro soporta rotacion automatica, pruebas de velocidad y asignacion inteligente.',
  followers: 'El analisis de Seguidores Pro incluye graficas de crecimiento, deteccion de bots y exportacion de datos.',
  default: 'Esta funcionalidad avanzada esta disponible exclusivamente para usuarios Pro.',
};

export default function UpgradePrompt({ feature, onUpgrade, onClose }) {
  const [dismissed, setDismissed] = useState(false);
  const description = featureDescriptions[feature] || featureDescriptions.default;

  const handleClose = () => {
    setDismissed(true);
    if (onClose) onClose();
  };

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#2a2830] rounded-2xl p-8 shadow-trust-lg border border-[#3a3840] text-center">
        {/* Lock icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-trust-yellow/15 mb-5">
          <svg className="w-7 h-7 text-trust-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h3 className="text-lg font-bold text-white mb-2">Funcion Pro</h3>
        <p className="text-gray-400 text-sm leading-relaxed mb-6">
          {description}
        </p>

        <button
          onClick={onUpgrade}
          className="w-full py-2.5 px-4 rounded-lg bg-trust-accent hover:bg-trust-accent-hover text-white font-medium transition-colors mb-3"
        >
          Actualizar a Pro
        </button>

        <button
          onClick={handleClose}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
