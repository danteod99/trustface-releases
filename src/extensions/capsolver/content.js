// CapSolver Content Script — Auto-detects and solves CAPTCHAs
(function () {
  'use strict';

  let solving = false;

  // Instagram uses FunCaptcha (Arkose Labs)
  // Also detect reCAPTCHA and hCaptcha for other sites
  const CAPTCHA_CHECKS = [
    {
      type: 'funcaptcha',
      detect: () => {
        // Arkose Labs / FunCaptcha iframe
        const iframe = document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], iframe[data-e2e="enforcement-frame"]');
        if (iframe) {
          const src = iframe.src || '';
          const keyMatch = src.match(/[?&]pk=([^&]+)/);
          return {
            found: true,
            websiteKey: keyMatch ? keyMatch[1] : '',
            subdomain: src.includes('instagram') ? 'instagram-api.arkoselabs.com' : '',
          };
        }
        // Also check for the FunCaptcha container div
        const container = document.querySelector('#captcha-container, #captcha_challenge, [data-testid="captcha"]');
        if (container) {
          return { found: true, websiteKey: '', subdomain: '' };
        }
        return { found: false };
      },
    },
    {
      type: 'recaptchav2',
      detect: () => {
        const iframe = document.querySelector('iframe[src*="recaptcha/api2"], iframe[src*="recaptcha/enterprise"]');
        if (iframe) {
          const sitekey = document.querySelector('.g-recaptcha')?.getAttribute('data-sitekey') || '';
          return { found: true, websiteKey: sitekey };
        }
        return { found: false };
      },
    },
    {
      type: 'hcaptcha',
      detect: () => {
        const iframe = document.querySelector('iframe[src*="hcaptcha.com"]');
        if (iframe) {
          const sitekey = document.querySelector('.h-captcha')?.getAttribute('data-sitekey') || '';
          return { found: true, websiteKey: sitekey };
        }
        return { found: false };
      },
    },
  ];

  function checkForCaptcha() {
    if (solving) return;

    for (const check of CAPTCHA_CHECKS) {
      const result = check.detect();
      if (result.found) {
        console.log(`[CapSolver] Detected ${check.type} CAPTCHA`);
        solving = true;
        requestSolution(check.type, result);
        return;
      }
    }
  }

  async function requestSolution(type, data) {
    try {
      console.log(`[CapSolver] Requesting solution for ${type}...`);

      const response = await chrome.runtime.sendMessage({
        type: 'SOLVE_CAPTCHA',
        data: {
          type,
          websiteURL: window.location.href,
          websiteKey: data.websiteKey || '',
          funcaptchaSubdomain: data.subdomain || '',
        },
      });

      if (response && response.success && response.result) {
        console.log(`[CapSolver] Got solution, injecting...`);
        injectSolution(type, response.result);
        // Éxito: cooldown largo. Si la página no avanzó, re-resolver enseguida solo
        // gasta créditos (cada solve cuesta dinero). Damos tiempo a que procese.
        setTimeout(() => { solving = false; }, 90000);
        return;
      }
      console.log(`[CapSolver] Failed: ${response?.error || 'Unknown error'}`);
      // Falla: reintentar más pronto
      setTimeout(() => { solving = false; }, 10000);
    } catch (err) {
      console.log(`[CapSolver] Error: ${err.message}`);
      setTimeout(() => { solving = false; }, 10000);
    }
  }

  // Inyecta el token de reCAPTCHA en la textarea (esto SÍ se puede desde el mundo
  // aislado: es escritura al DOM compartido, sin CSP) y luego avisa al script del
  // MUNDO PRINCIPAL (main-world.js) para que dispare el callback real de reCAPTCHA.
  function injectRecaptchaInPage(token) {
    document.querySelectorAll('#g-recaptcha-response, textarea[name="g-recaptcha-response"]').forEach(function (t) {
      t.value = token;
      t.dispatchEvent(new Event('input', { bubbles: true }));
      t.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // El main-world lee el token de la textarea y dispara el callback en el
    // contexto de la página (donde vive window.___grecaptcha_cfg).
    window.dispatchEvent(new CustomEvent('__capsolver_recaptcha_solved'));
  }

  function injectSolution(type, solution) {
    try {
      if (type === 'funcaptcha' && solution.token) {
        const token = solution.token;
        // Operaciones de DOM (funcionan desde el mundo aislado):
        // input oculto + postMessage al iframe de Arkose.
        const hiddenInput = document.querySelector('input[name="fc-token"], input[name="verification_code"]');
        if (hiddenInput) {
          hiddenInput.value = token;
          hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const iframe = document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"]');
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(
            JSON.stringify({ eventId: 'challenge-complete', payload: { sessionToken: token } }),
            '*'
          );
        }
        // El callback de Arkose (window.ArkoseEnforcement / window.fc) vive en el
        // contexto de la PÁGINA, no en el mundo aislado. Guardamos el token en el
        // DOM y avisamos al main-world para que lo dispare allí.
        document.documentElement.dataset.capsolverFcToken = token;
        window.dispatchEvent(new CustomEvent('__capsolver_funcaptcha_solved'));
        console.log('[CapSolver] FunCaptcha token inyectado + callback disparado');
      } else if (type === 'recaptchav2' && (solution.gRecaptchaResponse || solution.token)) {
        // El token puede venir como gRecaptchaResponse (CapSolver) o token (OmoCaptcha)
        const responseToken = solution.gRecaptchaResponse || solution.token;
        // Inyecta el token Y dispara el callback en el contexto de la página
        // (antes solo llenaba la textarea desde el mundo aislado → no avanzaba).
        injectRecaptchaInPage(responseToken);
        console.log('[CapSolver] reCAPTCHA solution injected + callback disparado');
      } else if (type === 'hcaptcha' && (solution.gRecaptchaResponse || solution.token)) {
        const responseToken = solution.gRecaptchaResponse || solution.token;
        const textarea = document.querySelector('[name="h-captcha-response"], textarea[name="g-recaptcha-response"]');
        if (textarea) textarea.value = responseToken;
        console.log('[CapSolver] hCaptcha solution injected');
      }
    } catch (err) {
      console.log(`[CapSolver] Injection error: ${err.message}`);
    }
  }

  // Check periodically for CAPTCHAs
  const observer = new MutationObserver(() => {
    checkForCaptcha();
  });

  // Start observing once DOM is ready
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Also check on an interval as fallback
  setInterval(checkForCaptcha, 3000);
})();
