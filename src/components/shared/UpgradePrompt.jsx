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

const WHATSAPP_PRO_URL = 'https://wa.me/51931119176?text=' + encodeURIComponent('Hola, quiero activar el plan Pro para usar todas las funciones.');

export default function UpgradePrompt({ feature, onUpgrade, onClose }) {
  const [dismissed, setDismissed] = useState(false);
  const description = featureDescriptions[feature] || featureDescriptions.default;

  const handleUpgrade = () => {
    window.api.openExternal?.(WHATSAPP_PRO_URL);
  };

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
        <p className="text-gray-400 text-sm leading-relaxed mb-2">
          {description}
        </p>
        <p className="text-gray-500 text-xs leading-relaxed mb-6">
          Escribenos por WhatsApp para activar tu plan Pro.
        </p>

        <button
          onClick={handleUpgrade}
          className="w-full py-2.5 px-4 rounded-lg bg-[#25D366] hover:bg-[#1ebe5b] text-white font-medium transition-colors mb-3 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.944c0 2.096.547 4.142 1.588 5.945L0 24l6.305-1.654a11.94 11.94 0 005.71 1.455h.005c6.585 0 11.946-5.36 11.949-11.945A11.86 11.86 0 0020.52 3.449"/>
          </svg>
          Hazte Pro por WhatsApp
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
