import React, { useState, useEffect } from 'react';

export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(null);
  const [openedManual, setOpenedManual] = useState(false);
  const isMac = (window.api?.platform || 'darwin') === 'darwin';

  useEffect(() => {
    window.api.onUpdateAvailable?.((info) => setUpdateInfo(info));
    window.api.onUpdateDownloadProgress?.((p) => setProgress(Math.round(p.percent)));
    window.api.onUpdateDownloaded?.(() => { setDownloaded(true); setDownloading(false); });
    window.api.onUpdaterError?.((data) => { setError(data?.error || 'Error desconocido'); setDownloading(false); });
  }, []);

  // Mostrar también errores aunque no haya updateInfo (sino el user no se entera)
  if (dismissed) return null;
  if (!updateInfo && !error) return null;
  if (!updateInfo && error) {
    return (
      <div className="mb-4 p-3 rounded-xl border border-yellow-500/30 bg-yellow-500/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-yellow-400 text-lg">⚠</span>
          <div>
            <p className="text-sm font-medium text-white">No se pudo verificar actualizaciones</p>
            <p className="text-[10px] text-yellow-400/80 mt-1">{error}</p>
          </div>
        </div>
        <button onClick={() => setDismissed(true)} className="text-white/30 hover:text-white text-xs">✕</button>
      </div>
    );
  }

  return (
    <div className="mb-4 p-3 rounded-xl border border-trust-accent/30 bg-trust-accent/5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-trust-accent text-lg">⬆</span>
        <div>
          <p className="text-sm font-medium text-white">Nueva version disponible: v{updateInfo.version}</p>
          {downloading && !downloaded && <div className="w-48 h-1.5 bg-white/10 rounded-full mt-1"><div className="h-full bg-trust-accent rounded-full transition-all" style={{width: `${progress}%`}}/></div>}
          {openedManual && <p className="text-[10px] text-white/60 mt-1">Se abrió la descarga en tu navegador. Cierra esta app, arrastra el nuevo DMG a Aplicaciones reemplazando el actual.</p>}
          {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {downloaded ? (
          <button onClick={() => window.api.installUpdate()} className="px-3 py-1.5 bg-trust-accent text-white rounded-lg text-xs font-medium hover:bg-trust-accent-hover">Reiniciar</button>
        ) : downloading ? (
          <span className="text-xs text-white/50">{progress}%</span>
        ) : (
          <button
            onClick={async () => {
              setError(null);
              if (isMac) {
                setOpenedManual(true);
                await window.api.openReleaseDownload?.();
              } else {
                setDownloading(true);
                window.api.downloadUpdate();
              }
            }}
            className="px-3 py-1.5 bg-trust-accent text-white rounded-lg text-xs font-medium hover:bg-trust-accent-hover">
            {isMac ? 'Abrir descarga' : 'Descargar'}
          </button>
        )}
        <button onClick={() => setDismissed(true)} className="text-white/30 hover:text-white text-xs">✕</button>
      </div>
    </div>
  );
}
