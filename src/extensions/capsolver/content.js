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
      } else {
        console.log(`[CapSolver] Failed: ${response?.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.log(`[CapSolver] Error: ${err.message}`);
    } finally {
      // Allow retrying after a delay
      setTimeout(() => { solving = false; }, 10000);
    }
  }

  function injectSolution(type, solution) {
    try {
      if (type === 'funcaptcha' && solution.token) {
        // Inject FunCaptcha token
        const callback = window.ArkoseEnforcement?.setup?.onCompleted
          || window.fc?.callback
          || null;

        if (callback) {
          callback({ token: solution.token });
          console.log('[CapSolver] FunCaptcha token injected via callback');
        } else {
          // Try to set the hidden input
          const hiddenInput = document.querySelector('input[name="fc-token"], input[name="verification_code"]');
          if (hiddenInput) {
            hiddenInput.value = solution.token;
            hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('[CapSolver] FunCaptcha token set in hidden input');
          }

          // Also try posting message to iframe
          const iframe = document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"]');
          if (iframe) {
            iframe.contentWindow.postMessage(
              JSON.stringify({ eventId: 'challenge-complete', payload: { sessionToken: solution.token } }),
              '*'
            );
            console.log('[CapSolver] FunCaptcha token posted to iframe');
          }
        }
      } else if (type === 'recaptchav2' && solution.gRecaptchaResponse) {
        // Inject reCAPTCHA response
        const textarea = document.querySelector('#g-recaptcha-response, textarea[name="g-recaptcha-response"]');
        if (textarea) {
          textarea.value = solution.gRecaptchaResponse;
          textarea.style.display = 'block';
        }
        // Call the callback
        if (window.___grecaptcha_cfg?.clients) {
          Object.values(window.___grecaptcha_cfg.clients).forEach((client) => {
            const cb = Object.values(client).find((v) => v?.callback)?.callback;
            if (cb) cb(solution.gRecaptchaResponse);
          });
        }
        console.log('[CapSolver] reCAPTCHA solution injected');
      } else if (type === 'hcaptcha' && solution.gRecaptchaResponse) {
        const textarea = document.querySelector('[name="h-captcha-response"], textarea[name="g-recaptcha-response"]');
        if (textarea) textarea.value = solution.gRecaptchaResponse;
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
