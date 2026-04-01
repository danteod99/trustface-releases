import React, { useState, useEffect } from 'react';

export default function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    window.api.onUpdateAvailable?.((info) => setUpdateInfo(info));
    window.api.onUpdateDownloadProgress?.((p) => setProgress(Math.round(p.percent)));
    window.api.onUpdateDownloaded?.(() => setDownloaded(true));
  }, []);

  if (dismissed || !updateInfo) return null;

  return (
    <div className="mb-4 p-3 rounded-xl border border-trust-accent/30 bg-trust-accent/5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-trust-accent text-lg">⬆</span>
        <div>
          <p className="text-sm font-medium text-white">Nueva version disponible: v{updateInfo.version}</p>
          {downloading && !downloaded && <div className="w-48 h-1.5 bg-white/10 rounded-full mt-1"><div className="h-full bg-trust-accent rounded-full transition-all" style={{width: `${progress}%`}}/></div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {downloaded ? (
          <button onClick={() => window.api.installUpdate()} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Reiniciar</button>
        ) : downloading ? (
          <span className="text-xs text-white/50">{progress}%</span>
        ) : (
          <button onClick={() => { setDownloading(true); window.api.downloadUpdate(); }} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">Descargar</button>
        )}
        <button onClick={() => setDismissed(true)} className="text-white/30 hover:text-white text-xs">✕</button>
      </div>
    </div>
  );
}
