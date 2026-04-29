import React, { useState, useEffect } from 'react';

export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    window.api.onUpdateAvailable?.((info) => setUpdateInfo(info));
    window.api.onUpdateDownloadProgress?.((p) => setProgress(Math.round(p.percent)));
    window.api.onUpdateDownloaded?.(() => { setDownloaded(true); setDownloading(false); });
    // Listen for updater errors
    const errorHandler = (_, data) => {
      setError(data?.error || 'Error desconocido');
      setDownloading(false);
    };
    if (window.api.onUpdaterError) {
      window.api.onUpdaterError(errorHandler);
    }
  }, []);

  if (dismissed || !updateInfo) return null;

  const handleInstall = () => {
    setInstalling(true);
    window.api.installUpdate();
    // If after 10 seconds the app hasn't closed, show a message
    setTimeout(() => {
      setInstalling(false);
      setError('La app no se pudo reiniciar. Cierra manualmente y abre de nuevo.');
    }, 10000);
  };

  return (
    <div className="mb-4 p-3 rounded-xl border border-trust-accent/30 bg-trust-accent/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-trust-accent text-lg">⬆</span>
          <div>
            <p className="text-sm font-medium text-white">Nueva version disponible: v{updateInfo.version}</p>
            {downloading && !downloaded && (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-48 h-1.5 bg-white/10 rounded-full">
                  <div className="h-full bg-trust-accent rounded-full transition-all" style={{width: `${progress}%`}}/>
                </div>
                <span className="text-[10px] text-white/50">{progress}%</span>
              </div>
            )}
            {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {downloaded ? (
            <button onClick={handleInstall} disabled={installing}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
              {installing ? 'Instalando...' : 'Reiniciar e instalar'}
            </button>
          ) : downloading ? (
            <span className="text-xs text-white/50">Descargando...</span>
          ) : (
            <button onClick={() => { setDownloading(true); setError(null); window.api.downloadUpdate(); }}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
              Descargar
            </button>
          )}
          <button onClick={() => setDismissed(true)} className="text-white/30 hover:text-white text-xs">✕</button>
        </div>
      </div>
    </div>
  );
}
