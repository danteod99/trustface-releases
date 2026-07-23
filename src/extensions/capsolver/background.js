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

// Load API key + provider from storage
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
    throw new Error('CapSolver API key not configured');
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

function buildTask(type, websiteURL, websiteKey, subdomain) {
  switch (type) {
    case 'funcaptcha':
      return {
        type: 'FunCaptchaTaskProxyLess',
        websiteURL,
        websitePublicKey: websiteKey,
        funcaptchaApiJSSubdomain: subdomain || '',
      };
    case 'recaptchav2':
      return {
        type: 'ReCaptchaV2TaskProxyLess',
        websiteURL,
        websiteKey,
      };
    case 'recaptchav3':
      return {
        type: 'ReCaptchaV3TaskProxyLess',
        websiteURL,
        websiteKey,
        pageAction: 'verify',
      };
    case 'hcaptcha':
      return {
        type: 'HCaptchaTaskProxyLess',
        websiteURL,
        websiteKey,
      };
    default:
      return {
        type: 'FunCaptchaTaskProxyLess',
        websiteURL,
        websitePublicKey: websiteKey,
      };
  }
}
