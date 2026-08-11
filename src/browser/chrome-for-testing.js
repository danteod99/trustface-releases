// Chrome for Testing — descarga y gestiona el navegador oficial de Google
// para automatización. A diferencia del Chrome del sistema (que desde v137
// bloquea --load-extension), Chrome for Testing SÍ permite cargar la extensión
// CapSolver, que es lo que resuelve los captchas.
//
// Se descarga una sola vez (~150 MB) a userData/chrome-for-testing y se reutiliza.

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const {
  install,
  resolveBuildId,
  detectBrowserPlatform,
  computeExecutablePath,
  getInstalledBrowsers,
  Browser,
} = require('@puppeteer/browsers');

function cacheDir() {
  return path.join(app.getPath('userData'), 'chrome-for-testing');
}

// Devuelve la ruta al ejecutable de Chrome for Testing ya instalado, o null.
async function getInstalledPath() {
  try {
    const dir = cacheDir();
    if (!fs.existsSync(dir)) return null;
    const installed = await getInstalledBrowsers({ cacheDir: dir });
    const chrome = installed.find((b) => b.browser === Browser.CHROME);
    if (chrome && fs.existsSync(chrome.executablePath)) {
      return chrome.executablePath;
    }
  } catch (err) {
    console.warn('[CfT] error buscando instalación:', err.message);
  }
  return null;
}

// Garantiza que Chrome for Testing esté instalado. Si no lo está, lo descarga
// reportando progreso (0-100) por onProgress. Devuelve la ruta al ejecutable.
async function ensureChromeForTesting(onProgress) {
  const existing = await getInstalledPath();
  if (existing) return existing;

  const dir = cacheDir();
  fs.mkdirSync(dir, { recursive: true });

  const platform = detectBrowserPlatform();
  if (!platform) throw new Error('Plataforma no soportada para Chrome for Testing');

  // "stable" = misma versión estable que Chrome normal, pero build de Testing
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  console.log(`[CfT] Instalando Chrome for Testing ${buildId} (${platform})...`);

  let lastPct = -1;
  const installed = await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir: dir,
    downloadProgressCallback: (downloaded, total) => {
      if (!total) return;
      const pct = Math.round((downloaded / total) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        if (typeof onProgress === 'function') onProgress(pct, downloaded, total);
      }
    },
  });

  console.log(`[CfT] Instalado en: ${installed.executablePath}`);
  return installed.executablePath;
}

module.exports = { getInstalledPath, ensureChromeForTesting, cacheDir };
