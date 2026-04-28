const { chromium } = require('playwright-core');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const { generateTOTP } = require('./totp');
const { generateFingerprint, getFingerprintScript } = require('./fingerprint');
const { fetchCodeWithRetries } = require('./email-code-fetcher');
const { getDb } = require('../db/database');

// Map of profileId -> { context, browser }
const activeBrowsers = new Map();

// CapSolver API key
let capsolverApiKey = '';

// ─── Grid Layout for Browser Windows ────────────────────────────────
// Mobile-sized windows arranged in a grid so multiple are visible at once
const BROWSER_WIDTH = 360;
const BROWSER_HEIGHT = 640;
// Chrome window chrome (title bar + borders) adds extra pixels around the viewport
const WINDOW_CHROME_WIDTH = 0;   // side borders are negligible on macOS
const WINDOW_CHROME_HEIGHT = 78; // title bar + tab bar overhead
const GRID_PADDING = 5;
const GRID_START_X = 230; // offset to avoid overlapping the Electron sidebar
const GRID_START_Y = 0;

function getNextGridPosition() {
  const count = activeBrowsers.size;
  // Calculate how many columns fit on screen (assume ~1440px wide screen)
  const screenWidth = 1440;
  const usableWidth = screenWidth - GRID_START_X;
  const winW = BROWSER_WIDTH + WINDOW_CHROME_WIDTH;
  const winH = BROWSER_HEIGHT + WINDOW_CHROME_HEIGHT;
  const cols = Math.max(1, Math.floor(usableWidth / (winW + GRID_PADDING)));
  const col = count % cols;
  const row = Math.floor(count / cols);
  return {
    x: GRID_START_X + col * (winW + GRID_PADDING),
    y: GRID_START_Y + row * (winH + GRID_PADDING),
  };
}

// Common user agents for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
];

function getProfileDir(profileId) {
  const profilesDir = path.join(app.getPath('userData'), 'browser-profiles', profileId);
  if (!fs.existsSync(profilesDir)) {
    fs.mkdirSync(profilesDir, { recursive: true });
  }
  return profilesDir;
}

function buildProxyUrl(profile) {
  if (!profile.proxy_host || !profile.proxy_port) return null;

  const type = profile.proxy_type || 'http';
  if (profile.proxy_user && profile.proxy_pass) {
    return `${type}://${profile.proxy_user}:${profile.proxy_pass}@${profile.proxy_host}:${profile.proxy_port}`;
  }
  return `${type}://${profile.proxy_host}:${profile.proxy_port}`;
}

// ─── Ban Detection Helper ──────────────────────────────────────────
const BAN_TEXT_INDICATORS = [
  'Inhabilitamos tu cuenta',
  'We disabled your account',
  'Your account has been disabled',
  'Tu cuenta ha sido inhabilitada',
  'Ya no tienes acceso',
];

const BAN_URL_PATTERNS = ['disabled', 'suspended', 'appeal'];

// ─── Email Verification Detection ────────────────────────────────────
const EMAIL_VERIFICATION_TEXTS = [
  'Revisa tu correo electrónico',
  'Check your email',
  'Ingresa el código que enviamos',
  'Enter the code we sent',
  'código de confirmación',
  'confirmation code',
  'Enviamos un código',
  'We sent a code',
  'Ingresa el código de 6 dígitos',
  'Enter the 6-digit code',
  'Ingresa el código de 8 dígitos',
  'Enter the 8-digit code',
  'Te enviamos un código',
  'We sent you a code',
  'Revisa tu email',
  'enviamos a tu correo',
  'sent to your email',
  'código de seguridad',
  'security code',
  'Introduce el código de confirmación',
  'Enter the confirmation code',
];

/**
 * Detecta si la página actual es de verificación por email (no TOTP)
 */
async function isEmailVerificationPage(page) {
  try {
    const url = page.url();
    const bodyText = await page.locator('body').textContent({ timeout: 3000 }).catch(() => '');
    const bodyLower = bodyText.toLowerCase();

    // Si la URL contiene 'two_factor' pero el texto pide código de email, es email verification
    // Si la URL contiene 'challenge' y pide un código, también es email verification
    const hasEmailText = EMAIL_VERIFICATION_TEXTS.some(text => bodyLower.includes(text.toLowerCase()));

    if (!hasEmailText) return false;

    // Asegurarse de que NO es la página TOTP normal (que pide código de app de autenticación)
    const totpTexts = [
      'authentication app',
      'aplicación de autenticación',
      'app de autenticación',
      'autenticador',
      'authenticator',
      'google authenticator',
    ];
    const isTotpPage = totpTexts.some(t => bodyLower.includes(t));

    // Si la página menciona app de autenticación, es TOTP, no email
    if (isTotpPage) {
      console.log(`[Email Verify] Página parece ser TOTP, no verificación por email`);
      return false;
    }

    console.log(`[Email Verify] Detectada página de verificación por email`);
    return true;
  } catch (err) {
    console.log(`[Email Verify] Error detectando página: ${err.message}`);
    return false;
  }
}

/**
 * Maneja la verificación por email: busca el código y lo llena automáticamente
 */
async function handleEmailVerification(page, profile) {
  console.log(`[Email Verify] === Iniciando verificación por email para ${profile.name} ===`);

  if (!profile.fb_email || !profile.fb_email_pass) {
    console.log(`[Email Verify] No hay credenciales de email para ${profile.name} — cerrando navegador`);
    if (loginFailCallback) loginFailCallback(profile.id, 'Verificacion por email requerida — sin credenciales de correo configuradas');
    await closeBrowser(profile.id);
    return;
  }

  console.log(`[Email Verify] Buscando código de verificación en ${profile.fb_email}...`);

  // Esperar un poco para que el email llegue
  await page.waitForTimeout(5000);

  // Intentar obtener el código con reintentos (hasta 60 segundos)
  const code = await fetchCodeWithRetries(profile, 6, 10000);

  if (!code) {
    console.log(`[Email Verify] ERROR: No se pudo obtener el código de verificación para ${profile.name} — cerrando navegador`);
    if (loginFailCallback) loginFailCallback(profile.id, 'Verificacion por email requerida — no se pudo obtener el codigo del correo');
    await closeBrowser(profile.id);
    return;
  }

  console.log(`[Email Verify] Código obtenido: ${code}, llenando formulario...`);

  try {
    // Buscar el input de código en la página
    let codeInput = null;
    const allInputs = await page.locator('input').all();
    console.log(`[Email Verify] Encontrados ${allInputs.length} input(s) en la página`);

    for (const input of allInputs) {
      try {
        if (await input.isVisible({ timeout: 500 })) {
          const type = await input.getAttribute('type').catch(() => '');
          const name = await input.getAttribute('name').catch(() => '');
          const placeholder = await input.getAttribute('placeholder').catch(() => '');

          if (type === 'hidden' || type === 'checkbox' || type === 'submit') continue;

          console.log(`[Email Verify] Input visible: type="${type}" name="${name}" placeholder="${placeholder}"`);
          codeInput = input;
          break;
        }
      } catch { /* skip */ }
    }

    if (!codeInput) {
      console.log(`[Email Verify] No se encontró input para el código`);
      return;
    }

    // Llenar el código
    await codeInput.click();
    await page.waitForTimeout(300);
    await codeInput.fill(code);
    await page.waitForTimeout(500);

    // Verificar que se llenó correctamente
    const val = await codeInput.inputValue().catch(() => '');
    console.log(`[Email Verify] Valor en input: "${val}"`);

    if (val !== code) {
      console.log(`[Email Verify] fill() no funcionó, intentando type()...`);
      await codeInput.click({ clickCount: 3 });
      await page.keyboard.type(code, { delay: 50 });
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(500);

    // Buscar y hacer clic en el botón de confirmar
    const allButtons = await page.locator('button').all();
    let clicked = false;

    for (const btn of allButtons) {
      try {
        if (await btn.isVisible({ timeout: 500 })) {
          const text = await btn.textContent().catch(() => '');
          if (text.match(/confirm|verificar|confirmar|verify|submit|enviar|siguiente|next|continuar|continue/i)) {
            await btn.click();
            clicked = true;
            console.log(`[Email Verify] Botón clickeado: "${text.trim()}"`);
            break;
          }
        }
      } catch { /* skip */ }
    }

    if (!clicked) {
      console.log(`[Email Verify] No se encontró botón de confirmar, presionando Enter`);
      await codeInput.press('Enter');
    }

    // Esperar resultado
    console.log(`[Email Verify] Esperando resultado...`);

    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const url = page.url();

      if (!url.includes('challenge') && !url.includes('two_factor') && !url.includes('accounts/login')) {
        console.log(`[Email Verify] ÉXITO! Redirigido a: ${url}`);

        // Cerrar popups post-login
        for (let a = 0; a < 3; a++) {
          await page.waitForTimeout(1500);
          for (const txt of ['Not Now', 'Ahora no']) {
            try {
              const b = page.locator(`button:has-text("${txt}"), div[role="button"]:has-text("${txt}")`).first();
              if (await b.isVisible({ timeout: 1500 })) { await b.click(); break; }
            } catch { /* next */ }
          }
        }

        if (loginSuccessCallback) loginSuccessCallback(profile.id);
        console.log(`[Email Verify] === ${profile.name} LOGGED IN via email code ===`);
        return;
      }
    }

    console.log(`[Email Verify] Aún en la página de verificación después de enviar el código`);
    console.log(`[Email Verify] Dejando navegador abierto para intervención manual`);

  } catch (err) {
    console.log(`[Email Verify] Error llenando código: ${err.message}`);
  }
}

async function checkForBanPage(page, profile) {
  try {
    const url = page.url();

    // Check URL patterns
    for (const pattern of BAN_URL_PATTERNS) {
      if (url.includes(pattern)) {
        console.log(`[Ban Detection] URL ban indicator found for ${profile.name}: ${url}`);
        return true;
      }
    }

    // Check page text content
    const bodyText = await page.locator('body').textContent({ timeout: 3000 }).catch(() => '');
    for (const text of BAN_TEXT_INDICATORS) {
      if (bodyText.includes(text)) {
        console.log(`[Ban Detection] Text ban indicator found for ${profile.name}: "${text}"`);
        return true;
      }
    }
  } catch (err) {
    console.log(`[Ban Detection] Error checking page: ${err.message}`);
  }
  return false;
}

async function handleBanDetected(profile, source) {
  console.log(`[Ban Detection] BANNED — ${profile.name} — detected via ${source} — closing browser`);
  if (loginFailCallback) {
    loginFailCallback(profile.id, 'Cuenta inhabilitada o suspendida');
  }
  await closeBrowser(profile.id);
}

function setupBanMonitor(context, profile) {
  // Monitor navigation on all existing pages
  const monitorPage = (page) => {
    page.on('framenavigated', async (frame) => {
      // Only check main frame navigations
      if (frame !== page.mainFrame()) return;
      try {
        // Small delay to let page content render
        await page.waitForTimeout(1500);
        if (!activeBrowsers.has(profile.id)) return; // already closed
        const isBanned = await checkForBanPage(page, profile);
        if (isBanned) {
          await handleBanDetected(profile, 'navigation-monitor');
        }
      } catch {
        // Page may have been closed
      }
    });
  };

  // Monitor existing pages
  for (const page of context.pages()) {
    monitorPage(page);
  }

  // Monitor new pages
  context.on('page', (page) => {
    monitorPage(page);
  });
}

function findChromiumPath() {
  const possiblePaths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    // Linux
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

// ─── Auto-dismiss Facebook Popups ──────────────────────────────────
async function dismissFacebookPopups(page) {
  try {
    const url = page.url();
    // Skip if on login or checkpoint pages (don't interfere with login flow)
    if (url.includes('/login') || url.includes('checkpoint')) return;

    // Phase 1: Try to close popups via page.evaluate (most reliable for FB's React DOM)
    for (let attempt = 0; attempt < 5; attempt++) {
      const closedSomething = await page.evaluate(() => {
        // Helper: click a button if it exists and is visible
        function clickIfVisible(el) {
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          el.click();
          return true;
        }

        // Strategy 1: Cookie consent banner — data-cookiebanner buttons
        const cookieAccept = document.querySelector('button[data-cookiebanner="accept_button"]') ||
                             document.querySelector('button[data-cookiebanner="accept_only_essential_button"]');
        if (clickIfVisible(cookieAccept)) return 'cookie-banner';

        // Strategy 2: Cookie consent — by title attribute
        const cookieTitles = ['Allow all cookies', 'Permitir todas las cookies', 'Allow essential and optional cookies',
                              'Permitir cookies esenciales y opcionales', 'Decline optional cookies', 'Rechazar cookies opcionales'];
        for (const title of cookieTitles) {
          const btn = document.querySelector(`button[title="${title}"]`);
          if (clickIfVisible(btn)) return `cookie-title: ${title}`;
        }

        // Strategy 3: Find dialogs and close them
        const dialogs = document.querySelectorAll('div[role="dialog"]');
        for (const dialog of dialogs) {
          const rect = dialog.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Look for close button (X) inside dialog — aria-label Close/Cerrar
          const closeLabels = ['Close', 'Cerrar', 'close', 'cerrar'];
          for (const label of closeLabels) {
            const closeBtn = dialog.querySelector(`[aria-label="${label}"]`);
            if (clickIfVisible(closeBtn)) return `dialog-close: ${label}`;
          }

          // Look for "Not Now" / "Ahora no" / "Skip" / "Omitir" buttons inside dialog
          const allBtns = dialog.querySelectorAll('button, div[role="button"], a[role="button"]');
          const dismissTexts = ['not now', 'ahora no', 'skip', 'omitir', 'later', 'después', 'despues',
                                'no thanks', 'no, gracias', 'decline', 'rechazar', 'cancel', 'cancelar',
                                'block', 'bloquear', 'deny', 'denegar'];
          for (const btn of allBtns) {
            const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
            if (text.length > 0 && text.length < 30 && dismissTexts.some(d => text.includes(d))) {
              if (clickIfVisible(btn)) return `dialog-dismiss: ${text}`;
            }
          }

          // Fallback: if dialog has exactly 2 buttons, click the secondary/dismiss one (usually the second)
          const dialogBtns = Array.from(allBtns).filter(b => {
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
          if (dialogBtns.length === 2) {
            // The dismiss button is usually less styled — try the second one first
            if (clickIfVisible(dialogBtns[1])) return 'dialog-secondary-btn';
          }
        }

        // Strategy 4: Global "Not Now" / dismiss buttons (not inside dialog)
        const allButtons = document.querySelectorAll('button, div[role="button"]');
        const globalDismissTexts = ['not now', 'ahora no', 'block', 'bloquear'];
        for (const btn of allButtons) {
          const text = (btn.innerText || '').trim().toLowerCase();
          if (text.length > 0 && text.length < 20 && globalDismissTexts.some(d => text === d)) {
            if (clickIfVisible(btn)) return `global-dismiss: ${text}`;
          }
        }

        // Strategy 5: Close button by SVG icon (X icon) inside overlays
        const overlays = document.querySelectorAll('div[data-visualcompletion="ignore-dynamic"], div[class*="overlay"]');
        for (const overlay of overlays) {
          const closeBtn = overlay.querySelector('[aria-label="Close"], [aria-label="Cerrar"]');
          if (clickIfVisible(closeBtn)) return 'overlay-close';
        }

        return false;
      }).catch(() => false);

      if (closedSomething) {
        console.log(`[FB Popups] Dismissed via evaluate: ${closedSomething}`);
        await page.waitForTimeout(1500);
      } else {
        break;
      }
    }

    // Phase 2: Playwright locator fallback for anything evaluate missed
    const fallbackSelectors = [
      'div[role="dialog"] [aria-label="Close"]',
      'div[role="dialog"] [aria-label="Cerrar"]',
      'button:has-text("Not Now")',
      'button:has-text("Ahora no")',
      'div[role="button"]:has-text("Not Now")',
      'div[role="button"]:has-text("Ahora no")',
    ];

    for (const sel of fallbackSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 500 })) {
          await btn.click();
          console.log(`[FB Popups] Dismissed via locator: ${sel}`);
          await page.waitForTimeout(1000);
        }
      } catch { /* not found */ }
    }

    // Phase 3: Press Escape as last resort to close any remaining modals
    try {
      const hasDialog = await page.evaluate(() => !!document.querySelector('div[role="dialog"]')).catch(() => false);
      if (hasDialog) {
        await page.keyboard.press('Escape');
        console.log('[FB Popups] Pressed Escape to close remaining dialog');
        await page.waitForTimeout(500);
      }
    } catch { /* ignore */ }

  } catch (err) {
    console.log(`[FB Popups] Error dismissing popups: ${err.message}`);
  }
}

async function launchBrowser(profile) {
  if (activeBrowsers.has(profile.id)) {
    throw new Error('Este perfil ya tiene un navegador abierto');
  }

  const executablePath = findChromiumPath();
  if (!executablePath) {
    throw new Error(
      'No se encontr\u00f3 Chrome/Chromium instalado. Instala Google Chrome para continuar.'
    );
  }

  const profileDir = getProfileDir(profile.id);

  // Persistent user-agent: use stored UA from profile, or pick a random one
  // and save it to the DB so subsequent launches use the same UA
  let userAgent = profile.user_agent;
  if (!userAgent) {
    userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    try {
      const db = getDb();
      db.prepare('UPDATE profiles SET user_agent = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .run(userAgent, profile.id);
      console.log(`[Browser] Assigned persistent user-agent to profile ${profile.name}`);
    } catch (err) {
      console.error(`[Browser] Failed to save user-agent to DB:`, err.message);
    }
  }

  // CapSolver extension path
  const capsolverPath = path.join(__dirname, 'extensions', 'capsolver');
  const hasCapsolverExt = fs.existsSync(path.join(capsolverPath, 'manifest.json'));

  const launchOptions = {
    executablePath,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${BROWSER_WIDTH},${BROWSER_HEIGHT}`,
      '--password-store=basic',
      '--disable-save-password-bubble',
      '--disable-notifications',
      '--deny-permission-prompts',
      ...(hasCapsolverExt ? [
        `--disable-extensions-except=${capsolverPath}`,
        `--load-extension=${capsolverPath}`,
      ] : []),
    ],
  };

  // Build proxy config
  const proxyUrl = buildProxyUrl(profile);
  if (proxyUrl) {
    launchOptions.proxy = { server: proxyUrl };
    if (profile.proxy_user && profile.proxy_pass) {
      launchOptions.proxy.username = profile.proxy_user;
      launchOptions.proxy.password = profile.proxy_pass;
    }
  }

  // Write Chrome preferences to disable password popups
  const prefsDir = path.join(profileDir, 'Default');
  if (!fs.existsSync(prefsDir)) fs.mkdirSync(prefsDir, { recursive: true });
  const prefsFile = path.join(prefsDir, 'Preferences');
  try {
    let prefs = {};
    if (fs.existsSync(prefsFile)) {
      prefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    }
    // Disable password manager and save prompts
    prefs.credentials_enable_service = false;
    prefs.credentials_enable_autosign_in = false;
    if (!prefs.profile) prefs.profile = {};
    prefs.profile.password_manager_enabled = false;
    if (!prefs.savefile) prefs.savefile = {};
    prefs.savefile.default_directory = '/tmp';
    fs.writeFileSync(prefsFile, JSON.stringify(prefs));
  } catch {
    // Ignore pref errors
  }

  // Write CapSolver API key to extension config file before launch
  // This ensures the service worker has the key immediately on startup
  if (hasCapsolverExt && capsolverApiKey) {
    try {
      const configFile = path.join(capsolverPath, 'config.json');
      fs.writeFileSync(configFile, JSON.stringify({ apiKey: capsolverApiKey }));
      console.log(`[CapSolver] API key written to extension config.json`);
    } catch {
      // Ignore write errors (e.g. read-only extension dir)
    }
  }

  // Launch persistent context (keeps cookies/session between runs)
  const context = await chromium.launchPersistentContext(profileDir, {
    ...launchOptions,
    userAgent,
    viewport: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
    locale: 'es-419',
    timezoneId: profile.timezone || 'America/Lima',
    colorScheme: 'dark',
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Generate unique fingerprint for this profile
  const fingerprint = generateFingerprint();
  fingerprint.timezone = profile.timezone || 'America/Lima';
  const fpScript = getFingerprintScript(fingerprint);

  // Apply anti-detection + fingerprint to all pages
  const pages = context.pages();
  for (const p of pages) {
    await p.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await p.addInitScript(fpScript);
  }

  context.on('page', async (p) => {
    await p.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await p.addInitScript(fpScript);
  });

  // Inject CapSolver API key into extension storage before and during browsing
  if (hasCapsolverExt && capsolverApiKey) {
    // Write API key to extension's Local Storage file in the profile directory
    // so it persists across all pages and browser restarts
    try {
      // Find the extension's storage directory in the profile
      // Chrome stores extension local storage in Local Storage/leveldb or
      // in the Extension State directory. We write a config.js file that
      // the extension can read, and also inject via chrome.storage on every page.
      const extLocalStorageDir = path.join(profileDir, 'Default', 'Local Extension Settings');

      // Also try to find the extension ID from the loaded extensions
      // For now, inject into every new page via context event
      const injectCapsolverKey = async (page) => {
        try {
          await page.evaluate((key) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
              chrome.storage.local.set({ capsolverApiKey: key });
            }
          }, capsolverApiKey);
        } catch {
          // Extension may not be available on this page (e.g. chrome:// pages)
        }
      };

      // Inject into all currently open pages
      for (const p of pages) {
        await injectCapsolverKey(p);
      }

      // Inject into every new page that opens
      context.on('page', async (p) => {
        // Wait a moment for the page to initialize so chrome.storage is available
        await p.waitForTimeout(500).catch(() => {});
        await injectCapsolverKey(p);
      });

      console.log(`[CapSolver] API key injection set up for all pages`);
    } catch {
      console.log(`[CapSolver] Could not set up API key injection`);
    }
  }

  activeBrowsers.set(profile.id, { context });

  // Set up ban detection monitor on all pages (catches post-login bans)
  setupBanMonitor(context, profile);

  // Position the browser window and resize to fit viewport exactly
  try {
    const pos = getNextGridPosition();
    const page = context.pages()[0];
    if (page) {
      const cdp = await context.newCDPSession(page);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');

      // First position and set initial size
      await cdp.send('Browser.setWindowBounds', {
        windowId,
        bounds: { left: pos.x, top: pos.y, width: BROWSER_WIDTH, height: BROWSER_HEIGHT, windowState: 'normal' },
      });

      // Measure actual viewport vs window to calculate chrome overhead
      await page.waitForTimeout(500);
      const innerSize = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      const chromeW = BROWSER_WIDTH - innerSize.w;
      const chromeH = BROWSER_HEIGHT - innerSize.h;

      if (chromeW > 0 || chromeH > 0) {
        // Resize to compensate for chrome (title bar, borders)
        await cdp.send('Browser.setWindowBounds', {
          windowId,
          bounds: { width: BROWSER_WIDTH + chromeW, height: BROWSER_HEIGHT + chromeH },
        });
        console.log(`[Browser] Ventana ajustada: chrome overhead ${chromeW}x${chromeH}px`);
      }
      console.log(`[Browser] Ventana posicionada en grid: (${pos.x}, ${pos.y})`);
    }
  } catch (err) {
    console.log(`[Browser] No se pudo posicionar ventana:`, err.message);
  }

  // Auto-login to Facebook if credentials are set
  if (profile.fb_user && profile.fb_pass && !profile.fb_logged_in) {
    const loginAsync = async () => {
      try {
        await new Promise((r) => setTimeout(r, 2000));
        const entry = activeBrowsers.get(profile.id);
        if (!entry) return;
        let page = entry.context.pages()[0];
        if (!page) page = await entry.context.newPage();

        const loginUser = profile.fb_user;
        const loginPass = profile.fb_pass;
        console.log(`[FB Login] Starting auto-login for ${profile.name} (user: ${loginUser})`);

        // Navigate to Facebook — use 'load' instead of 'networkidle' to avoid timeout
        await page.goto('https://www.facebook.com/login', { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(3000);

        // ── Check if already logged in (cookies/session from previous run) ──
        const urlAfterNav = page.url();
        if (urlAfterNav.includes('facebook.com') && !urlAfterNav.includes('login') && !urlAfterNav.includes('checkpoint') && !urlAfterNav.includes('two_factor') && !urlAfterNav.includes('two_step')) {
          console.log(`[FB Login] ${profile.name} already logged in (redirected to ${urlAfterNav}) — keeping browser open`);
          await dismissFacebookPopups(page);
          if (loginSuccessCallback) loginSuccessCallback(profile.id);
          return;
        }

        // Auto-dismiss Facebook popups (cookies, notifications)
        await dismissFacebookPopups(page);

        // Check if login form exists
        const emailInput = await page.$('#email, input[name="email"]');
        if (!emailInput) {
          // No login form — but we're still on /login URL. This could be:
          // A) Already logged in (rare — usually redirects away from /login)
          // B) Identity confirmation page (shows photo + name + "Continue" button)
          // C) Account locked / verification required
          const stillOnLogin = page.url().includes('/login');

          if (stillOnLogin) {
            // Check if this is an identity confirmation page (photo + name + continue)
            // These pages show the user's profile photo and name without a password field
            const hasProfilePhoto = await page.evaluate(() => {
              const imgs = document.querySelectorAll('img');
              for (const img of imgs) {
                const rect = img.getBoundingClientRect();
                // Profile photos are typically large, centered images
                if (rect.width > 50 && rect.height > 50 && rect.width < 300) {
                  const src = img.src || '';
                  if (src.includes('scontent') || src.includes('fbcdn') || src.includes('profile')) return true;
                }
              }
              return false;
            }).catch(() => false);

            const hasNoPasswordField = !(await page.$('#pass, input[name="pass"], input[type="password"]'));

            if (hasProfilePhoto && hasNoPasswordField) {
              console.log(`[FB Login] IDENTITY CONFIRMATION page detected for ${profile.name} — marking as banned and closing`);
              if (loginFailCallback) loginFailCallback(profile.id, 'Confirmacion de identidad requerida — cuenta bloqueada');
              await closeBrowser(profile.id);
              return;
            }

            // Generic: on /login but no form — could be an error page
            console.log(`[FB Login] On /login but no login form for ${profile.name} — leaving browser open`);
            return;
          }

          // Not on /login — probably already logged in
          console.log(`[FB Login] No login form found for ${profile.name} — already logged in, keeping browser open`);
          if (loginSuccessCallback) loginSuccessCallback(profile.id);
          return;
        }

        // Fill email/phone field
        await emailInput.click();
        await emailInput.fill('');
        await emailInput.type(loginUser, { delay: 30 });
        await page.waitForTimeout(500);

        // Fill password field
        const passInput = await page.$('#pass, input[name="pass"]');
        if (passInput) {
          await passInput.click();
          await passInput.fill('');
          await passInput.type(loginPass, { delay: 30 });
        }
        await page.waitForTimeout(500);

        // Click login button
        const loginBtn = await page.$('button[name="login"], button[type="submit"], [data-testid="royal_login_button"]');
        if (loginBtn) {
          await loginBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(5000);
        console.log(`[FB Login] Login attempt done for ${profile.name}`);

        // ── Detect and wait for CAPTCHA resolution ──
        const hasCaptcha = await page.evaluate(() => {
          return !!(
            document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], iframe[data-e2e="enforcement-frame"]') ||
            document.querySelector('iframe[src*="recaptcha/api2"], iframe[src*="recaptcha/enterprise"]') ||
            document.querySelector('iframe[src*="hcaptcha.com"]') ||
            document.querySelector('#captcha-container, #captcha_challenge, [data-testid="captcha"]') ||
            document.querySelector('.g-recaptcha, .h-captcha')
          );
        }).catch(() => false);

        if (hasCaptcha) {
          console.log(`[FB Login] CAPTCHA detected for ${profile.name} — waiting for CapSolver to resolve (up to 120s)...`);
          // Wait for captcha to disappear (CapSolver extension handles it)
          for (let cWait = 0; cWait < 60; cWait++) {
            await page.waitForTimeout(2000);
            const stillCaptcha = await page.evaluate(() => {
              return !!(
                document.querySelector('iframe[src*="arkoselabs"], iframe[src*="funcaptcha"], iframe[data-e2e="enforcement-frame"]') ||
                document.querySelector('iframe[src*="recaptcha/api2"], iframe[src*="recaptcha/enterprise"]') ||
                document.querySelector('iframe[src*="hcaptcha.com"]') ||
                document.querySelector('#captcha-container, #captcha_challenge, [data-testid="captcha"]') ||
                document.querySelector('.g-recaptcha, .h-captcha')
              );
            }).catch(() => false);

            if (!stillCaptcha) {
              console.log(`[FB Login] CAPTCHA resolved for ${profile.name} after ${(cWait + 1) * 2}s`);
              await page.waitForTimeout(3000);
              break;
            }

            // Check if page navigated away (captcha solved and login proceeded)
            const curUrl = page.url();
            if (curUrl.includes('facebook.com') && !curUrl.includes('login') && !curUrl.includes('checkpoint')) {
              console.log(`[FB Login] Page navigated during CAPTCHA wait — login may have succeeded`);
              break;
            }

            if (cWait % 10 === 9) {
              console.log(`[FB Login] Still waiting for CAPTCHA... (${(cWait + 1) * 2}s)`);
            }
          }
        }

        // ── Detect page state after login attempt ──
        let state = 'waiting';
        for (let check = 0; check < 15; check++) {
          const url = page.url();

          // Quick success check first — already left login page
          if (url.includes('facebook.com') && !url.includes('login') && !url.includes('checkpoint') && !url.includes('two_factor') && !url.includes('two_step')) {
            state = 'success';
            console.log(`[FB Login] SUCCESS — ${profile.name} is logged in`);
            break;
          }

          const bodyText = await page.locator('body').textContent({ timeout: 3000 }).catch(() => '');
          const bodyLower = bodyText.toLowerCase();

          // 1) Wrong password / login error — close browser
          const errorSelectors = ['#error_box', 'div[role="alert"]', '._9ay7'];
          for (const sel of errorSelectors) {
            try {
              const errorEl = page.locator(sel).first();
              if (await errorEl.isVisible({ timeout: 500 })) {
                const errorText = await errorEl.textContent().catch(() => 'Error de login');
                console.log(`[FB Login] LOGIN FAILED for ${profile.name}: ${errorText.trim()}`);
                if (loginFailCallback) loginFailCallback(profile.id, errorText.trim());
                await closeBrowser(profile.id);
                return;
              }
            } catch { /* next */ }
          }
          // Also detect wrong password by known text on page
          const wrongPassTexts = [
            'contraseña que ingresaste es incorrecta',
            'the password you entered is incorrect',
            'password is incorrect',
            'contraseña incorrecta',
            'wrong password',
            'doesn\'t match',
            'no coincide',
          ];
          const hasWrongPass = wrongPassTexts.some(t => bodyLower.includes(t));
          if (hasWrongPass) {
            console.log(`[FB Login] WRONG PASSWORD for ${profile.name} — closing browser`);
            if (loginFailCallback) loginFailCallback(profile.id, 'Contraseña incorrecta');
            await closeBrowser(profile.id);
            return;
          }

          // 2) Account banned/disabled
          if (await checkForBanPage(page, profile)) {
            console.log(`[FB Login] BANNED — ${profile.name} — closing browser`);
            if (loginFailCallback) loginFailCallback(profile.id, 'Cuenta inhabilitada o suspendida');
            await closeBrowser(profile.id);
            return;
          }

          // 3) "Confirm on another device" — LANGUAGE-AGNOSTIC detection
          // Instead of matching text, detect the page structure:
          // - URL contains two_step_verification or checkpoint
          // - No visible text/tel input (code page would have one)
          // - Has a secondary link/button at the bottom ("Try another way" in any language)
          const is2FAPage = url.includes('two_step') || url.includes('two_factor') || url.includes('checkpoint');
          const hasVisibleCodeInput = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]');
            for (const inp of inputs) {
              const rect = inp.getBoundingClientRect();
              const name = (inp.name || '').toLowerCase();
              if (rect.width > 0 && rect.height > 0 && name !== 'unused' && name !== 'q' && name !== 'search') return true;
            }
            return false;
          }).catch(() => false);

          if (is2FAPage && !hasVisibleCodeInput) {
            console.log(`[FB Login] 2FA page without code input — looking for "Try another way" (any language)`);

            // Language-agnostic: find the last visible <a> or small button on the page
            // Facebook always puts "Try another way" as a link at the bottom of the confirm-device screen
            const clickedAlternative = await page.evaluate(() => {
              // Strategy 1: Find all visible <a> links on the page — the "try another way" is usually the last one
              const links = document.querySelectorAll('a[href]');
              const visibleLinks = [];
              for (const link of links) {
                const rect = link.getBoundingClientRect();
                const text = (link.innerText || '').trim();
                if (rect.width > 0 && rect.height > 0 && text.length > 2 && text.length < 80) {
                  visibleLinks.push({ el: link, text, y: rect.top });
                }
              }
              // Sort by Y position — "try another way" is usually near the bottom
              visibleLinks.sort((a, b) => b.y - a.y);
              // Click the bottom-most link that's not a navigation link
              for (const link of visibleLinks) {
                if (!link.el.href.includes('/home') && !link.el.href.includes('/notifications')) {
                  link.el.click();
                  return `Clicked bottom link: "${link.text}"`;
                }
              }

              // Strategy 2: Find standalone text links (spans acting as buttons)
              const spans = document.querySelectorAll('span[role="button"], div[role="button"]');
              const visibleSpans = [];
              for (const span of spans) {
                const rect = span.getBoundingClientRect();
                const text = (span.innerText || '').trim();
                if (rect.width > 0 && rect.height > 0 && text.length > 3 && text.length < 80) {
                  visibleSpans.push({ el: span, text, y: rect.top });
                }
              }
              visibleSpans.sort((a, b) => b.y - a.y);
              if (visibleSpans.length > 0) {
                visibleSpans[0].el.click();
                return `Clicked bottom span: "${visibleSpans[0].text}"`;
              }

              return null;
            }).catch(() => null);

            if (clickedAlternative) {
              console.log(`[FB Login] ${clickedAlternative}`);
              await page.waitForTimeout(4000);
            } else {
              console.log(`[FB Login] Could not find alternative method link`);
            }

            // Now on method selection page — select auth app radio (language-agnostic)
            // Strategy: radio buttons exist, select the one associated with a 6-digit code icon
            // Usually the first or second radio. We try each and look for keywords in ANY language
            const hasRadios = await page.locator('input[type="radio"]').count().catch(() => 0);
            if (hasRadios > 0) {
              console.log(`[FB Login] Method selection: ${hasRadios} radio buttons found`);
              const methodSelected = await page.evaluate(() => {
                const radios = document.querySelectorAll('input[type="radio"]');

                // Multi-language keywords for authentication app
                const authKeywords = [
                  'authenticat', 'autenticad', 'autenticaç', // EN/ES/PT partial match
                  'code generator', 'generador', 'gerador', // EN/ES/PT
                  'مصادقة', 'تطبيق', // Arabic: authentication, app
                  'приложени', 'аутентифик', // Russian
                  'authentifizierung', // German
                  'authentification', // French
                  '認証', '認証アプリ', // Japanese
                  '인증', // Korean
                  '验证', '身份验证', // Chinese
                  'xác thực', // Vietnamese
                  'kimlik doğrulama', // Turkish
                  'uwierzytelni', // Polish
                ];

                for (const radio of radios) {
                  let labelText = '';
                  const labelledBy = radio.getAttribute('aria-labelledby');
                  if (labelledBy) {
                    const labelEl = document.getElementById(labelledBy);
                    if (labelEl) labelText = (labelEl.innerText || labelEl.textContent || '').toLowerCase();
                  }
                  if (!labelText) {
                    const container = radio.closest('div[role="listitem"]') || radio.parentElement?.parentElement || radio.parentElement;
                    if (container) labelText = (container.innerText || '').toLowerCase();
                  }

                  for (const keyword of authKeywords) {
                    if (labelText.includes(keyword)) {
                      const target = radio.closest('label') || radio.closest('div[role="listitem"]') || radio.parentElement;
                      if (target) target.click(); else radio.click();
                      return `Selected: "${labelText.substring(0, 60)}" via "${keyword}"`;
                    }
                  }
                }

                // Fallback: if no keyword matched, just click the FIRST radio (usually auth app)
                if (radios.length > 0) {
                  const first = radios[0];
                  const target = first.closest('label') || first.closest('div[role="listitem"]') || first.parentElement;
                  if (target) target.click(); else first.click();
                  return `Fallback: clicked first radio button`;
                }

                return null;
              }).catch(() => null);

              if (methodSelected) {
                console.log(`[FB Login] ${methodSelected}`);
                await page.waitForTimeout(2000);
              }

              // Click Continue/Submit button — language-agnostic: find the primary/main button
              const clickedContinue = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, div[role="button"]');
                // Find the largest/most prominent button that's not a close/back button
                let bestBtn = null;
                let bestArea = 0;
                for (const btn of buttons) {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width === 0 || rect.height === 0) continue;
                  const text = (btn.innerText || '').trim().toLowerCase();
                  // Skip small icon buttons, close buttons, back buttons
                  if (text.length === 0 || text.length > 30) continue;
                  if (rect.width < 60) continue;
                  const area = rect.width * rect.height;
                  if (area > bestArea) {
                    bestArea = area;
                    bestBtn = btn;
                  }
                }
                if (bestBtn) {
                  bestBtn.click();
                  return `Clicked main button: "${(bestBtn.innerText || '').trim().substring(0, 30)}"`;
                }
                return null;
              }).catch(() => null);

              if (clickedContinue) {
                console.log(`[FB Login] ${clickedContinue}`);
                await page.waitForTimeout(3000);
              }
            }

            // Should now be on 2FA input page
            state = '2fa';
            break;
          }

          // 4) Two-factor / checkpoint pages
          if (url.includes('two_factor') || url.includes('two_step_verification') || url.includes('checkpoint')) {
            // Check if it's email verification
            const isEmailVerify = await isEmailVerificationPage(page);
            if (isEmailVerify) {
              state = 'email_verify';
              console.log(`[FB Login] Email verification detected for ${profile.name}`);
              break;
            }

            // Check if a 2FA input is visible (any text/number input on the page)
            try {
              const tfaSelectors = [
                'input[name="approvals_code"]',
                'input[id="approvals_code"]',
                'input[placeholder*="code"]',
                'input[placeholder*="código"]',
                'input[placeholder*="Code"]',
                'input[autocomplete="one-time-code"]',
                'input[type="text"]',
                'input[type="tel"]',
                'input[type="number"]',
              ];
              let foundInput = false;
              for (const sel of tfaSelectors) {
                const inp = page.locator(sel).first();
                if (await inp.isVisible({ timeout: 500 })) {
                  state = '2fa';
                  console.log(`[FB Login] 2FA code input detected for ${profile.name} (${sel})`);
                  foundInput = true;
                  break;
                }
              }
              if (foundInput) break;
            } catch { /* not visible */ }

            // If URL has two_factor or two_step_verification, treat as 2FA even without visible input yet
            if (url.includes('two_factor') || url.includes('two_step_verification')) {
              if (check >= 3) {
                state = '2fa';
                console.log(`[FB Login] 2FA page detected by URL for ${profile.name}: ${url}`);
                break;
              }
            } else if (check >= 5) {
              // Generic checkpoint that's not 2FA
              state = 'checkpoint';
              console.log(`[FB Login] CHECKPOINT — ${profile.name} at ${url}`);
              break;
            }
          }

          // 5) Success — left login page entirely
          if (url.includes('facebook.com') && !url.includes('login') && !url.includes('checkpoint') && !url.includes('two_factor') && !url.includes('two_step')) {
            state = 'success';
            console.log(`[FB Login] SUCCESS — ${profile.name} is logged in`);
            break;
          }

          // 6) Still on login page — check for error one more time next loop
          await page.waitForTimeout(1000);
          if (check % 5 === 4) console.log(`[FB Login] Still waiting... (${check + 1}s)`);
        }

        // ── Handle detected state ──
        if (state === '2fa') {
          console.log(`[FB Login] Entering 2FA flow for ${profile.name}`);
          await handleFb2FA(page, profile);
          return;
        }

        if (state === 'email_verify') {
          await handleEmailVerification(page, profile);
          return;
        }

        if (state === 'checkpoint') {
          console.log(`[FB Login] CHECKPOINT — ${profile.name} — closing browser`);
          if (loginFailCallback) loginFailCallback(profile.id, 'Verificacion de seguridad requerida');
          await closeBrowser(profile.id);
          return;
        }

        if (state === 'success') {
          await page.waitForTimeout(2000);
          await dismissFacebookPopups(page);
          if (loginSuccessCallback) loginSuccessCallback(profile.id);
          console.log(`[FB Login] === ${profile.name} LOGGED IN ===`);
          return;
        }

        // state === 'waiting' — timed out but DON'T close browser
        // The user might want to handle it manually, or the profile might actually be logged in
        console.log(`[FB Login] Timed out for ${profile.name} — leaving browser open for manual intervention`);

      } catch (err) {
        // DON'T close browser on navigation errors — just log
        // The browser might still be usable (timeout, network hiccup, etc.)
        console.error(`[FB Login] Error for ${profile.name}:`, err.message);
      }
    };
    loginAsync();
  } else if (profile.fb_user && profile.fb_logged_in) {
    // Already logged in, just open Facebook
    const openAsync = async () => {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const entry = activeBrowsers.get(profile.id);
        if (!entry) return;

        // Close any restored tabs that aren't Facebook (e.g. Vercel, random sites)
        const allPages = entry.context.pages();
        for (const p of allPages) {
          const pUrl = p.url();
          if (pUrl && !pUrl.includes('facebook.com') && !pUrl.startsWith('about:') && !pUrl.startsWith('chrome://')) {
            console.log(`[Browser] Closing non-Facebook tab: ${pUrl.substring(0, 80)}`);
            await p.close().catch(() => {});
          }
        }

        let page = entry.context.pages()[0];
        if (!page) page = await entry.context.newPage();
        await page.goto('https://www.facebook.com/', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(3000);

        // Check if Facebook showed a re-login / identity confirmation screen
        // Wait longer for feed to load before concluding session is expired
        const currentUrl = page.url();

        // Only check if we're on the login page or root — if redirected to home.php etc, it's fine
        if (currentUrl.includes('/login') || currentUrl === 'https://www.facebook.com/' || currentUrl === 'https://www.facebook.com') {
          // Wait up to 10 seconds for feed to appear
          let isReLoginScreen = false;
          for (let feedCheck = 0; feedCheck < 5; feedCheck++) {
            await page.waitForTimeout(2000);
            const checkUrl = page.url();

            // If URL changed to something other than root/login, we're good
            if (checkUrl.includes('home.php') || checkUrl.includes('/home') ||
                (!checkUrl.includes('/login') && checkUrl !== 'https://www.facebook.com/' && checkUrl !== 'https://www.facebook.com')) {
              console.log(`[FB Login] ${profile.name} feed loaded: ${checkUrl}`);
              break;
            }

            // Check for re-login indicators: no password field, no feed, has profile photo
            const pageState = await page.evaluate(() => {
              const hasPasswordField = !!document.querySelector('input[type="password"], #pass');
              const hasEmailField = !!document.querySelector('#email, input[name="email"]');
              const hasFeed = !!document.querySelector('[role="feed"], [data-pagelet*="Feed"], [aria-label*="Feed"], [data-pagelet="Stories"]');
              const hasNavBar = !!document.querySelector('[role="navigation"], [aria-label="Facebook"]');
              const hasCreatePost = !!document.querySelector('[aria-label*="on your mind"], [aria-label*="que estas pensando"], [aria-label*="Create"]');
              // Count large profile-like images
              const largeImgs = Array.from(document.querySelectorAll('img')).filter(img => {
                const rect = img.getBoundingClientRect();
                return rect.width > 60 && rect.height > 60 && rect.width < 250;
              });
              return { hasPasswordField, hasEmailField, hasFeed, hasNavBar, hasCreatePost, largeImgCount: largeImgs.length };
            }).catch(() => ({}));

            // It's a re-login screen if: no feed, no nav bar, no create post, no login form, has profile photo
            if (!pageState.hasFeed && !pageState.hasNavBar && !pageState.hasCreatePost &&
                !pageState.hasPasswordField && !pageState.hasEmailField && pageState.largeImgCount > 0) {
              if (feedCheck >= 3) { // Only conclude after enough wait time
                isReLoginScreen = true;
                break;
              }
            }

            // If feed or nav bar appeared, it's fine
            if (pageState.hasFeed || pageState.hasNavBar || pageState.hasCreatePost) {
              break;
            }
          }

          if (isReLoginScreen) {
            console.log(`[FB Login] ${profile.name} session expired — re-login screen detected, marking as error and closing`);
            if (loginFailCallback) loginFailCallback(profile.id, 'Sesion expirada — requiere re-login');
            await closeBrowser(profile.id);
            return;
          }
        }

        await dismissFacebookPopups(page);
      } catch {
        // Ignore navigation errors
      }
    };
    openAsync();
  } else {
    // No credentials — just open Facebook
    const openFb = async () => {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const entry = activeBrowsers.get(profile.id);
        if (!entry) return;
        let page = entry.context.pages()[0];
        if (!page) page = await entry.context.newPage();
        await page.goto('https://www.facebook.com/', { waitUntil: 'load', timeout: 20000 });
        await page.waitForTimeout(2000);
        await dismissFacebookPopups(page);
      } catch {}
    };
    openFb();
  }

  // Auto-cleanup when all pages close
  context.on('close', () => {
    activeBrowsers.delete(profile.id);
  });

  return context;
}

async function closeBrowser(profileId) {
  const entry = activeBrowsers.get(profileId);
  if (!entry) return;

  try {
    await entry.context.close();
  } catch {
    // Context may already be closed
  }
  activeBrowsers.delete(profileId);
}

function getActiveBrowsers() {
  return activeBrowsers;
}

// ─── Instagram Auto-Login ──────────────────────────────────────────

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function loginToInstagram(page, profile) {
  console.log(`[IG Login] Starting login for ${profile.name} (@${profile.fb_user})...`);

  try {
    // Navigate — use 'load' instead of 'networkidle' (IG keeps websockets open forever)
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'load',
      timeout: 30000,
    });
  } catch (err) {
    console.log(`[IG Login] Navigation warning (continuing anyway): ${err.message}`);
  }

  // Wait for login form to appear (max 2 seconds static wait)
  console.log(`[IG Login] Page loaded, waiting for login form...`);
  await page.waitForTimeout(1500);

  // Dismiss cookie banner quickly — just try clicking any visible one
  try {
    const cookieBtn = page.locator('button:has-text("cookies"), button:has-text("Permitir"), button:has-text("Accept"), button:has-text("Aceptar"), button:has-text("Allow")').first();
    if (await cookieBtn.isVisible({ timeout: 500 })) {
      await cookieBtn.click();
      console.log(`[IG Login] Cookie banner dismissed`);
      await page.waitForTimeout(800);
    }
  } catch { /* no cookie banner */ }

  // Find username input — wait for it to appear (max 3 sec total)
  let usernameInput;
  try {
    usernameInput = page.locator('input[name="username"], form input[type="text"]').first();
    await usernameInput.waitFor({ state: 'visible', timeout: 3000 });
    console.log(`[IG Login] Found username input`);
  } catch {
    // Fallback: try all selectors
    const inputSelectors = ['input[aria-label*="username"]', 'input[aria-label*="usuario"]', 'form input[type="text"]'];
    for (const sel of inputSelectors) {
      try {
        const input = page.locator(sel).first();
        await input.waitFor({ state: 'visible', timeout: 1000 });
        usernameInput = input;
        console.log(`[IG Login] Found username input: ${sel}`);
        break;
      } catch { /* next */ }
    }
  }

  if (!usernameInput) {
    // Last resort: take screenshot path for debugging
    console.log(`[IG Login] Could not find username input. Current URL: ${page.url()}`);
    const bodyText = await page.locator('body').textContent().catch(() => '');
    console.log(`[IG Login] Page content preview: ${bodyText.substring(0, 200)}`);
    throw new Error('No se encontro el campo de usuario en Instagram');
  }

  await page.waitForTimeout(randomDelay(500, 1000));

  // Type username using fill() — fast and reliable
  await usernameInput.click();
  await page.waitForTimeout(300);
  await usernameInput.fill(profile.fb_user);
  console.log(`[IG Login] Username filled: ${profile.fb_user}`);

  await page.waitForTimeout(randomDelay(400, 800));

  // Find password input quickly
  let passwordInput;
  try {
    passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 2000 });
    console.log(`[IG Login] Found password input`);
  } catch {
    // Fallback
    const passSelectors = ['input[aria-label*="contrase"]', 'input[aria-label*="password"]', 'form input:nth-of-type(2)'];
    for (const sel of passSelectors) {
      try {
        const input = page.locator(sel).first();
        await input.waitFor({ state: 'visible', timeout: 1000 });
        passwordInput = input;
        console.log(`[IG Login] Found password input: ${sel}`);
        break;
      } catch { /* next */ }
    }
  }

  if (!passwordInput) {
    console.log(`[IG Login] Could not find password field. URL: ${page.url()}`);
    throw new Error('No se encontro el campo de password');
  }

  await passwordInput.click();
  await page.waitForTimeout(300);
  await passwordInput.fill(profile.fb_pass);
  console.log(`[IG Login] Password filled`);

  await page.waitForTimeout(randomDelay(300, 600));

  // Click the Log In button — fast
  let clicked = false;
  try {
    const loginBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Iniciar sesi\u00f3n")').first();
    if (await loginBtn.isVisible({ timeout: 1500 })) {
      await loginBtn.click();
      clicked = true;
      console.log(`[IG Login] Login button clicked`);
    }
  } catch {
    // Try next
  }

  // Fallback: press Enter on the password field
  if (!clicked) {
    console.log(`[IG Login] No login button found, pressing Enter...`);
    await passwordInput.press('Enter');
  }

  console.log(`[IG Login] Login submitted, waiting for response...`);

  // Wait and poll for page state change (up to 15 seconds)
  let state = 'waiting';
  for (let check = 0; check < 15; check++) {
    await page.waitForTimeout(1000);
    const url = page.url();

    // 2FA page detected — check if it's email verification or TOTP
    if (url.includes('two_factor')) {
      const isEmailVerify = await isEmailVerificationPage(page);
      if (isEmailVerify) {
        state = 'email_verify';
        console.log(`[IG Login] Verificación por email detectada en two_factor: ${url}`);
        break;
      }
      state = '2fa';
      console.log(`[IG Login] 2FA page detected at: ${url}`);
      break;
    }

    // Account banned/disabled (URL check)
    if (url.includes('disabled') || url.includes('suspended') || url.includes('appeal')) {
      state = 'banned';
      console.log(`[IG Login] Account banned/disabled (URL): ${url}`);
      break;
    }

    // Account banned/disabled (text content check)
    try {
      const bodyText = await page.locator('body').textContent({ timeout: 1500 }).catch(() => '');
      for (const banText of BAN_TEXT_INDICATORS) {
        if (bodyText.includes(banText)) {
          state = 'banned';
          console.log(`[IG Login] Account banned/disabled (text): "${banText}"`);
          break;
        }
      }
      if (state === 'banned') break;
    } catch { /* ignore */ }

    // Email verification challenge (check before generic challenge)
    if (url.includes('challenge') || url.includes('checkpoint')) {
      const isEmailVerify = await isEmailVerificationPage(page);
      if (isEmailVerify) {
        state = 'email_verify';
        console.log(`[IG Login] Verificación por email detectada: ${url}`);
        break;
      }
      // Generic challenge (facial, selfie, etc.)
      state = 'challenge';
      console.log(`[IG Login] Challenge/verification detected: ${url}`);
      break;
    }

    // Successfully left login page
    if (!url.includes('/accounts/login')) {
      state = 'success';
      console.log(`[IG Login] Login success, navigated to: ${url}`);
      break;
    }

    // Check for facial/selfie verification text on page
    try {
      const verifyTexts = [
        'text="Verify Your Identity"',
        'text="Verifica tu identidad"',
        'text="selfie"',
        'text="Take a Selfie"',
        'text="video selfie"',
        'text="foto de tu rostro"',
        'text="Confirm Your Identity"',
        'text="Confirma tu identidad"',
        'text="upload a photo"',
        'text="sube una foto"',
      ];
      for (const sel of verifyTexts) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 200 })) {
          state = 'facial';
          console.log(`[IG Login] Facial verification detected on page`);
          break;
        }
      }
      if (state === 'facial') break;
    } catch { /* not found */ }

    // Check for 2FA form on page (sometimes URL doesn't change but form appears)
    try {
      const tfaForm = page.locator('input[placeholder*="seguridad"], input[placeholder*="Security"], input[name="verificationCode"]').first();
      if (await tfaForm.isVisible({ timeout: 300 })) {
        state = '2fa';
        console.log(`[IG Login] 2FA form found on page`);
        break;
      }
    } catch { /* not visible yet */ }

    // Check for error messages
    try {
      const errorEl = page.locator('p[data-testid="login-error-message"], #slfErrorAlert, div[role="alert"]').first();
      if (await errorEl.isVisible({ timeout: 300 })) {
        const errorText = await errorEl.textContent().catch(() => 'Error');
        console.log(`[IG Login] LOGIN FAILED: ${errorText.trim()}`);
        if (loginFailCallback) loginFailCallback(profile.id, errorText.trim());
        await closeBrowser(profile.id);
        return;
      }
    } catch { /* no error */ }

    if (check % 5 === 4) console.log(`[IG Login] Still waiting... (${check + 1}s)`);
  }

  // Handle banned
  if (state === 'banned') {
    console.log(`[IG Login] BANNED — ${profile.name} — closing browser`);
    if (loginFailCallback) loginFailCallback(profile.id, 'Cuenta inhabilitada o suspendida');
    await closeBrowser(profile.id);
    return;
  }

  // Handle facial verification
  if (state === 'facial') {
    console.log(`[IG Login] FACIAL VERIFICATION — ${profile.name} — closing browser`);
    if (loginFailCallback) loginFailCallback(profile.id, 'Verificacion facial requerida');
    await closeBrowser(profile.id);
    return;
  }

  // Handle challenge/checkpoint
  if (state === 'challenge') {
    console.log(`[IG Login] CHALLENGE — ${profile.name} — closing browser`);
    if (loginFailCallback) loginFailCallback(profile.id, 'Verificacion de seguridad requerida');
    await closeBrowser(profile.id);
    return;
  }

  // Handle email verification
  if (state === 'email_verify') {
    await handleEmailVerification(page, profile);
    return;
  }

  // Handle 2FA
  if (state === '2fa') {
    await handle2FA(page, profile);
    return;
  }

  const currentUrl = page.url();

  // Account banned/disabled/suspended (URL + text check)
  if (await checkForBanPage(page, profile)) {
    console.log(`[IG Login] ACCOUNT BANNED: ${profile.name} — closing browser`);
    if (loginFailCallback) {
      loginFailCallback(profile.id, 'Cuenta inhabilitada o suspendida');
    }
    await closeBrowser(profile.id);
    return;
  }

  if (state === 'success' || !currentUrl.includes('/accounts/login')) {
    console.log(`[IG Login] Navigation detected: ${currentUrl}`);
    await page.waitForTimeout(2000);

    // Dismiss popups that Instagram shows after login
    const dismissSelectors = [
      'button:has-text("Not Now")',
      'button:has-text("Ahora no")',
      'button:has-text("Not now")',
      'div[role="button"]:has-text("Not Now")',
      'div[role="button"]:has-text("Ahora no")',
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
      await page.waitForTimeout(1500);
      let dismissed = false;
      for (const sel of dismissSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 })) {
            await btn.click();
            console.log(`[IG Login] Dismissed popup: ${sel}`);
            dismissed = true;
            break;
          }
        } catch {
          // Try next
        }
      }
      if (!dismissed) break;
    }

    // Mark as logged in
    if (loginSuccessCallback) {
      loginSuccessCallback(profile.id);
    }

    console.log(`[IG Login] SUCCESS — ${profile.name} (@${profile.fb_user}) is now logged in`);
  } else if (currentUrl.includes('challenge')) {
    console.log(`[IG Login] ${profile.name} needs challenge verification — complete manually`);
  } else {
    // Still on login page after 5 seconds — likely wrong credentials
    console.log(`[IG Login] ${profile.name} still on login page — closing browser`);
    if (loginFailCallback) {
      loginFailCallback(profile.id, 'Credenciales incorrectas o cuenta bloqueada');
    }
    await closeBrowser(profile.id);
  }
}

// ─── Facebook 2FA Handler ──────────────────────────────────────────

async function handleFb2FA(page, profile) {
  console.log(`[FB 2FA] === Starting Facebook 2FA for ${profile.name} ===`);

  if (!profile.fb_2fa_secret) {
    // No TOTP secret — check if email verification is possible
    const isEmailVerify = await isEmailVerificationPage(page);
    if (isEmailVerify && profile.fb_email && profile.fb_email_pass) {
      console.log(`[FB 2FA] No TOTP secret but email verification detected — redirecting`);
      await handleEmailVerification(page, profile);
      return;
    }
    console.log(`[FB 2FA] No 2FA secret configured for ${profile.name} — closing browser`);
    if (loginFailCallback) loginFailCallback(profile.id, '2FA requerido — sin secreto TOTP configurado');
    await closeBrowser(profile.id);
    return;
  }

  try {
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    console.log(`[FB 2FA] URL: ${currentUrl}`);

    // Step 0: Navigate through "confirm on another device" and method selection screens
    // Wait for Facebook SPA to render real content (initial body is JSON)
    console.log(`[FB 2FA] Waiting for Facebook to render...`);
    for (let waitRender = 0; waitRender < 15; waitRender++) {
      const rawText = await page.locator('body').textContent({ timeout: 2000 }).catch(() => '');
      if (!rawText.startsWith('{') && rawText.length > 50) {
        console.log(`[FB 2FA] Page rendered (${rawText.length} chars)`);
        break;
      }
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(2000);

    // We may need to go through multiple screens before reaching the code input
    for (let nav = 0; nav < 3; nav++) {
      // Wait for real content on each step
      await page.waitForTimeout(1500);
      let bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
      // If body is still JSON, try innerText via evaluate
      if (bodyText.startsWith('{') || bodyText.length < 50) {
        bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
      }
      const bodyLower = bodyText.toLowerCase();
      const currentNavUrl = page.url();
      console.log(`[FB 2FA] Navigation step ${nav}, URL: ${currentNavUrl}`);
      console.log(`[FB 2FA] Page text (first 500): ${bodyText.substring(0, 500)}`);

      // Check if we already have a code input visible — if so, skip to step 1
      let hasCodeInput = false;
      const quickSelectors = ['input[name="approvals_code"]', 'input[id="approvals_code"]', 'input[autocomplete="one-time-code"]'];
      for (const sel of quickSelectors) {
        try {
          if (await page.locator(sel).first().isVisible({ timeout: 500 })) {
            hasCodeInput = true;
            break;
          }
        } catch { /* next */ }
      }
      // Also check for any text/tel input that could be a code input
      if (!hasCodeInput) {
        try {
          const inputs = await page.locator('input[type="text"], input[type="tel"], input[type="number"]').all();
          for (const inp of inputs) {
            if (await inp.isVisible({ timeout: 300 })) {
              const name = await inp.getAttribute('name').catch(() => '');
              if (name !== 'unused' && name !== 'q' && name !== 'search') {
                hasCodeInput = true;
                break;
              }
            }
          }
        } catch { /* skip */ }
      }
      if (hasCodeInput) {
        console.log(`[FB 2FA] Code input already visible — skipping to code entry`);
        break;
      }

      // Screen A: "Confirm on another device" — LANGUAGE-AGNOSTIC
      // Detect by: no code input visible + has a link at the bottom of the page
      const hasCodeInputNow = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="text"], input[type="tel"], input[type="number"]');
        for (const inp of inputs) {
          const rect = inp.getBoundingClientRect();
          const name = (inp.name || '').toLowerCase();
          if (rect.width > 0 && rect.height > 0 && name !== 'unused' && name !== 'q' && name !== 'search') return true;
        }
        return false;
      }).catch(() => false);

      if (!hasCodeInputNow) {
        console.log(`[FB 2FA] No code input visible — looking for alternative method link (any language)`);

        // Click bottom-most link on the page (= "Try another way" in any language)
        const clickedAlt = await page.evaluate(() => {
          const links = document.querySelectorAll('a[href], span[role="button"], div[role="button"]');
          const visible = [];
          for (const el of links) {
            const rect = el.getBoundingClientRect();
            const text = (el.innerText || '').trim();
            if (rect.width > 0 && rect.height > 0 && text.length > 2 && text.length < 80) {
              visible.push({ el, text, y: rect.top });
            }
          }
          visible.sort((a, b) => b.y - a.y);
          for (const item of visible) {
            const href = item.el.href || '';
            if (!href.includes('/home') && !href.includes('/notifications') && !href.includes('#')) {
              item.el.click();
              return `Clicked: "${item.text}"`;
            }
          }
          // Last resort: click last visible element
          if (visible.length > 0) {
            visible[0].el.click();
            return `Clicked last visible: "${visible[0].text}"`;
          }
          return null;
        }).catch(() => null);

        if (clickedAlt) {
          console.log(`[FB 2FA] ${clickedAlt}`);
          await page.waitForTimeout(5000);
        } else {
          console.log(`[FB 2FA] No alternative link found`);
        }
        continue;
      }

      // Screen B: Method selection (radio buttons) — LANGUAGE-AGNOSTIC
      const radioCount = await page.locator('input[type="radio"]').count().catch(() => 0);
      if (radioCount > 0) {
        console.log(`[FB 2FA] Method selection: ${radioCount} radio buttons`);

        const methodSelected = await page.evaluate(() => {
          const radios = document.querySelectorAll('input[type="radio"]');
          // Multi-language keywords for authentication app
          const authKeywords = [
            'authenticat', 'autenticad', 'autenticaç',
            'code generator', 'generador', 'gerador',
            'مصادقة', 'تطبيق', 'приложени', 'аутентифик',
            'authentifizierung', 'authentification',
            '認証', '인증', '验证', '身份验证',
            'xác thực', 'kimlik doğrulama', 'uwierzytelni',
          ];

          for (const radio of radios) {
            let labelText = '';
            const labelledBy = radio.getAttribute('aria-labelledby');
            if (labelledBy) {
              const labelEl = document.getElementById(labelledBy);
              if (labelEl) labelText = (labelEl.innerText || labelEl.textContent || '').toLowerCase();
            }
            if (!labelText) {
              const container = radio.closest('div[role="listitem"]') || radio.parentElement?.parentElement || radio.parentElement;
              if (container) labelText = (container.innerText || '').toLowerCase();
            }
            for (const keyword of authKeywords) {
              if (labelText.includes(keyword)) {
                const target = radio.closest('label') || radio.closest('div[role="listitem"]') || radio.parentElement;
                if (target) target.click(); else radio.click();
                return `Selected: "${labelText.substring(0, 60)}" via "${keyword}"`;
              }
            }
          }
          // Fallback: click first radio
          if (radios.length > 0) {
            const target = radios[0].closest('label') || radios[0].parentElement;
            if (target) target.click(); else radios[0].click();
            return `Fallback: first radio`;
          }
          return null;
        }).catch(() => null);

        if (methodSelected) console.log(`[FB 2FA] ${methodSelected}`);
        await page.waitForTimeout(2000);

        // Click main/continue button — language-agnostic: biggest visible button
        const clickedMain = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, div[role="button"]');
          let bestBtn = null;
          let bestArea = 0;
          for (const btn of buttons) {
            const rect = btn.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            const text = (btn.innerText || '').trim();
            if (text.length === 0 || text.length > 30 || rect.width < 60) continue;
            const area = rect.width * rect.height;
            if (area > bestArea) { bestArea = area; bestBtn = btn; }
          }
          if (bestBtn) {
            bestBtn.click();
            return `Clicked: "${(bestBtn.innerText || '').trim().substring(0, 30)}"`;
          }
          return null;
        }).catch(() => null);

        if (clickedMain) {
          console.log(`[FB 2FA] ${clickedMain}`);
          await page.waitForTimeout(3000);
        }
        continue;
      }

      // If we reach here, page doesn't match known screens — break and try to find input
      console.log(`[FB 2FA] Unknown screen state — attempting to find code input`);
      break;
    }

    // Step 1: Find the 2FA code input — wait up to 10 seconds for it to appear
    let tfaInput = null;

    for (let attempt = 0; attempt < 10; attempt++) {
      // Try Facebook-specific selectors first
      const fbSelectors = [
        'input[name="approvals_code"]',
        'input[id="approvals_code"]',
        'input[autocomplete="one-time-code"]',
        'input[placeholder*="code"]',
        'input[placeholder*="código"]',
        'input[placeholder*="Code"]',
      ];

      for (const sel of fbSelectors) {
        try {
          const input = page.locator(sel).first();
          if (await input.isVisible({ timeout: 300 })) {
            tfaInput = input;
            console.log(`[FB 2FA] Found input via selector: ${sel}`);
            break;
          }
        } catch { /* next */ }
      }
      if (tfaInput) break;

      // Fallback: find any visible text/tel/number input (skip radio, password, hidden, checkbox)
      const allInputs = await page.locator('input').all();
      for (const input of allInputs) {
        try {
          if (await input.isVisible({ timeout: 300 })) {
            const type = await input.getAttribute('type').catch(() => '');
            const name = await input.getAttribute('name').catch(() => '');
            if (type === 'hidden' || type === 'checkbox' || type === 'submit' || type === 'password' || type === 'radio') continue;
            // Skip search inputs and unused radio-like fields
            if (name === 'q' || name === 'search' || name === 'unused') continue;
            tfaInput = input;
            console.log(`[FB 2FA] Using fallback input: type="${type}" name="${name}"`);
            break;
          }
        } catch { /* skip */ }
      }
      if (tfaInput) break;

      if (attempt < 9) {
        console.log(`[FB 2FA] No code input found yet, waiting... (attempt ${attempt + 1}/10)`);
        await page.waitForTimeout(1000);
      }
    }

    if (!tfaInput) {
      console.log(`[FB 2FA] No code input found for ${profile.name} — closing browser`);
      if (loginFailCallback) loginFailCallback(profile.id, '2FA requerido — no se encontro campo de codigo');
      await closeBrowser(profile.id);
      return;
    }

    // Step 2: Generate TOTP code — wait if close to time step boundary to avoid expired codes
    const epoch = Math.floor(Date.now() / 1000);
    const secondsRemaining = 30 - (epoch % 30);
    if (secondsRemaining < 5) {
      console.log(`[FB 2FA] Only ${secondsRemaining}s left in time step — waiting for fresh code...`);
      await page.waitForTimeout((secondsRemaining + 1) * 1000);
    }
    const code = generateTOTP(profile.fb_2fa_secret);
    console.log(`[FB 2FA] TOTP code: ${code} (${30 - (Math.floor(Date.now() / 1000) % 30)}s remaining)`);

    await tfaInput.click({ timeout: 5000 });
    await page.waitForTimeout(300);
    await tfaInput.fill(code);
    await page.waitForTimeout(500);

    // Verify the code was entered
    const val = await tfaInput.inputValue().catch(() => '');
    console.log(`[FB 2FA] Input value after fill: "${val}"`);
    if (val !== code) {
      console.log(`[FB 2FA] fill() didn't work, trying type()...`);
      await tfaInput.click({ clickCount: 3, timeout: 3000 });
      await page.keyboard.type(code, { delay: 50 });
      await page.waitForTimeout(300);
    }

    // Step 3: Click submit button — LANGUAGE-AGNOSTIC: find the biggest visible button
    let clicked = false;
    const clickedSubmit = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button, div[role="button"]');
      let bestBtn = null;
      let bestArea = 0;
      for (const btn of buttons) {
        const rect = btn.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const text = (btn.innerText || '').trim();
        if (text.length === 0 || text.length > 30 || rect.width < 60) continue;
        const area = rect.width * rect.height;
        if (area > bestArea) { bestArea = area; bestBtn = btn; }
      }
      if (bestBtn) {
        bestBtn.click();
        return `Clicked: "${(bestBtn.innerText || '').trim().substring(0, 30)}"`;
      }
      return null;
    }).catch(() => null);

    if (clickedSubmit) {
      clicked = true;
      console.log(`[FB 2FA] Submit ${clickedSubmit}`);
    }
    if (!clicked) {
      console.log(`[FB 2FA] No submit button found, pressing Enter`);
      await tfaInput.press('Enter');
    }

    // Step 4: Wait for result
    console.log(`[FB 2FA] Waiting for response...`);
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const url = page.url();

      // Success — navigated away from checkpoint/two_factor/login
      if (url.includes('facebook.com') && !url.includes('login') && !url.includes('checkpoint') && !url.includes('two_factor')) {
        console.log(`[FB 2FA] SUCCESS! Redirected to: ${url}`);
        await page.waitForTimeout(2000);
        await dismissFacebookPopups(page);
        if (loginSuccessCallback) loginSuccessCallback(profile.id);
        console.log(`[FB 2FA] === ${profile.name} LOGGED IN ===`);
        return;
      }

      // Check for "save browser" / "trust device" / "remember device" prompts
      // Language-agnostic: detect by structure — no code input visible + has a prominent button
      const isTrustPrompt = await page.evaluate(() => {
        const body = (document.body.innerText || '').toLowerCase();
        // Check by text in many languages
        const trustTexts = [
          'save browser', 'trust this', 'remember this', 'save this',
          'guardar navegador', 'confiar en este', 'recordar este',
          'enregistrer le navigateur', 'se souvenir', 'faire confiance',
          'browser speichern', 'diesem browser vertrauen',
          'salvar navegador', 'confiar neste', 'lembrar este',
          'حفظ المتصفح', 'الوثوق', 'تذكر هذا',
          'сохранить браузер', 'доверять', 'запомнить',
          '保存浏览器', '信任此', '记住此',
          'ブラウザを保存', 'このブラウザを信頼', 'このブラウザを記憶',
          '브라우저 저장', '이 브라우저를 신뢰',
          'save login', 'guardar inicio', 'not now', 'ahora no',
        ];
        if (trustTexts.some(t => body.includes(t))) return true;

        // Structure check: no visible code input + page has only 1-2 prominent buttons
        const codeInputs = document.querySelectorAll('input[type="text"], input[type="tel"]');
        let hasVisibleCodeInput = false;
        for (const inp of codeInputs) {
          if (inp.getBoundingClientRect().width > 0 && inp.name !== 'unused') hasVisibleCodeInput = true;
        }
        if (!hasVisibleCodeInput) {
          const buttons = document.querySelectorAll('button, div[role="button"]');
          const visibleBtns = Array.from(buttons).filter(b => b.getBoundingClientRect().width > 60 && (b.innerText || '').trim().length > 1 && (b.innerText || '').trim().length < 30);
          if (visibleBtns.length >= 1 && visibleBtns.length <= 3) return true;
        }
        return false;
      }).catch(() => false);

      if (isTrustPrompt) {
        console.log(`[FB 2FA] Trust/save device prompt detected — clicking main button`);
        // Click the biggest button (Continue/Save/Trust)
        const clicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button, div[role="button"]');
          let bestBtn = null;
          let bestArea = 0;
          for (const btn of buttons) {
            const rect = btn.getBoundingClientRect();
            const text = (btn.innerText || '').trim();
            if (rect.width < 60 || text.length < 1 || text.length > 30) continue;
            const area = rect.width * rect.height;
            if (area > bestArea) { bestArea = area; bestBtn = btn; }
          }
          if (bestBtn) { bestBtn.click(); return (bestBtn.innerText || '').trim(); }
          return null;
        }).catch(() => null);
        if (clicked) console.log(`[FB 2FA] Clicked: "${clicked}"`);
        await page.waitForTimeout(3000);
        await dismissFacebookPopups(page);
        if (loginSuccessCallback) loginSuccessCallback(profile.id);
        console.log(`[FB 2FA] === ${profile.name} LOGGED IN (after trust prompt) ===`);
        return;
      }
    }

    // Still on 2FA page — wait for new time step and retry
    console.log(`[FB 2FA] Still on 2FA, waiting for next time step before retry...`);
    const retryEpoch = Math.floor(Date.now() / 1000);
    const retryWait = 30 - (retryEpoch % 30) + 2; // wait until 2s into next time step
    await page.waitForTimeout(retryWait * 1000);
    const freshCode = generateTOTP(profile.fb_2fa_secret);
    console.log(`[FB 2FA] Fresh code: ${freshCode} (${30 - (Math.floor(Date.now() / 1000) % 30)}s remaining)`);

    if (tfaInput) {
      await tfaInput.click({ clickCount: 3 }).catch(() => {});
      await page.keyboard.type(freshCode, { delay: 50 });
      await page.waitForTimeout(500);

      // Click submit — language-agnostic: biggest visible button
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, div[role="button"]');
        let bestBtn = null;
        let bestArea = 0;
        for (const btn of buttons) {
          const rect = btn.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const text = (btn.innerText || '').trim();
          if (text.length === 0 || text.length > 30 || rect.width < 60) continue;
          const area = rect.width * rect.height;
          if (area > bestArea) { bestArea = area; bestBtn = btn; }
        }
        if (bestBtn) bestBtn.click();
      }).catch(() => {});

      // Wait and check for success or trust prompt
      for (let retryCheck = 0; retryCheck < 10; retryCheck++) {
        await page.waitForTimeout(1000);
        const finalUrl = page.url();

        if (finalUrl.includes('facebook.com') && !finalUrl.includes('login') && !finalUrl.includes('checkpoint') && !finalUrl.includes('two_factor') && !finalUrl.includes('two_step')) {
          await dismissFacebookPopups(page);
          if (loginSuccessCallback) loginSuccessCallback(profile.id);
          console.log(`[FB 2FA] === ${profile.name} LOGGED IN (retry) ===`);
          return;
        }

        // Check for trust/save prompt after retry
        const hasTrustRetry = await page.evaluate(() => {
          const codeInputs = document.querySelectorAll('input[type="text"], input[type="tel"]');
          let hasVisible = false;
          for (const inp of codeInputs) { if (inp.getBoundingClientRect().width > 0 && inp.name !== 'unused') hasVisible = true; }
          if (!hasVisible) {
            const btns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => b.getBoundingClientRect().width > 60 && (b.innerText||'').trim().length > 1 && (b.innerText||'').trim().length < 30);
            return btns.length >= 1 && btns.length <= 3;
          }
          return false;
        }).catch(() => false);

        if (hasTrustRetry) {
          console.log(`[FB 2FA] Trust prompt after retry — clicking main button`);
          await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => b.getBoundingClientRect().width > 60);
            let best = null, bestA = 0;
            for (const b of btns) { const a = b.getBoundingClientRect().width * b.getBoundingClientRect().height; if (a > bestA) { bestA = a; best = b; } }
            if (best) best.click();
          }).catch(() => {});
          await page.waitForTimeout(3000);
          await dismissFacebookPopups(page);
          if (loginSuccessCallback) loginSuccessCallback(profile.id);
          console.log(`[FB 2FA] === ${profile.name} LOGGED IN (retry + trust) ===`);
          return;
        }
      }
    }

    // Don't close browser — leave it open for manual intervention
    console.log(`[FB 2FA] FAILED — could not complete 2FA for ${profile.name} — leaving browser open for manual action`);

  } catch (err) {
    // Don't close browser on errors — just log
    console.log(`[FB 2FA] ERROR: ${err.message} — leaving browser open`);
  }
}

// ─── Instagram 2FA Handler ────────────────────────────────────────────────────

async function handle2FA(page, profile) {
  console.log(`[IG 2FA] === Starting 2FA for ${profile.name} ===`);

  if (!profile.fb_2fa_secret) {
    // Sin secreto TOTP — verificar si es verificación por email
    const isEmailVerify = await isEmailVerificationPage(page);
    if (isEmailVerify && profile.fb_email && profile.fb_email_pass) {
      console.log(`[IG 2FA] Sin secreto TOTP pero se detectó verificación por email — redirigiendo`);
      await handleEmailVerification(page, profile);
      return;
    }
    console.log(`[IG 2FA] No secret configured — complete manually`);
    return;
  }

  try {
    // Wait for page to settle
    await page.waitForTimeout(3000);
    console.log(`[IG 2FA] URL: ${page.url()}`);

    // Step 1: Find the input — try getting ANY visible input on the page
    let tfaInput = null;

    // First try: the most direct approach — get all inputs and find the right one
    const allInputs = await page.locator('input').all();
    console.log(`[IG 2FA] Found ${allInputs.length} input(s) on page`);

    for (const input of allInputs) {
      try {
        if (await input.isVisible({ timeout: 500 })) {
          const type = await input.getAttribute('type').catch(() => '');
          const name = await input.getAttribute('name').catch(() => '');
          const placeholder = await input.getAttribute('placeholder').catch(() => '');
          console.log(`[IG 2FA] Visible input: type="${type}" name="${name}" placeholder="${placeholder}"`);

          // Skip hidden/checkbox inputs
          if (type === 'hidden' || type === 'checkbox' || type === 'submit') continue;

          // This is likely the 2FA input
          tfaInput = input;
          console.log(`[IG 2FA] Using this input for 2FA code`);
          break;
        }
      } catch { /* skip */ }
    }

    if (!tfaInput) {
      console.log(`[IG 2FA] No visible input found on page!`);
      const bodyText = await page.locator('body').textContent().catch(() => '');
      console.log(`[IG 2FA] Page text: ${bodyText.substring(0, 500)}`);
      return;
    }

    // Step 2: Generate and enter the code
    const code = generateTOTP(profile.fb_2fa_secret);
    console.log(`[IG 2FA] TOTP code: ${code}`);

    await tfaInput.click();
    await page.waitForTimeout(300);
    await tfaInput.fill(code);
    await page.waitForTimeout(500);

    // Verify
    const val = await tfaInput.inputValue().catch(() => '');
    console.log(`[IG 2FA] Input value: "${val}"`);

    if (val !== code) {
      // Try typing character by character as fallback
      console.log(`[IG 2FA] fill() didn't work, trying type()...`);
      await tfaInput.click({ clickCount: 3 }); // select all
      await page.keyboard.type(code, { delay: 50 });
      await page.waitForTimeout(300);
      const val2 = await tfaInput.inputValue().catch(() => '');
      console.log(`[IG 2FA] Input value after type(): "${val2}"`);
    }

    await page.waitForTimeout(500);

    // Step 3: Click Confirmar button
    const allButtons = await page.locator('button').all();
    console.log(`[IG 2FA] Found ${allButtons.length} button(s)`);

    let clicked = false;
    for (const btn of allButtons) {
      try {
        if (await btn.isVisible({ timeout: 500 })) {
          const text = await btn.textContent().catch(() => '');
          console.log(`[IG 2FA] Button: "${text.trim()}"`);

          if (text.match(/confirm|verificar|confirmar|verify|submit|enviar/i)) {
            await btn.click();
            clicked = true;
            console.log(`[IG 2FA] Clicked: "${text.trim()}"`);
            break;
          }
        }
      } catch { /* skip */ }
    }

    if (!clicked) {
      console.log(`[IG 2FA] No confirm button found, pressing Enter`);
      await tfaInput.press('Enter');
    }

    // Step 4: Wait and check result
    console.log(`[IG 2FA] Waiting for response...`);

    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      const url = page.url();

      if (!url.includes('two_factor') && !url.includes('accounts/login')) {
        // SUCCESS
        console.log(`[IG 2FA] SUCCESS! Redirected to: ${url}`);

        // Dismiss popups
        for (let a = 0; a < 3; a++) {
          await page.waitForTimeout(1500);
          for (const txt of ['Not Now', 'Ahora no']) {
            try {
              const b = page.locator(`button:has-text("${txt}"), div[role="button"]:has-text("${txt}")`).first();
              if (await b.isVisible({ timeout: 1500 })) { await b.click(); break; }
            } catch { /* next */ }
          }
        }

        if (loginSuccessCallback) loginSuccessCallback(profile.id);
        console.log(`[IG 2FA] === ${profile.name} LOGGED IN ===`);
        return;
      }
    }

    // Still on 2FA — try fresh code
    console.log(`[IG 2FA] Still on 2FA page, retrying with fresh code...`);
    const freshCode = generateTOTP(profile.fb_2fa_secret);
    console.log(`[IG 2FA] Fresh code: ${freshCode}`);

    await tfaInput.click({ clickCount: 3 });
    await page.keyboard.type(freshCode, { delay: 50 });
    await page.waitForTimeout(500);

    // Click confirm again
    for (const btn of allButtons) {
      try {
        const text = await btn.textContent().catch(() => '');
        if (text.match(/confirm|verificar|confirmar|verify/i) && await btn.isVisible({ timeout: 500 })) {
          await btn.click();
          break;
        }
      } catch { /* skip */ }
    }

    await page.waitForTimeout(8000);

    const finalUrl = page.url();
    if (!finalUrl.includes('two_factor') && !finalUrl.includes('accounts/login')) {
      if (loginSuccessCallback) loginSuccessCallback(profile.id);
      console.log(`[IG 2FA] === ${profile.name} LOGGED IN (retry) ===`);
    } else {
      console.log(`[IG 2FA] FAILED — could not complete 2FA for ${profile.name}`);
    }

  } catch (err) {
    console.log(`[IG 2FA] ERROR: ${err.message}`);
  }
}

let loginSuccessCallback = null;
let loginFailCallback = null;

function onLoginSuccess(callback) {
  loginSuccessCallback = callback;
}

function onLoginFail(callback) {
  loginFailCallback = callback;
}

function setCapsolverKey(key) {
  capsolverApiKey = key || '';
}

function getCapsolverKey() {
  return capsolverApiKey;
}

module.exports = { launchBrowser, closeBrowser, getActiveBrowsers, onLoginSuccess, onLoginFail, setCapsolverKey, getCapsolverKey };
