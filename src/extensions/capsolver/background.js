// CapSolver Background Service Worker
// Reads API key from config.js and handles CAPTCHA solving requests

let CAPSOLVER_API_KEY = '';
let CAPTCHA_PROVIDER = 'capsolver';

// URL base segun el proveedor elegido (ambos usan el mismo formato createTask/getTaskResult)
const PROVIDER_BASE = {
  capsolver: 'https://api.capsolver.com',
  omocaptcha: 'https://api.omocaptcha.com/v2',
};
function apiBase() {
  return PROVIDER_BASE[CAPTCHA_PROVIDER] || PROVIDER_BASE.capsolver;
}

// Cargar API key + proveedor desde config.json (lo escribe la app de escritorio
// antes de lanzar el navegador). ESTE es el metodo fiable: inyectar via
// chrome.storage desde la pagina web NO funciona (las paginas no tienen chrome.storage).
async function loadConfigFile() {
  try {
    const res = await fetch(chrome.runtime.getURL('config.json'));
    if (!res.ok) return false;
    const cfg = await res.json();
    if (cfg.apiKey) { CAPSOLVER_API_KEY = cfg.apiKey; console.log('[Captcha] API key cargada desde config.json'); }
    if (cfg.provider) { CAPTCHA_PROVIDER = cfg.provider; console.log('[Captcha] Proveedor:', CAPTCHA_PROVIDER); }
    return !!cfg.apiKey;
  } catch (err) {
    console.log('[Captcha] No se pudo leer config.json:', err.message);
    return false;
  }
}
// Se ejecuta cada vez que arranca el service worker (incluido al despertar en MV3).
loadConfigFile();

// Respaldo: tambien leer de chrome.storage por si algun flujo la escribe ahi.
chrome.storage.local.get(['capsolverApiKey', 'captchaProvider'], (result) => {
  if (result.capsolverApiKey) {
    CAPSOLVER_API_KEY = result.capsolverApiKey;
    console.log('[Captcha] API key loaded');
  }
  if (result.captchaProvider) {
    CAPTCHA_PROVIDER = result.captchaProvider;
    console.log('[Captcha] Provider:', CAPTCHA_PROVIDER);
  }
});

// Listen for API key / provider updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.capsolverApiKey) {
    CAPSOLVER_API_KEY = changes.capsolverApiKey.newValue || '';
    console.log('[Captcha] API key updated');
  }
  if (changes.captchaProvider) {
    CAPTCHA_PROVIDER = changes.captchaProvider.newValue || 'capsolver';
    console.log('[Captcha] Provider updated:', CAPTCHA_PROVIDER);
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SOLVE_CAPTCHA') {
    solveCaptcha(message.data)
      .then((result) => sendResponse({ success: true, result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'GET_API_KEY') {
    sendResponse({ apiKey: CAPSOLVER_API_KEY });
    return false;
  }
});

async function solveCaptcha(data) {
  if (!CAPSOLVER_API_KEY) {
    // El service worker pudo haber despertado sin la key en memoria → reintentar.
    await loadConfigFile();
  }
  if (!CAPSOLVER_API_KEY) {
    throw new Error('API key de captcha no configurada (revisa config.json)');
  }

  const { type, websiteURL, websiteKey, funcaptchaSubdomain } = data;

  // Create task
  const createResponse = await fetch(apiBase() + '/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: CAPSOLVER_API_KEY,
      task: buildTask(type, websiteURL, websiteKey, funcaptchaSubdomain),
    }),
  });

  const createResult = await createResponse.json();
  if (createResult.errorId !== 0) {
    throw new Error(createResult.errorDescription || 'Failed to create task');
  }

  const taskId = createResult.taskId;

  // If solution is already ready (some tasks return immediately)
  if (createResult.solution) {
    return createResult.solution;
  }

  // Poll for result
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const resultResponse = await fetch(apiBase() + '/getTaskResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientKey: CAPSOLVER_API_KEY,
        taskId,
      }),
    });

    const result = await resultResponse.json();

    if (result.status === 'ready') {
      return result.solution;
    }
    if (result.status === 'failed' || result.errorId !== 0) {
      throw new Error(result.errorDescription || 'Task failed');
    }
  }

  throw new Error('Timeout waiting for CAPTCHA solution');
}

// Nombres de tarea por proveedor. CapSolver y OmoCaptcha comparten el formato
// createTask/getTaskResult, PERO los "type" son distintos:
//   CapSolver:  ReCaptchaV2TaskProxyLess / FunCaptchaTaskProxyLess ...
//   OmoCaptcha: RecaptchaV2TokenTask / FuncaptchaTokenTask ...
// (verificado 2026-08-03: OmoCaptcha rechaza los nombres de CapSolver con
//  ERROR_TASK_NOT_SUPPORTED; acepta RecaptchaV2TokenTask).
const TASK_TYPES = {
  capsolver: {
    funcaptcha: 'FunCaptchaTaskProxyLess',
    recaptchav2: 'ReCaptchaV2TaskProxyLess',
    recaptchav3: 'ReCaptchaV3TaskProxyLess',
    hcaptcha: 'HCaptchaTaskProxyLess',
  },
  omocaptcha: {
    // Verificado 2026-08-03 contra la API real:
    //  ✅ reCAPTCHA v2/v3 → *TokenTask (compatibles con esta extensión)
    //  ⚠️ FunCaptcha (Instagram/Arkose): OmoCaptcha SOLO tiene FuncaptchaImageTask
    //     (basado en imagen, no token) → esta extensión NO puede resolverlo.
    //     Para Instagram usar CapSolver (soporta FunCaptcha token).
    //  ❌ hCaptcha: OmoCaptcha no expone una task token; se deja el nombre
    //     de CapSolver como fallback (fallará limpio si se intenta).
    funcaptcha: 'FuncaptchaImageTask',
    recaptchav2: 'RecaptchaV2TokenTask',
    recaptchav3: 'RecaptchaV3TokenTask',
    hcaptcha: 'HCaptchaTaskProxyLess',
  },
};

function buildTask(type, websiteURL, websiteKey, subdomain) {
  const provider = (typeof CAPTCHA_PROVIDER !== 'undefined' && CAPTCHA_PROVIDER) || 'capsolver';
  const map = TASK_TYPES[provider] || TASK_TYPES.capsolver;
  switch (type) {
    case 'funcaptcha':
      return {
        type: map.funcaptcha,
        websiteURL,
        websitePublicKey: websiteKey,
        funcaptchaApiJSSubdomain: subdomain || '',
      };
    case 'recaptchav2':
      return { type: map.recaptchav2, websiteURL, websiteKey };
    case 'recaptchav3':
      return { type: map.recaptchav3, websiteURL, websiteKey, pageAction: 'verify' };
    case 'hcaptcha':
      return { type: map.hcaptcha, websiteURL, websiteKey };
    default:
      return { type: map.funcaptcha, websiteURL, websitePublicKey: websiteKey };
  }
}
