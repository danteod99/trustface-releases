// CapSolver Background Service Worker
// Reads API key from config.js and handles CAPTCHA solving requests

let CAPSOLVER_API_KEY = '';

// Load API key from storage
chrome.storage.local.get(['capsolverApiKey'], (result) => {
  if (result.capsolverApiKey) {
    CAPSOLVER_API_KEY = result.capsolverApiKey;
    console.log('[CapSolver] API key loaded');
  }
});

// Listen for API key updates
chrome.storage.onChanged.addListener((changes) => {
  if (changes.capsolverApiKey) {
    CAPSOLVER_API_KEY = changes.capsolverApiKey.newValue || '';
    console.log('[CapSolver] API key updated');
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
  const createResponse = await fetch('https://api.capsolver.com/createTask', {
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

    const resultResponse = await fetch('https://api.capsolver.com/getTaskResult', {
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
