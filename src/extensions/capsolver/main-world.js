// Main-world content script (manifest: "world": "MAIN").
// Corre en el CONTEXTO DE LA PÁGINA (no en el mundo aislado del content script),
// así que SÍ puede acceder a window.___grecaptcha_cfg / grecaptcha. El browser lo
// inyecta directamente, por lo que NO está sujeto al CSP script-src de la página
// (a diferencia de un <script> inline, que Google/Facebook bloquean).
//
// Escucha el evento que dispara content.js cuando ya inyectó el token en la
// textarea, y llama al callback real de reCAPTCHA para que la página avance.
(function () {
  'use strict';

  function collectCallbacks(cfg) {
    var found = [];
    if (!cfg || !cfg.clients) return found;
    Object.values(cfg.clients).forEach(function (client) {
      var stack = [client];
      var seen = new Set();
      while (stack.length) {
        var o = stack.pop();
        if (!o || typeof o !== 'object' || seen.has(o)) continue;
        seen.add(o);
        for (var k in o) {
          try {
            var v = o[k];
            if (typeof v === 'function' && /callback/i.test(k)) found.push(v);
            else if (v && typeof v === 'object') stack.push(v);
          } catch (e) { /* getters que lanzan */ }
        }
      }
    });
    return found;
  }

  function fireRecaptcha() {
    try {
      var t = document.getElementById('g-recaptcha-response') ||
              document.querySelector('textarea[name="g-recaptcha-response"]');
      var token = t ? t.value : '';
      if (!token || token.length < 20) return;

      // 1) callbacks registrados en la config (estándar + enterprise)
      collectCallbacks(window.___grecaptcha_cfg).forEach(function (cb) {
        try { cb(token); } catch (e) {}
      });

      // 2) atributo data-callback (nombre de función global)
      var el = document.querySelector('.g-recaptcha[data-callback], [data-callback]');
      if (el) {
        var name = el.getAttribute('data-callback');
        if (name && typeof window[name] === 'function') {
          try { window[name](token); } catch (e) {}
        }
      }
      console.log('[CapSolver/main] callback de reCAPTCHA disparado');
    } catch (e) {
      console.log('[CapSolver/main] error:', e && e.message);
    }
  }

  function fireFuncaptcha() {
    try {
      var token = document.documentElement.dataset.capsolverFcToken || '';
      if (!token) return;
      // Callback de Arkose Labs (FunCaptcha), disponible solo en el contexto de página
      var cb = (window.ArkoseEnforcement && window.ArkoseEnforcement.setup && window.ArkoseEnforcement.setup.onCompleted)
        || (window.fc && window.fc.callback)
        || null;
      if (cb) { try { cb({ token: token }); } catch (e) {} }
      // Algunos flujos exponen un onCompleted en el objeto de enforcement activo
      if (window.ArkoseEnforcement && typeof window.ArkoseEnforcement.run === 'function') {
        try { window.ArkoseEnforcement.setup && window.ArkoseEnforcement.setup.onCompleted && window.ArkoseEnforcement.setup.onCompleted({ token: token }); } catch (e) {}
      }
      console.log('[CapSolver/main] callback de FunCaptcha disparado');
    } catch (e) {
      console.log('[CapSolver/main] error FunCaptcha:', e && e.message);
    }
  }

  window.addEventListener('__capsolver_recaptcha_solved', fireRecaptcha);
  window.addEventListener('__capsolver_funcaptcha_solved', fireFuncaptcha);
})();
