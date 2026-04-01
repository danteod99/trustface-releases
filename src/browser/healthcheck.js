const { getActiveBrowsers } = require('./manager');

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getPage(profileId) {
  const entry = getActiveBrowsers().get(profileId);
  if (!entry) return null;
  return entry.context.pages()[0] || null;
}

// ─── Account Health Check ──────────────────────────────────────────

async function checkAccountHealth(profileId) {
  const page = getPage(profileId);
  if (!page) return { status: 'error', message: 'Navegador no abierto' };

  try {
    // Navigate to Facebook settings to check account status
    await page.goto('https://www.facebook.com/settings/', {
      waitUntil: 'load', timeout: 15000,
    });
    await page.waitForTimeout(3000);

    const url = page.url();

    // Check if redirected to login (session expired)
    if (url.includes('/login') || url.includes('checkpoint/start')) {
      return { status: 'error', message: 'Sesion expirada — necesita re-login' };
    }

    // Check if on checkpoint page (verification required)
    if (url.includes('checkpoint')) {
      return { status: 'challenge', message: 'Cuenta requiere verificacion (checkpoint)' };
    }

    // Check if account is disabled/suspended
    if (url.includes('disabled') || url.includes('suspended') || url.includes('account_status')) {
      return { status: 'banned', message: 'Cuenta suspendida o deshabilitada' };
    }

    // Navigate to feed to check for action blocks
    await page.goto('https://www.facebook.com/', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check for restriction/block messages
    const blockTexts = [
      'You\'re Temporarily Blocked',
      'Your Account Has Been Disabled',
      'Account Restricted',
      'We restrict certain activity',
      'Try Again Later',
      'Action Blocked',
      'Temporarily Blocked',
      'Tu cuenta ha sido deshabilitada',
      'Cuenta restringida',
      'Bloqueado temporalmente',
      'Intentalo mas tarde',
      'Restringimos ciertas actividades',
    ];

    for (const text of blockTexts) {
      try {
        const el = page.locator(`text="${text}"`).first();
        if (await el.isVisible({ timeout: 1000 })) {
          return { status: 'action_blocked', message: `Acciones bloqueadas: ${text}` };
        }
      } catch { /* not found */ }
    }

    // If we got here, account seems fine
    return { status: 'ok', message: 'Cuenta activa y funcionando' };

  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

// ─── Restriction Check (Facebook equivalent of Shadowban) ─────────

async function checkShadowban(profileId) {
  const page = getPage(profileId);
  if (!page) return { shadowbanned: false, checks: {}, message: 'Navegador no abierto' };

  const checks = { marketplace: true, groups: true, messaging: true };

  try {
    // 1. Check Marketplace access
    await page.goto('https://www.facebook.com/marketplace/', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(3000);
    const marketUrl = page.url();
    if (marketUrl.includes('/login') || marketUrl.includes('checkpoint') || !marketUrl.includes('marketplace')) {
      checks.marketplace = false;
    }
    // Check for marketplace restriction message
    try {
      const restrictText = await page.evaluate(() => {
        const body = document.body?.innerText || '';
        if (body.includes('restricted') || body.includes('restringid') ||
            body.includes('can\'t use Marketplace') || body.includes('no puedes usar')) {
          return true;
        }
        return false;
      });
      if (restrictText) checks.marketplace = false;
    } catch { /* ignore */ }

    // 2. Check Groups access
    await page.goto('https://www.facebook.com/groups/feed/', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(3000);
    const groupsUrl = page.url();
    if (groupsUrl.includes('/login') || groupsUrl.includes('checkpoint')) {
      checks.groups = false;
    }

    // 3. Check Messaging access
    try {
      await page.goto('https://www.facebook.com/messages/', { waitUntil: 'load', timeout: 10000 });
      await page.waitForTimeout(2000);
      const msgUrl = page.url();
      checks.messaging = !msgUrl.includes('/login') && !msgUrl.includes('checkpoint');

      // Check for messaging restriction
      const msgRestricted = await page.evaluate(() => {
        const body = document.body?.innerText || '';
        return body.includes('can\'t send messages') || body.includes('no puedes enviar mensajes') ||
               body.includes('messaging restricted') || body.includes('mensajes restringidos');
      }).catch(() => false);
      if (msgRestricted) checks.messaging = false;
    } catch {
      checks.messaging = false;
    }

    const shadowbanned = !checks.marketplace || !checks.groups;
    const partial = !checks.messaging && checks.marketplace && checks.groups;

    let message = 'Cuenta limpia — sin restricciones detectadas';
    if (shadowbanned) {
      message = 'Restricciones detectadas — Marketplace o Grupos bloqueados';
    } else if (partial) {
      message = 'Posible restriccion — mensajeria limitada';
    }

    return { shadowbanned, checks, message };

  } catch (err) {
    return { shadowbanned: false, checks, message: `Error verificando: ${err.message}` };
  }
}

module.exports = { checkAccountHealth, checkShadowban };
