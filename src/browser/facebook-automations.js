/**
 * Facebook Automations for TrustFace Desktop
 * Handles: Marketplace, Groups, Pages, Messenger, Posts, Engagement
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// ── Persistent image usage registry ──
// Stores which images have been published to Marketplace (persists across sessions)
const USED_IMAGES_FILE = path.join(
  (app ? app.getPath('userData') : path.join(require('os').homedir(), '.trustface')),
  'marketplace-used-images.json'
);

function loadUsedImages() {
  try {
    if (fs.existsSync(USED_IMAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(USED_IMAGES_FILE, 'utf8'));
      return new Set(data);
    }
  } catch (err) {
    console.log(`[Photos] Error loading used images registry: ${err.message}`);
  }
  return new Set();
}

function saveUsedImages(usedSet) {
  try {
    const dir = path.dirname(USED_IMAGES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USED_IMAGES_FILE, JSON.stringify([...usedSet], null, 2));
  } catch (err) {
    console.log(`[Photos] Error saving used images registry: ${err.message}`);
  }
}

/**
 * Resolve photos from paths — supports folders (picks random unused jpg/png)
 * and individual files. Tracks published images persistently so Marketplace
 * never gets a repeated image.
 */
function resolvePhotos(photoPaths, maxPhotos = 1) {
  const usedImages = loadUsedImages();
  const resolved = [];

  for (const p of photoPaths) {
    const trimmed = p.trim();
    if (!trimmed) continue;

    try {
      const stat = fs.statSync(trimmed);
      if (stat.isDirectory()) {
        const allFiles = fs.readdirSync(trimmed)
          .filter(f => /\.(jpe?g|png)$/i.test(f))
          .map(f => path.join(trimmed, f));

        // Filter out already published images
        const available = allFiles.filter(f => !usedImages.has(f));

        console.log(`[Photos] Folder "${trimmed}": ${allFiles.length} total, ${available.length} available, ${allFiles.length - available.length} already published`);

        if (available.length === 0) {
          console.log(`[Photos] WARNING: ALL ${allFiles.length} images in this folder have been published before`);
          console.log(`[Photos] Marketplace may reject repeated images. No unused images available.`);
          // Don't pick any — Marketplace will reject them anyway
          continue;
        }

        // Shuffle available and pick
        for (let i = available.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [available[i], available[j]] = [available[j], available[i]];
        }
        const picks = available.slice(0, maxPhotos);
        picks.forEach(f => usedImages.add(f));
        resolved.push(...picks);

        console.log(`[Photos] Picked: ${picks.map(f => path.basename(f)).join(', ')} (${available.length - picks.length} remaining after this)`);

      } else if (stat.isFile() && /\.(jpe?g|png)$/i.test(trimmed)) {
        if (usedImages.has(trimmed)) {
          console.log(`[Photos] WARNING: "${path.basename(trimmed)}" was already published — Marketplace may reject it`);
        }
        resolved.push(trimmed);
        usedImages.add(trimmed);
      }
    } catch (err) {
      console.log(`[Photos] Error with "${trimmed}": ${err.message}`);
    }
  }

  // Save updated registry
  saveUsedImages(usedImages);

  return resolved;
}

/**
 * Reset the used images registry (call when user wants to start fresh)
 */
function resetUsedImages() {
  try {
    if (fs.existsSync(USED_IMAGES_FILE)) {
      fs.unlinkSync(USED_IMAGES_FILE);
    }
    console.log(`[Photos] Used images registry cleared`);
  } catch (err) {
    console.log(`[Photos] Error clearing registry: ${err.message}`);
  }
}

/**
 * Get stats about used images for a folder
 */
function getImageStats(folderPath) {
  const usedImages = loadUsedImages();
  try {
    const allFiles = fs.readdirSync(folderPath)
      .filter(f => /\.(jpe?g|png)$/i.test(f))
      .map(f => path.join(folderPath, f));
    const available = allFiles.filter(f => !usedImages.has(f));
    return {
      total: allFiles.length,
      used: allFiles.length - available.length,
      available: available.length,
    };
  } catch {
    return { total: 0, used: 0, available: 0 };
  }
}

const FB_URLS = {
  home: 'https://www.facebook.com/',
  marketplace: 'https://www.facebook.com/marketplace/',
  marketplaceCreate: 'https://www.facebook.com/marketplace/create/item/',
  groups: 'https://www.facebook.com/groups/',
  messenger: 'https://www.facebook.com/messages/',
  profile: 'https://www.facebook.com/me/',
};

// ── Helper: Check if session is active (not redirected to login) ──
async function checkNotLoggedIn(page) {
  const url = page.url();
  if (url.includes('/login') || url.includes('checkpoint') || url.includes('two_factor') || url.includes('two_step')) {
    console.log(`[Session] NOT logged in — redirected to ${url}`);
    return true;
  }
  return false;
}

// ── Marketplace: Create Listing ──
async function marketplaceCreateListing(page, rawListing) {
  // Map from component keys (mpTitle, mpPrice...) to standard keys (title, price...)
  const listing = {
    title: rawListing.title || rawListing.mpTitle,
    price: rawListing.price || rawListing.mpPrice,
    currency: rawListing.currency || rawListing.mpCurrency || 'USD',
    description: rawListing.description || rawListing.mpDescription,
    category: rawListing.category || rawListing.mpCategory,
    condition: rawListing.condition || rawListing.mpCondition,
    location: rawListing.location || rawListing.mpLocation,
    photos: Array.isArray(rawListing.mpPhotos) ? rawListing.mpPhotos
      : Array.isArray(rawListing.photos) ? rawListing.photos
      : typeof rawListing.photos === 'string' ? rawListing.photos.split(',').map(p => p.trim()).filter(Boolean)
      : typeof rawListing.mpPhotos === 'string' ? rawListing.mpPhotos.split(',').map(p => p.trim()).filter(Boolean)
      : [],
    autoPublish: rawListing.autoPublish,
  };
  console.log(`[MP Create] Starting — title: "${listing.title}", price: ${listing.price}`);

  await page.goto(FB_URLS.marketplaceCreate, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if session expired — not logged in
  if (await checkNotLoggedIn(page)) {
    return { success: false, error: 'Sesion no iniciada — cerrando navegador', closeBrowser: true };
  }

  // Check for listing limit / restrictions
  await page.waitForTimeout(3000);
  const limitCheck = await page.evaluate(() => {
    const body = (document.body.innerText || '').toLowerCase();
    const limitPhrases = [
      'limit reached', 'límite alcanzado', 'limite atingido', 'limite atteint',
      'not able to create', 'no puedes crear', 'não pode criar',
      'we limit how often', 'limitamos la frecuencia',
      'can\'t create listing', 'no puedes publicar',
      'temporarily blocked', 'bloqueado temporalmente',
      'marketplace restrictions', 'restricciones de marketplace',
      'you\'re restricted', 'estás restringido',
    ];
    for (const phrase of limitPhrases) {
      if (body.includes(phrase)) return phrase;
    }
    return null;
  }).catch(() => null);

  if (limitCheck) {
    console.log(`[MP Create] BLOCKED — Account limit reached: "${limitCheck}"`);
    return { success: false, error: `Cuenta bloqueada para publicar — "${limitCheck}"` };
  }

  // Wait for Facebook SPA to render the form
  console.log(`[MP Create] Waiting for form to render...`);
  for (let i = 0; i < 15; i++) {
    const inputCount = await page.locator('input, [contenteditable="true"], [role="textbox"]').count().catch(() => 0);
    if (inputCount >= 2) {
      console.log(`[MP Create] Form rendered (${inputCount} inputs found)`);
      break;
    }
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);

  // ── Upload photos ──
  if (listing.photos && listing.photos.length > 0) {
    // Resolve folders to individual image files
    const resolvedPhotos = resolvePhotos(listing.photos, 2);
    if (resolvedPhotos.length > 0) {
      console.log(`[MP Create] Uploading ${resolvedPhotos.length} photo(s): ${resolvedPhotos.map(f => path.basename(f)).join(', ')}`);
      const fileInputs = await page.locator('input[type="file"]').all();
      console.log(`[MP Create] Found ${fileInputs.length} file input(s)`);
      let uploaded = false;
      for (const fi of fileInputs) {
        try {
          await fi.setInputFiles(resolvedPhotos);
          console.log(`[MP Create] Photos uploaded successfully`);
          uploaded = true;
          await page.waitForTimeout(3000);
          break;
        } catch (err) {
          console.log(`[MP Create] File input error: ${err.message}`);
        }
      }
      if (!uploaded) {
        console.log(`[MP Create] FAILED — Could not upload photos`);
        return { success: false, error: 'No se pudieron subir las fotos' };
      }
    } else {
      console.log(`[MP Create] FAILED — No images available (all already published or invalid path)`);
      return { success: false, error: 'No hay imagenes disponibles — todas ya fueron publicadas o la ruta es invalida' };
    }
  }

  // ── Helper: find and fill a field by label text or aria-label ──
  async function fillField(fieldNames, value, fieldType = 'input') {
    if (!value) return false;

    // Strategy 1: Find by aria-label
    for (const name of fieldNames) {
      try {
        const input = page.locator(`[aria-label*="${name}" i]`).first();
        if (await input.isVisible({ timeout: 500 })) {
          await input.click();
          await page.waitForTimeout(300);
          await input.fill(String(value));
          console.log(`[MP Create] Filled "${name}" with "${value}" (aria-label)`);
          return true;
        }
      } catch { /* next */ }
    }

    // Strategy 2: Find by placeholder
    for (const name of fieldNames) {
      try {
        const input = page.locator(`[placeholder*="${name}" i]`).first();
        if (await input.isVisible({ timeout: 500 })) {
          await input.click();
          await page.waitForTimeout(300);
          await input.fill(String(value));
          console.log(`[MP Create] Filled "${name}" with "${value}" (placeholder)`);
          return true;
        }
      } catch { /* next */ }
    }

    // Strategy 3: Find label text and click the associated input via page.evaluate
    const filled = await page.evaluate(({ names, val }) => {
      // Find all labels/spans and look for matching text
      const labels = document.querySelectorAll('label, span[dir="auto"], span');
      for (const name of names) {
        for (const label of labels) {
          const text = (label.innerText || label.textContent || '').trim().toLowerCase();
          if (text === name.toLowerCase() || text.includes(name.toLowerCase())) {
            // Look for nearby input
            const container = label.closest('div[class]') || label.parentElement;
            if (container) {
              const input = container.querySelector('input, [contenteditable="true"], textarea');
              if (input) {
                input.focus();
                input.click();
                // For contenteditable
                if (input.getAttribute('contenteditable') === 'true') {
                  input.innerText = val;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                  // For regular input - use native setter to trigger React
                  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                  if (nativeSetter) {
                    nativeSetter.call(input, val);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                  } else {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }
                return `Filled via label "${text}"`;
              }
            }
          }
        }
      }
      return null;
    }, { names: fieldNames, val: String(value) }).catch(() => null);

    if (filled) {
      console.log(`[MP Create] ${filled} with "${value}"`);
      return true;
    }

    console.log(`[MP Create] Could not find field: ${fieldNames.join(', ')}`);
    return false;
  }

  // ── Debug: Log all visible form fields ──
  const formDebug = await page.evaluate(() => {
    const results = [];
    // All inputs
    document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      results.push({
        tag: el.tagName,
        type: el.type || '',
        name: el.name || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        placeholder: el.placeholder || '',
        role: el.getAttribute('role') || '',
        contentEditable: el.getAttribute('contenteditable') || '',
      });
    });
    // All labels/spans that might be field labels
    document.querySelectorAll('label, span[dir="auto"]').forEach(el => {
      const text = (el.innerText || '').trim();
      if (text.length > 1 && text.length < 50) {
        results.push({ tag: 'LABEL', text });
      }
    });
    return results;
  }).catch(() => []);
  console.log(`[MP Create] Form fields found:`);
  formDebug.forEach(f => console.log(`[MP Create]   ${JSON.stringify(f)}`));

  // ── Fill Title ──
  await fillField([
    'Title', 'Título', 'Titulo', 'Titre', 'Título do anúncio', 'Titel',
    'Titolo', 'Tytuł', 'Заголовок', 'العنوان', '标题', 'タイトル', '제목', 'Tiêu đề', 'Başlık',
  ], listing.title);
  await page.waitForTimeout(500);

  // ── Fill Price ──
  await fillField([
    'Price', 'Precio', 'Prix', 'Preço', 'Preis', 'Prezzo', 'Cena',
    'Цена', 'السعر', '价格', '価格', '가격', 'Giá', 'Fiyat',
  ], listing.price);
  await page.waitForTimeout(500);

  // ── Select Currency (if currency selector exists) ──
  if (listing.currency && listing.currency !== 'USD') {
    console.log(`[MP Create] Setting currency: ${listing.currency}`);
    const currencySet = await page.evaluate((currency) => {
      // Look for currency selector/dropdown near the price field
      const currencySymbols = {
        'USD': ['$', 'USD'], 'EUR': ['€', 'EUR'], 'GBP': ['£', 'GBP'],
        'MXN': ['$', 'MXN'], 'PEN': ['S/', 'PEN'], 'ARS': ['$', 'ARS'],
        'COP': ['$', 'COP'], 'CLP': ['$', 'CLP'], 'BRL': ['R$', 'BRL'],
        'DOP': ['RD$', 'DOP'], 'CAD': ['$', 'CAD'], 'AUD': ['$', 'AUD'],
      };

      // Find any clickable element that shows a currency code/symbol near price
      const allEls = document.querySelectorAll('span, div[role="button"], select, [role="combobox"]');
      for (const el of allEls) {
        const text = (el.innerText || el.textContent || '').trim();
        // Current currency display (like "$ USD" or just "$")
        if (text.match(/^[\$€£]|USD|EUR|GBP|S\/|R\$|RD\$/)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.width < 200) {
            el.click();
            return 'clicked-currency-selector';
          }
        }
      }

      // Also try select elements
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        const options = Array.from(sel.options).map(o => o.value.toUpperCase());
        if (options.some(o => ['USD', 'EUR', 'GBP', 'MXN', 'PEN'].includes(o))) {
          sel.value = currency;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'set-via-select';
        }
      }
      return null;
    }, listing.currency).catch(() => null);

    if (currencySet === 'clicked-currency-selector') {
      await page.waitForTimeout(1000);
      // Search for the target currency in the dropdown
      const targets = [listing.currency];
      for (const target of targets) {
        try {
          const opt = page.locator(`[role="option"]:has-text("${target}"), [role="menuitem"]:has-text("${target}"), li:has-text("${target}"), span:has-text("${target}")`).first();
          if (await opt.isVisible({ timeout: 2000 })) {
            await opt.click();
            console.log(`[MP Create] Currency selected: ${target}`);
            break;
          }
        } catch { /* next */ }
      }
      // If dropdown didn't work, try typing
      await page.keyboard.type(listing.currency, { delay: 30 });
      await page.waitForTimeout(1000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
    } else if (currencySet) {
      console.log(`[MP Create] Currency ${currencySet}: ${listing.currency}`);
    } else {
      console.log(`[MP Create] No currency selector found — Facebook may use account's default currency`);
    }
  }

  // ── Select Category ──
  if (listing.category) {
    console.log(`[MP Create] Setting category: ${listing.category}`);
    // Map categories to search terms
    const catMap = {
      'Electronica': ['electronic', 'electrónic', 'électroniq', 'eletrônic'],
      'Vehiculos': ['vehicle', 'vehículo', 'véhicule', 'veículo', 'auto', 'car'],
      'Hogar y Jardin': ['home', 'hogar', 'maison', 'lar', 'garden', 'jardín'],
      'Ropa y Accesorios': ['clothing', 'ropa', 'vêtement', 'roupa', 'apparel'],
      'Deportes': ['sport', 'deporte', 'esporte'],
      'Juguetes': ['toy', 'juguete', 'jouet', 'brinquedo'],
      'Instrumentos Musicales': ['music', 'instrument', 'musical'],
      'Otra': ['misc', 'other', 'otra', 'autre', 'outro'],
    };
    const catTerms = catMap[listing.category] || [listing.category.toLowerCase()];

    // Open dropdown
    const catOpened = await page.evaluate(() => {
      const catLabels = ['category', 'categoría', 'categoria', 'catégorie', 'kategorie', 'الفئة', '分类', 'カテゴリ', '카테고리'];
      const labels = document.querySelectorAll('label, span[dir="auto"], span');
      for (const label of labels) {
        const text = (label.innerText || '').trim().toLowerCase();
        if (!catLabels.some(c => text.includes(c))) continue;
        const container = label.closest('div[class]')?.parentElement || label.closest('div[class]') || label.parentElement;
        if (!container) continue;
        const clickable = container.querySelector('[role="combobox"], [role="button"], [aria-haspopup], select');
        if (clickable) { clickable.click(); return 'opened'; }
        container.click();
        return 'clicked-container';
      }
      return null;
    }).catch(() => null);

    if (catOpened) {
      console.log(`[MP Create] Category dropdown ${catOpened}`);
      await page.waitForTimeout(2000);

      // Log ALL clickable elements that appeared (Facebook may not use role="option")
      const catOptions = await page.evaluate(() => {
        const results = [];
        // Check for role="option" and role="menuitem"
        document.querySelectorAll('[role="option"], [role="menuitem"]').forEach(o => {
          if (o.getBoundingClientRect().width > 20) results.push({ type: 'option', text: (o.innerText || '').trim() });
        });
        // Check for any new menu/listbox/popup that appeared
        document.querySelectorAll('[role="menu"] div, [role="listbox"] div, [role="dialog"] div').forEach(o => {
          const r = o.getBoundingClientRect();
          const text = (o.innerText || '').trim();
          if (r.width > 60 && r.height > 15 && r.height < 50 && text.length > 2 && text.length < 40 && !results.find(x => x.text === text)) {
            results.push({ type: 'menu-div', text });
          }
        });
        return results.slice(0, 20);
      }).catch(() => []);
      console.log(`[MP Create] Category options: ${JSON.stringify(catOptions)}`);

      // Use Playwright locators (triggers React events properly, unlike evaluate click)
      let catSelected = false;

      // Try each search term with Playwright locator
      for (const term of catTerms) {
        try {
          // Try role="option" first, then any text match
          for (const sel of [`[role="option"]:has-text("${term}")`, `[role="menuitem"]:has-text("${term}")`, `span:has-text("${term}")`]) {
            try {
              const opt = page.locator(sel).first();
              if (await opt.isVisible({ timeout: 500 })) {
                await opt.click({ force: true });
                console.log(`[MP Create] Category selected: "${term}" (${sel})`);
                catSelected = true;
                break;
              }
            } catch { /* next selector */ }
          }
          if (catSelected) break;
        } catch { /* next term */ }
      }

      // Fallback: try full category names from the options list
      if (!catSelected && catOptions.length > 0) {
        const fullNames = catOptions.map(o => o.text.split('\n')[0].trim());
        for (const name of fullNames) {
          const nameLower = name.toLowerCase();
          if (catTerms.some(t => nameLower.includes(t))) {
            try {
              const opt = page.locator(`span:has-text("${name}"), div:has-text("${name}")`).first();
              if (await opt.isVisible({ timeout: 500 })) {
                await opt.click({ force: true });
                console.log(`[MP Create] Category selected: "${name}" (fullname match)`);
                catSelected = true;
                break;
              }
            } catch { /* next */ }
          }
        }
      }

      if (!catSelected) {
        // Last resort: type to search
        console.log(`[MP Create] Category trying keyboard search: "${catTerms[0]}"...`);
        await page.keyboard.type(catTerms[0], { delay: 50 });
        await page.waitForTimeout(2000);
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);
        await page.keyboard.press('Enter');
        console.log(`[MP Create] Category keyboard fallback`);
      }
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }

  // ── Select Condition ──
  if (listing.condition) {
    console.log(`[MP Create] Setting condition: ${listing.condition}`);
    const condMap = {
      'Nuevo': 0,        // First option = New
      'Como nuevo': 1,   // Second = Used - Like New
      'Buen estado': 2,  // Third = Used - Good
      'Aceptable': 3,    // Fourth = Used - Fair
    };
    const condIndex = condMap[listing.condition] ?? 0;

    // Facebook Condition is a custom dropdown. Find it and interact with it.
    const condSet = await page.evaluate((targetIndex) => {
      const condLabels = ['condition', 'estado', 'condición', 'état', 'condição', 'zustand', 'الحالة', '状况', '状態', '상태'];
      const labels = document.querySelectorAll('label, span[dir="auto"], span');

      for (const label of labels) {
        const text = (label.innerText || '').trim().toLowerCase();
        if (!condLabels.some(c => text === c || text.includes(c))) continue;

        const container = label.closest('div[class]')?.parentElement || label.closest('div[class]') || label.parentElement;
        if (!container) continue;

        // Strategy 1: Native <select> element
        const select = container.querySelector('select');
        if (select) {
          select.selectedIndex = Math.min(targetIndex, select.options.length - 1);
          select.dispatchEvent(new Event('change', { bubbles: true }));
          return `native-select: index ${targetIndex} = "${select.options[select.selectedIndex]?.text}"`;
        }

        // Strategy 2: React combobox/dropdown — click to open
        const clickable = container.querySelector('[role="combobox"], [role="button"], [aria-haspopup]');
        if (clickable) {
          clickable.click();
          return 'opened-combobox';
        }

        // Strategy 3: Click the container area that looks like a dropdown
        const divs = container.querySelectorAll('div');
        for (const div of divs) {
          const r = div.getBoundingClientRect();
          const style = window.getComputedStyle(div);
          if (r.width > 80 && r.height > 25 && r.height < 60 && style.cursor === 'pointer') {
            div.click();
            return 'clicked-div-dropdown';
          }
        }

        container.click();
        return 'clicked-container';
      }
      return null;
    }, condIndex).catch(() => null);

    console.log(`[MP Create] Condition step 1: ${condSet}`);

    if (condSet && condSet !== 'native-select') {
      await page.waitForTimeout(2000);

      // Log what options appeared
      const visibleOptions = await page.evaluate(() => {
        const opts = document.querySelectorAll('[role="option"], [role="menuitem"], [role="listbox"] [role="option"]');
        return Array.from(opts).map(o => ({ text: (o.innerText || '').trim(), w: o.getBoundingClientRect().width, h: o.getBoundingClientRect().height })).filter(o => o.w > 0);
      }).catch(() => []);
      console.log(`[MP Create] Condition options visible: ${JSON.stringify(visibleOptions)}`);

      // Click the option at the target index
      const condSearchTerms = {
        'Nuevo': ['new', 'nuevo', 'neuf', 'novo', 'neu'],
        'Como nuevo': ['like new', 'como nuevo', 'comme neuf'],
        'Buen estado': ['good', 'buen estado', 'bon état'],
        'Aceptable': ['fair', 'aceptable', 'état correct'],
      }[listing.condition] || [listing.condition.toLowerCase()];

      // Use Playwright locators for proper React event handling
      let condSelected = false;
      const condClickTerms = {
        'Nuevo': ['New', 'Nuevo', 'Neuf', 'Novo'],
        'Como nuevo': ['Like New', 'Como nuevo', 'Comme neuf'],
        'Buen estado': ['Good', 'Buen estado', 'Bon état'],
        'Aceptable': ['Fair', 'Aceptable', 'État correct'],
      }[listing.condition] || [listing.condition];

      for (const term of condClickTerms) {
        try {
          const opt = page.locator(`[role="option"]:has-text("${term}")`).first();
          if (await opt.isVisible({ timeout: 500 })) {
            await opt.click({ force: true });
            console.log(`[MP Create] Condition selected: "${term}"`);
            condSelected = true;
            break;
          }
        } catch { /* next */ }
      }

      if (!condSelected) {
        // Keyboard fallback
        for (let i = 0; i <= condIndex; i++) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(200);
        }
        await page.keyboard.press('Enter');
        console.log(`[MP Create] Condition keyboard fallback (index ${condIndex})`);
      }
      await page.waitForTimeout(500);
      await page.evaluate(() => document.body.click());
      await page.waitForTimeout(300);
    } else if (!condSet) {
      console.log(`[MP Create] Could not find condition dropdown`);
    }
  }

  // ── Fill Description ──
  if (listing.description) {
    // Description is often a contenteditable div or textarea, not a regular input
    let descFilled = await fillField([
      'Description', 'Descripción', 'Descripcion', 'Descrição', 'Description du produit', 'More details', 'Más detalles',
      'Beschreibung', 'Descrizione', 'Opis', 'Описание', 'الوصف', '描述', '説明', '설명', 'Mô tả', 'Açıklama',
    ], listing.description);
    if (!descFilled) {
      // Try finding contenteditable/textbox directly
      console.log(`[MP Create] Trying contenteditable for description...`);
      const descResult = await page.evaluate((desc) => {
        // Find all contenteditable or textbox elements that aren't the title
        const editables = document.querySelectorAll('[contenteditable="true"], [role="textbox"], textarea');
        for (const el of editables) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          // Skip if it already has title text or is too small (likely title field)
          if (rect.height < 40) continue;
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          if (ariaLabel.includes('title') || ariaLabel.includes('título') || ariaLabel.includes('titulo')) continue;
          el.focus();
          el.click();
          if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
            el.innerText = desc;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            el.value = desc;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return `Filled contenteditable description (aria: "${ariaLabel}")`;
        }
        return null;
      }, listing.description).catch(() => null);
      if (descResult) console.log(`[MP Create] ${descResult}`);
      else console.log(`[MP Create] Could not fill description`);
    }
    await page.waitForTimeout(500);
  }

  // ── Fill Location ──
  if (listing.location) {
    console.log(`[MP Create] Setting location: ${listing.location}`);
    const cityOnly = listing.location.split(',')[0].trim();

    // Find and click the Location input using Playwright locator
    let locInput = null;
    const locSelectors = [
      'input[aria-label*="Location" i]', 'input[aria-label*="Ubicación" i]',
      'input[aria-label*="location" i]', 'input[placeholder*="location" i]',
      'input[placeholder*="ubicación" i]', 'input[placeholder*="Location" i]',
    ];
    for (const sel of locSelectors) {
      try {
        const inp = page.locator(sel).first();
        if (await inp.isVisible({ timeout: 500 })) {
          locInput = inp;
          console.log(`[MP Create] Location input found: ${sel}`);
          break;
        }
      } catch { /* next */ }
    }

    // Fallback: find by label
    if (!locInput) {
      try {
        locInput = page.locator('label:has-text("Location") input, label:has-text("Ubicación") input, label:has-text("Ubicacion") input').first();
        if (!(await locInput.isVisible({ timeout: 500 }).catch(() => false))) locInput = null;
      } catch { locInput = null; }
    }

    if (locInput) {
      // Use evaluate to focus and clear — avoids overlay interception
      await locInput.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const locInputs = document.querySelectorAll('input[aria-label*="ocation"]');
        for (const inp of locInputs) {
          if (inp.getBoundingClientRect().width > 0) {
            inp.focus();
            inp.click();
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
            if (nativeSetter) { nativeSetter.call(inp, ''); inp.dispatchEvent(new Event('input', { bubbles: true })); }
            break;
          }
        }
      });
      await page.waitForTimeout(300);
      await page.keyboard.type(cityOnly, { delay: 100 });
      console.log(`[MP Create] Typed location: "${cityOnly}"`);

      // Wait for suggestions and click
      let selected = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.waitForTimeout(2500);

        // Try Playwright locator
        try {
          const suggestion = page.locator(`[role="option"]:has-text("${cityOnly}")`).first();
          if (await suggestion.isVisible({ timeout: 1500 })) {
            await suggestion.click({ force: true });
            console.log(`[MP Create] Location selected via locator`);
            selected = true;
            break;
          }
        } catch { /* next */ }

        // Keyboard fallback
        if (attempt >= 1) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
          console.log(`[MP Create] Location selected via keyboard`);
          selected = true;
          break;
        }
      }

      if (!selected) console.log(`[MP Create] WARNING: Could not select location`);
      await page.waitForTimeout(500);
    } else {
      console.log(`[MP Create] Could not find location input`);
    }
  }

  // ── Handle "More details" section if expanded ──
  // Facebook shows optional fields (Brand, Description, Availability) that can block the form
  // We need to either collapse it or skip past it
  console.log(`[MP Create] Checking for "More details" section...`);
  await page.evaluate(() => {
    // Multi-language: "More details" in many languages
    const moreDetailsTexts = [
      'more details', 'más detalles', 'mas detalles', 'plus de détails', 'mehr details',
      'mais detalhes', 'più dettagli', 'meer details', 'daha fazla detay', 'więcej szczegółów',
      'مزيد من التفاصيل', 'подробнее', 'больше деталей', '詳細', '更多详情', '자세한 정보',
      'chi tiết thêm', 'detalii suplimentare',
    ];
    const allElements = document.querySelectorAll('div, span, h3, h4');
    for (const el of allElements) {
      const text = (el.innerText || '').trim().toLowerCase();
      if (moreDetailsTexts.some(t => text.includes(t)) && el.getBoundingClientRect().width > 0) {
        const parent = el.closest('div[class]');
        if (parent) {
          const hasInputs = parent.querySelectorAll('input, textarea, select').length > 2;
          if (hasInputs) {
            el.click();
            return 'collapsed';
          }
        }
      }
    }
    return null;
  }).catch(() => null);
  await page.waitForTimeout(500);

  // ── Scroll down to make sure Publish/Next button is visible ──
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(1000);

  // ── Publish ──
  if (listing.autoPublish !== false) {
    // Facebook Marketplace has multiple steps. We detect what's on screen and act accordingly.
    let published = false;

    for (let step = 0; step < 6; step++) {
      console.log(`[MP Create] Publish step ${step}...`);

      // Scroll to bottom
      for (let s = 0; s < 5; s++) {
        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(300);
      }
      await page.waitForTimeout(1000);

      // Log all visible buttons for debug
      const allBtns = await page.evaluate(() => {
        const btns = document.querySelectorAll('button, div[role="button"]');
        return Array.from(btns)
          .filter(b => { const r = b.getBoundingClientRect(); return r.width > 40 && r.height > 15; })
          .map(b => (b.innerText || '').trim())
          .filter(t => t.length > 0 && t.length < 50);
      }).catch(() => []);
      console.log(`[MP Create] All buttons: ${JSON.stringify(allBtns)}`);

      // Detect what buttons are available and click the right one
      const result = await page.evaluate(() => {
        const publishWords = ['publish', 'publicar', 'publier', 'veröffentlichen', 'опубликовать', 'نشر', '发布', '게시'];
        const nextWords = ['next', 'siguiente', 'suivant', 'weiter', 'próximo', 'далее', 'التالي', '下一步', '다음'];
        const skipWords = ['previous', 'anterior', 'back', 'atrás', 'précédent', 'zurück', 'السابق', '上一步', 'save draft', 'guardar borrador', 'learn more', 'try it', 'boost'];

        const btns = document.querySelectorAll('button, div[role="button"]');
        let publishBtn = null;
        let nextBtn = null;

        for (const btn of btns) {
          const text = (btn.innerText || '').trim();
          const textLower = text.toLowerCase();
          if (text.length < 2 || text.length > 40) continue;
          if (skipWords.some(k => textLower.includes(k))) continue;

          const rect = btn.getBoundingClientRect();
          if (rect.width < 50) continue;

          if (publishWords.some(k => textLower.includes(k))) {
            publishBtn = { el: btn, text };
          } else if (nextWords.some(k => textLower.includes(k))) {
            nextBtn = { el: btn, text };
          }
        }

        // ALWAYS prefer Publish if available
        if (publishBtn) {
          publishBtn.el.scrollIntoView({ behavior: 'instant', block: 'center' });
          publishBtn.el.click();
          return { action: 'publish', text: publishBtn.text };
        }
        if (nextBtn) {
          nextBtn.el.scrollIntoView({ behavior: 'instant', block: 'center' });
          nextBtn.el.click();
          return { action: 'next', text: nextBtn.text };
        }
        return null;
      }).catch(() => null);

      if (!result) {
        console.log(`[MP Create] No Next/Publish button found — stopping`);
        break;
      }

      console.log(`[MP Create] Clicked "${result.text}" (action: ${result.action})`);

      if (result.action === 'publish') {
        await page.waitForTimeout(5000);
        published = true;
        break;
      }

      // Clicked "Next" — wait and check if we actually advanced
      await page.waitForTimeout(3000);

      // Check if page navigated away
      const url = page.url();
      if (!url.includes('marketplace')) {
        console.log(`[MP Create] Navigated away — published`);
        published = true;
        break;
      }

      // Log page text near errors AND field states for debugging
      const pageErrorText = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const lines = body.split('\n').filter(l => l.trim().length > 0);
        const errorLines = lines.filter(l => {
          const lower = l.toLowerCase();
          return lower.includes('please') || lower.includes('required') || lower.includes('invalid') ||
            lower.includes('error') || lower.includes('por favor') || lower.includes('obligatorio') ||
            lower.includes('válid') || lower.includes('enter a valid');
        });
        return errorLines.slice(0, 5).join(' | ');
      }).catch(() => '');
      if (pageErrorText) console.log(`[MP Create] Page errors: ${pageErrorText}`);

      // Log field values to see what's filled vs empty
      const fieldStates = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[type="text"], input[type="number"], textarea, [contenteditable="true"]');
        return Array.from(inputs).filter(i => i.getBoundingClientRect().width > 0).map(i => {
          const label = i.getAttribute('aria-label') || i.getAttribute('placeholder') || i.name || '';
          const val = i.value || i.innerText || '';
          return `${label || 'unknown'}: "${val.substring(0, 30)}"`;
        }).join(' | ');
      }).catch(() => '');
      console.log(`[MP Create] Field states: ${fieldStates}`);

      // Check for validation errors on the page
      const validationErrors = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const errors = [];
        const errorPatterns = [
          /please enter a valid location/i, /ingresa una ubicación válida/i,
          /please upload at least/i, /sube al menos/i,
          /required field/i, /campo obligatorio/i, /campo requerido/i,
          /please enter a valid/i, /please fill/i,
          /this field is required/i, /este campo es obligatorio/i,
        ];
        for (const p of errorPatterns) {
          const match = body.match(p);
          if (match) errors.push(match[0]);
        }
        return errors;
      }).catch(() => []);

      if (validationErrors.length > 0) {
        console.log(`[MP Create] Validation errors: ${validationErrors.join(', ')}`);
        console.log(`[MP Create] Cannot advance — stopping`);
        break;
      }

      // Detect if the page didn't change (same buttons = stuck)
      const newBtns = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('button, div[role="button"]'))
          .filter(b => { const r = b.getBoundingClientRect(); return r.width > 40 && r.height > 15; })
          .map(b => (b.innerText || '').trim())
          .filter(t => t.length > 0 && t.length < 50);
      }).catch(() => []);

      // If "Publish" appeared in the new buttons, we advanced
      const publishWords = ['publish', 'publicar', 'publier', 'veröffentlichen', 'نشر', '发布'];
      const hasPublish = newBtns.some(b => publishWords.some(p => b.toLowerCase().includes(p)));
      if (hasPublish) {
        console.log(`[MP Create] "Publish" button appeared — clicking`);
        continue; // Next iteration will click Publish
      }

      // If same buttons as before, we're stuck
      if (step > 0 && JSON.stringify(newBtns) === JSON.stringify(allBtns)) {
        console.log(`[MP Create] Page didn't change after Next — form has errors, stopping`);
        break;
      }
    }

    if (!published) {
      console.log(`[MP Create] Could not find Publish button after all steps`);
    }
  }

  // Verify if the listing was actually published
  await page.waitForTimeout(2000);
  const finalUrl = page.url();
  const pageText = await page.evaluate(() => document.body.innerText || '').catch(() => '');
  const hasError = pageText.toLowerCase().includes('please upload') ||
    pageText.toLowerCase().includes('please enter a valid') ||
    pageText.toLowerCase().includes('required field') ||
    pageText.toLowerCase().includes('sube al menos') ||
    pageText.toLowerCase().includes('ingresa una ubicación válida') ||
    pageText.toLowerCase().includes('campo obligatorio');

  if (hasError) {
    console.log(`[MP Create] FAILED — form has validation errors`);
    return { success: false, error: 'Formulario con errores de validacion (ubicacion, fotos, o campos requeridos)' };
  }

  if (finalUrl.includes('marketplace/create') || finalUrl.includes('marketplace/you')) {
    // Still on create page or redirected to "your listings"
    const isOnCreate = finalUrl.includes('marketplace/create');
    if (isOnCreate) {
      console.log(`[MP Create] FAILED — still on create page`);
      return { success: false, error: 'No se pudo completar la publicacion' };
    }
  }

  console.log(`[MP Create] Done — published successfully`);
  return { success: true };
}

// ── Marketplace: Repost Listing (delete + recreate) ──
async function marketplaceRepost(page, listingUrl, listingData) {
  // Go to listing and delete
  await page.goto(listingUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if session expired — not logged in
  if (await checkNotLoggedIn(page)) {
    return { success: false, error: 'Sesion no iniciada — cerrando navegador', closeBrowser: true };
  }

  const moreBtn = await page.$('[aria-label*="Mas"], [aria-label*="More"]');
  if (moreBtn) {
    await moreBtn.click();
    await page.waitForTimeout(500);
    const deleteBtn = await page.$('text="Eliminar publicacion"');
    if (deleteBtn) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      const confirmBtn = await page.$('text="Eliminar"');
      if (confirmBtn) await confirmBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // Recreate
  return await marketplaceCreateListing(page, listingData);
}

// ── Messenger: Send DM ──
async function sendMessage(page, recipient, message, options = {}) {
  await page.goto(FB_URLS.messenger, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // New message
  const newMsgBtn = await page.$('[aria-label*="Nuevo mensaje"], [aria-label*="New message"]');
  if (newMsgBtn) {
    await newMsgBtn.click();
    await page.waitForTimeout(1000);
  }

  // Search recipient
  const searchInput = await page.$('[aria-label*="Buscar"], [placeholder*="Buscar"], [aria-label*="Search"]');
  if (searchInput) {
    await searchInput.click();
    await searchInput.type(recipient, { delay: humanDelay(30, 80) });
    await page.waitForTimeout(2000);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }

  // Type and send message
  const msgBox = await page.$('[aria-label*="Mensaje"], [aria-label*="Message"], [contenteditable="true"]');
  if (msgBox) {
    await msgBox.click();
    await msgBox.type(message, { delay: humanDelay(20, 60) });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
  }

  return { success: true, recipient };
}

// ── Mass DM ──
async function sendMassDM(page, recipients, message, options = {}) {
  const results = [];
  const templates = Array.isArray(message) ? message : [message];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const template = templates[i % templates.length];
    const personalizedMsg = template
      .replace(/{nombre}/g, recipient.name || recipient)
      .replace(/{usuario}/g, recipient.username || recipient);

    try {
      await sendMessage(page, typeof recipient === 'string' ? recipient : recipient.username, personalizedMsg, options);
      results.push({ recipient, status: 'sent' });
    } catch (err) {
      results.push({ recipient, status: 'error', error: err.message });
    }

    // Random delay between DMs
    const delay = randomBetween(options.minDelay || 30000, options.maxDelay || 120000);
    await page.waitForTimeout(delay);
  }

  return results;
}

// ── Post to Profile/Page ──
async function createPost(page, content, options = {}) {
  const url = options.pageUrl || FB_URLS.home;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Click "What's on your mind?"
  const postBox = await page.$('[aria-label*="que estas pensando"], [aria-label*="What\'s on your mind"], [role="button"]:has-text("que estas pensando")');
  if (postBox) {
    await postBox.click();
    await page.waitForTimeout(1500);
  }

  // Type content
  const editor = await page.$('[contenteditable="true"][role="textbox"]');
  if (editor) {
    await editor.click();
    await editor.type(content.text, { delay: humanDelay(20, 50) });
  }

  // Upload photos
  if (content.photos && content.photos.length > 0) {
    const photoBtn = await page.$('[aria-label*="Foto"], [aria-label*="Photo"]');
    if (photoBtn) {
      await photoBtn.click();
      await page.waitForTimeout(1000);
      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (fileInput) {
        await fileInput.setInputFiles(content.photos);
        await page.waitForTimeout(3000);
      }
    }
  }

  // Publish
  const publishBtn = await page.$('[aria-label*="Publicar"], button:has-text("Publicar"), button:has-text("Post")');
  if (publishBtn) {
    await publishBtn.click();
    await page.waitForTimeout(3000);
  }

  return { success: true };
}

// ── Post to Group ──
async function postToGroup(page, groupUrl, content) {
  await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const writeBox = await page.$('[aria-label*="Escribe algo"], [aria-label*="Write something"]');
  if (writeBox) {
    await writeBox.click();
    await page.waitForTimeout(1500);
  }

  const editor = await page.$('[contenteditable="true"][role="textbox"]');
  if (editor) {
    await editor.click();
    await editor.type(content.text, { delay: humanDelay(20, 50) });
  }

  if (content.photos && content.photos.length > 0) {
    const fileInput = await page.$('input[type="file"][accept*="image"]');
    if (fileInput) {
      await fileInput.setInputFiles(content.photos);
      await page.waitForTimeout(3000);
    }
  }

  const publishBtn = await page.$('button:has-text("Publicar"), button:has-text("Post")');
  if (publishBtn) {
    await publishBtn.click();
    await page.waitForTimeout(3000);
  }

  return { success: true };
}

// ── Engagement: Like Posts ──
async function likePosts(page, targetUrl, maxLikes = 10) {
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  let liked = 0;
  for (let i = 0; i < maxLikes; i++) {
    const likeBtn = await page.$('[aria-label*="Me gusta"]:not([aria-pressed="true"]), [aria-label*="Like"]:not([aria-pressed="true"])');
    if (likeBtn) {
      await likeBtn.click();
      liked++;
      await page.waitForTimeout(randomBetween(2000, 5000));
    }
    // Scroll to load more
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1500);
  }

  return { liked };
}

// ── Engagement: Comment on Posts ──
async function commentOnPosts(page, targetUrl, comments, maxComments = 5) {
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  let commented = 0;
  for (let i = 0; i < maxComments; i++) {
    const commentBtn = await page.$('[aria-label*="Comentar"], [aria-label*="Comment"]');
    if (commentBtn) {
      await commentBtn.click();
      await page.waitForTimeout(1000);

      const commentBox = await page.$('[aria-label*="Escribe un comentario"], [aria-label*="Write a comment"], [contenteditable="true"]');
      if (commentBox) {
        const comment = comments[i % comments.length];
        await commentBox.type(comment, { delay: humanDelay(30, 70) });
        await page.keyboard.press('Enter');
        commented++;
        await page.waitForTimeout(randomBetween(5000, 15000));
      }
    }
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1500);
  }

  return { commented };
}

// ── Share Post ──
async function sharePost(page, postUrl, shareType = 'feed') {
  await page.goto(postUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const shareBtn = await page.$('[aria-label*="Compartir"], [aria-label*="Share"]');
  if (shareBtn) {
    await shareBtn.click();
    await page.waitForTimeout(1000);

    if (shareType === 'feed') {
      const shareNowBtn = await page.$('text="Compartir ahora"');
      if (shareNowBtn) await shareNowBtn.click();
    }
    await page.waitForTimeout(2000);
  }

  return { success: true };
}

// ── Join Group ──
async function joinGroup(page, groupUrl) {
  await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const joinBtn = await page.$('button:has-text("Unirse"), button:has-text("Join")');
  if (joinBtn) {
    await joinBtn.click();
    await page.waitForTimeout(2000);
  }

  return { success: true };
}

// ── Add Friends ──
async function addFriends(page, profileUrls, maxRequests = 20) {
  let sent = 0;
  for (const url of profileUrls.slice(0, maxRequests)) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);
      const addBtn = await page.$('button:has-text("Agregar"), button:has-text("Add Friend")');
      if (addBtn) {
        await addBtn.click();
        sent++;
        await page.waitForTimeout(randomBetween(5000, 15000));
      }
    } catch {}
  }
  return { sent };
}

// ── Scrape Group Members ──
async function scrapeGroupMembers(page, groupUrl, maxMembers = 100) {
  await page.goto(groupUrl + '/members', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const members = [];
  let lastCount = 0;

  while (members.length < maxMembers) {
    const memberElements = await page.$$('[data-visualcompletion="ignore-dynamic"] a[href*="/user/"], [data-visualcompletion="ignore-dynamic"] a[href*="facebook.com/"]');

    for (const el of memberElements) {
      if (members.length >= maxMembers) break;
      try {
        const name = await el.textContent();
        const href = await el.getAttribute('href');
        if (name && href && !members.find(m => m.href === href)) {
          members.push({ name: name.trim(), href, username: href.split('/').pop() });
        }
      } catch {}
    }

    if (members.length === lastCount) break;
    lastCount = members.length;

    await page.evaluate(() => window.scrollBy(0, 1000));
    await page.waitForTimeout(2000);
  }

  return members;
}

// ── Scrape Marketplace Listings ──
async function scrapeMarketplace(page, searchQuery, maxResults = 50) {
  console.log(`[MP Scrape] Starting — query: "${searchQuery}", max: ${maxResults}`);
  const url = `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(searchQuery)}`;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check if session expired — not logged in
  if (await checkNotLoggedIn(page)) {
    return { success: false, error: 'Sesion no iniciada — cerrando navegador', closeBrowser: true };
  }

  // Wait for Facebook SPA to render listings
  console.log(`[MP Scrape] Waiting for listings to render...`);
  for (let i = 0; i < 15; i++) {
    const linkCount = await page.locator('a[href*="/marketplace/item/"]').count().catch(() => 0);
    if (linkCount > 0) {
      console.log(`[MP Scrape] Found ${linkCount} listing links`);
      break;
    }
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2000);

  const listings = [];
  let scrolls = 0;
  let lastCount = 0;

  while (listings.length < maxResults && scrolls < 30) {
    // Extract listings using evaluate for reliability with FB's React DOM
    const newListings = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/marketplace/item/"]');
      for (const link of links) {
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/marketplace/item/')) continue;

        // Get the listing card container — walk up to find a reasonable container
        let container = link;
        for (let i = 0; i < 5; i++) {
          if (container.parentElement && container.parentElement.querySelectorAll('a[href*="/marketplace/item/"]').length <= 1) {
            container = container.parentElement;
          } else break;
        }

        const text = (container.innerText || '').trim();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Extract price — support multiple currency formats
        const priceRegex = /^[\$€£]\s*[\d,.]+|^[\d,.]+\s*(?:USD|EUR|GBP|MXN|PEN|ARS|COP|BRL)|^S\/\s*[\d,.]+|^R\$\s*[\d,.]+|^RD\$\s*[\d,.]+|^Free$|^Gratis$/i;
        let price = '';
        let priceIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (priceRegex.test(lines[i])) {
            price = lines[i];
            priceIdx = i;
            break;
          }
        }

        // Title: first line that is NOT the price, NOT too short, NOT a location/date indicator
        let title = '';
        for (let i = 0; i < lines.length; i++) {
          if (i === priceIdx) continue;
          const line = lines[i];
          if (line.length < 3 || line.length > 200) continue;
          if (priceRegex.test(line)) continue;
          title = line;
          break;
        }

        // Location: usually a line after price+title that contains a city/place name
        // Often has format like "City, State" or just "City"
        let location = '';
        let datePosted = '';
        const skipSet = new Set([priceIdx]);
        if (title) skipSet.add(lines.indexOf(title));
        for (let i = 0; i < lines.length; i++) {
          if (skipSet.has(i)) continue;
          const line = lines[i];
          if (line.length < 2 || line.length > 80) continue;
          if (priceRegex.test(line)) continue;

          // Date indicators (multi-language)
          const datePatterns = /^(listed|posted|publicado|publi[ée]|hace|ago|\d+[hmd]\b|\d+\s*(hour|minute|day|hora|minuto|día|dia|heure|jour|semana|week|mes|month))/i;
          if (datePatterns.test(line) || line.match(/^\d+\s*\w+\s+ago$/i)) {
            datePosted = line;
            continue;
          }

          // Location: usually contains comma or is a short place name after title+price
          if (!location && line !== title && line.length < 60) {
            location = line;
          }
        }

        const fullHref = href.startsWith('/') ? 'https://www.facebook.com' + href : href;
        results.push({
          title: title || lines[0]?.substring(0, 100) || '',
          price,
          location,
          date: datePosted,
          href: fullHref,
          description: lines.slice(0, 5).join(' | ').substring(0, 250),
        });
      }
      return results;
    }).catch(() => []);

    // Deduplicate and add
    for (const item of newListings) {
      if (listings.length >= maxResults) break;
      if (!listings.find(l => l.href === item.href)) {
        listings.push(item);
      }
    }

    if (listings.length === lastCount) {
      scrolls += 3; // Speed up exit if no new results
    }
    lastCount = listings.length;

    // Scroll to load more
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1500);
    scrolls++;

    if (scrolls % 5 === 0) {
      console.log(`[MP Scrape] Progress: ${listings.length}/${maxResults} listings, ${scrolls} scrolls`);
    }
  }

  console.log(`[MP Scrape] Done — ${listings.length} listings scraped`);
  return listings;
}

// ── Marketplace: Deep Scrape (enters each listing for full details) ──
async function deepScrapeMarketplace(page, searchQuery, maxResults = 20) {
  console.log(`[MP Deep] Starting — query: "${searchQuery}", max: ${maxResults}`);

  // First do a normal scrape to get listing URLs
  const basicListings = await scrapeMarketplace(page, searchQuery, maxResults);
  if (basicListings.closeBrowser) return basicListings;
  if (basicListings.length === 0) {
    console.log(`[MP Deep] No listings found`);
    return [];
  }

  console.log(`[MP Deep] Found ${basicListings.length} listings, entering each for details...`);
  const detailedListings = [];

  for (let i = 0; i < basicListings.length; i++) {
    const listing = basicListings[i];
    console.log(`[MP Deep] ${i + 1}/${basicListings.length}: ${listing.title || listing.href}`);

    try {
      await page.goto(listing.href, { waitUntil: 'load', timeout: 20000 });

      // Wait for page to render
      for (let w = 0; w < 10; w++) {
        const txt = await page.locator('body').textContent({ timeout: 2000 }).catch(() => '');
        if (!txt.startsWith('{') && txt.length > 200) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(2000);

      // Extract detailed info from the listing page
      const details = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const lines = body.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const result = {
          title: '',
          price: '',
          currency: '',
          description: '',
          seller: '',
          sellerProfile: '',
          condition: '',
          category: '',
          date: '',
          location: '',
          photos: [],
        };

        // Title: usually in an h1 or the first large heading
        const h1 = document.querySelector('h1, [role="heading"][aria-level="1"]');
        if (h1) result.title = h1.innerText.trim();

        // Price: look for price-like text patterns
        const priceRegex = /^[\$€£]\s*[\d,.]+|^[\d,.]+\s*(?:USD|EUR|GBP|MXN|PEN|ARS|COP|BRL)|^S\/\s*[\d,.]+|^R\$\s*[\d,.]+|^RD\$\s*[\d,.]+|^Free$|^Gratis$/i;
        for (const line of lines) {
          if (priceRegex.test(line) && !result.price) {
            result.price = line;
            // Detect currency
            if (line.includes('$') && !line.includes('S/') && !line.includes('R$') && !line.includes('RD$')) result.currency = 'USD';
            else if (line.includes('€')) result.currency = 'EUR';
            else if (line.includes('£')) result.currency = 'GBP';
            else if (line.includes('S/')) result.currency = 'PEN';
            else if (line.includes('R$')) result.currency = 'BRL';
            else if (line.includes('RD$')) result.currency = 'DOP';
            else if (line.includes('PEN')) result.currency = 'PEN';
            else if (line.includes('MXN')) result.currency = 'MXN';
            else if (line.includes('ARS')) result.currency = 'ARS';
            else if (line.includes('COP')) result.currency = 'COP';
            break;
          }
        }

        // Condition: look for New/Used/Nuevo/Usado etc.
        const condPatterns = /^(new|used|nuevo|usado|como nuevo|like new|buen estado|good|fair|aceptable|neuf|occasion)/i;
        for (const line of lines) {
          if (condPatterns.test(line) && line.length < 30) {
            result.condition = line;
            break;
          }
        }
        // Also check for "Condition" label pattern
        const condLabel = body.match(/(?:Condition|Estado|Condición|État)[:\s]*([^\n]+)/i);
        if (condLabel && !result.condition) result.condition = condLabel[1].trim().substring(0, 30);

        // Category
        const catLabel = body.match(/(?:Category|Categoría|Categoria|Catégorie)[:\s]*([^\n]+)/i);
        if (catLabel) result.category = catLabel[1].trim().substring(0, 50);

        // Date posted
        const datePatterns = /(?:Listed|Posted|Publicado|Publi[ée])\s+(.+?)(?:\s+in\s+|\s+en\s+|$)/i;
        const dateMatch = body.match(datePatterns);
        if (dateMatch) result.date = dateMatch[0].trim().substring(0, 60);
        // Also try relative dates
        if (!result.date) {
          for (const line of lines) {
            if (/^(listed|posted|publicado|hace)\s/i.test(line) && line.length < 60) {
              result.date = line;
              break;
            }
            if (/^\d+\s*(hour|minute|day|week|month|hora|minuto|día|dia|semana|mes|heure|jour)/i.test(line) && line.length < 40) {
              result.date = line;
              break;
            }
          }
        }

        // Location: look for location patterns
        const locLabel = body.match(/(?:Location|Ubicación|Ubicacion|Localisation|Listed in|Publicado en)[:\s]*([^\n]+)/i);
        if (locLabel) result.location = locLabel[1].trim().substring(0, 80);
        // Fallback: look for "City, State" pattern after price
        if (!result.location) {
          for (const line of lines) {
            if (line.match(/^[A-Z][a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+,\s*[A-Z]/) && line.length < 60) {
              result.location = line;
              break;
            }
          }
        }

        // Seller name: usually in a link near "Seller" or after the listing details
        const sellerLinks = document.querySelectorAll('a[href*="/profile.php"], a[href*="facebook.com/"][role="link"]');
        for (const link of sellerLinks) {
          const text = (link.innerText || '').trim();
          if (text.length > 1 && text.length < 50 && !text.match(/marketplace|facebook|share|report/i)) {
            result.seller = text;
            result.sellerProfile = link.href;
            break;
          }
        }

        // Description: look for the main text block after title/price
        // Facebook puts the description in a specific section
        const descLabel = body.match(/(?:Description|Descripción|Descripcion|Details|Detalles|About this item)[:\s]*\n?([^]*?)(?=\n(?:Seller|Vendedor|Location|Ubicación|Condition|Estado|Category|Share|Report)|$)/i);
        if (descLabel) {
          result.description = descLabel[1].trim().substring(0, 500);
        }
        // Fallback: collect text that's not title/price/condition
        if (!result.description) {
          const skipTexts = new Set([result.title, result.price, result.condition, result.date, result.location, result.seller]);
          const descLines = lines.filter(l => l.length > 10 && l.length < 300 && !skipTexts.has(l) && !priceRegex.test(l) && !condPatterns.test(l));
          if (descLines.length > 0) result.description = descLines.slice(0, 5).join('\n').substring(0, 500);
        }

        // Photos: get all large images on the page
        const imgs = document.querySelectorAll('img');
        for (const img of imgs) {
          const rect = img.getBoundingClientRect();
          const src = img.src || '';
          if (rect.width > 150 && rect.height > 150 && (src.includes('scontent') || src.includes('fbcdn'))) {
            result.photos.push(src);
          }
        }

        return result;
      }).catch(() => ({}));

      // Merge basic + detailed data
      detailedListings.push({
        ...listing,
        ...details,
        title: details.title || listing.title,
        price: details.price || listing.price,
        location: details.location || listing.location,
        href: listing.href,
      });

      console.log(`[MP Deep] Extracted: "${details.title}" | ${details.price} | ${details.seller} | ${details.condition} | ${details.photos?.length || 0} photos`);

      // Small delay between listings to avoid rate limiting
      await page.waitForTimeout(randomBetween(1500, 3000));

    } catch (err) {
      console.log(`[MP Deep] Error on listing ${i + 1}: ${err.message}`);
      detailedListings.push(listing); // Keep basic data
    }
  }

  console.log(`[MP Deep] Done — ${detailedListings.length} listings with full details`);
  return detailedListings;
}

// ── Marketplace: Contact Sellers (send message / click "Is this available?") ──
async function contactMarketplaceSellers(page, searchQuery, message, options = {}) {
  const maxContacts = options.maxContacts || 10;
  const minDelay = options.minDelay || 15000;
  const maxDelay = options.maxDelay || 45000;

  const directLinks = options.directLinks || [];
  console.log(`[MP Contact] Starting — query: "${searchQuery}", directLinks: ${directLinks.length}, max: ${maxContacts}, message: "${message}"`);

  let listings;
  if (directLinks.length > 0) {
    // Use direct links instead of scraping
    listings = directLinks.map(href => ({ title: '', href, price: '' }));
    console.log(`[MP Contact] Using ${listings.length} direct links`);
  } else {
    // Scrape listings by search query
    listings = await scrapeMarketplace(page, searchQuery, maxContacts * 2);
    if (listings.closeBrowser) return listings;
    if (listings.length === 0) {
      console.log(`[MP Contact] No listings found for "${searchQuery}"`);
      return { contacted: 0, errors: 0, listings: 0 };
    }
  }
  console.log(`[MP Contact] ${listings.length} listings to contact`);

  let contacted = 0;
  let errors = 0;

  for (const listing of listings) {
    if (contacted >= maxContacts) break;

    try {
      console.log(`[MP Contact] Opening: "${listing.title}" — ${listing.href}`);
      await page.goto(listing.href, { waitUntil: 'load', timeout: 30000 });

      // Wait for page to render
      for (let w = 0; w < 10; w++) {
        const bodyText = await page.locator('body').textContent({ timeout: 2000 }).catch(() => '');
        if (!bodyText.startsWith('{') && bodyText.length > 100) break;
        await page.waitForTimeout(1000);
      }
      await page.waitForTimeout(2000);

      // Strategy 1: Click "Is this still available?" / "Ask if it's still available" / "¿Sigue disponible?"
      const availableTexts = [
        'Is this still available', 'Sigue disponible', '¿Sigue disponible',
        'Is this available', 'Esta disponible', '¿Está disponible',
        'Ask if it', 'Preguntar si', 'Send seller a message',
        'Enviar mensaje al vendedor', 'Message seller', 'Enviar mensaje',
        'Interested', 'Me interesa',
      ];
      let clickedAvailable = false;
      for (const txt of availableTexts) {
        try {
          const btn = page.locator(`button:has-text("${txt}"), div[role="button"]:has-text("${txt}"), a:has-text("${txt}"), span:has-text("${txt}")`).first();
          if (await btn.isVisible({ timeout: 1500 })) {
            await btn.click();
            clickedAvailable = true;
            console.log(`[MP Contact] Clicked: "${txt}"`);
            await page.waitForTimeout(2000);
            break;
          }
        } catch { /* next */ }
      }

      // Fallback: use evaluate to find the button
      if (!clickedAvailable) {
        const evalClicked = await page.evaluate(() => {
          const keywords = ['still available', 'sigue disponible', 'está disponible', 'esta disponible',
            'send message', 'enviar mensaje', 'message seller', 'me interesa', 'interested',
            'ask if', 'preguntar si'];
          const btns = document.querySelectorAll('button, div[role="button"], a[role="button"], span[role="button"]');
          for (const btn of btns) {
            const text = (btn.innerText || '').trim().toLowerCase();
            if (text.length > 3 && text.length < 100 && keywords.some(k => text.includes(k))) {
              btn.click();
              return `eval-clicked: "${text.substring(0, 60)}"`;
            }
          }
          return null;
        }).catch(() => null);
        if (evalClicked) {
          clickedAvailable = true;
          console.log(`[MP Contact] ${evalClicked}`);
          await page.waitForTimeout(2000);
        }
      }

      if (!clickedAvailable) {
        console.log(`[MP Contact] No contact button found for this listing — skipping`);
        errors++;
        continue;
      }

      // If custom message provided, type it in the message box
      if (message && message.trim()) {
        await page.waitForTimeout(1500);

        // Find message input (contenteditable or textarea)
        let msgSent = false;
        const msgBox = page.locator('[contenteditable="true"][role="textbox"], textarea, [aria-label*="message" i], [aria-label*="mensaje" i]').first();
        try {
          if (await msgBox.isVisible({ timeout: 2000 })) {
            await msgBox.click();
            await page.waitForTimeout(300);

            // Clear existing text (like pre-filled "Is this still available?")
            await page.keyboard.press('Meta+a');
            await page.waitForTimeout(200);

            // Type custom message
            await page.keyboard.type(message, { delay: humanDelay(20, 50) });
            await page.waitForTimeout(500);

            // Send — press Enter or click Send button
            let sentViaBtn = false;
            const sendTexts = ['Send', 'Enviar', 'Send message', 'Enviar mensaje'];
            for (const txt of sendTexts) {
              try {
                const sendBtn = page.locator(`button:has-text("${txt}"), div[role="button"]:has-text("${txt}")`).first();
                if (await sendBtn.isVisible({ timeout: 1000 })) {
                  await sendBtn.click();
                  sentViaBtn = true;
                  console.log(`[MP Contact] Sent message via "${txt}" button`);
                  break;
                }
              } catch { /* next */ }
            }
            if (!sentViaBtn) {
              await page.keyboard.press('Enter');
              console.log(`[MP Contact] Sent message via Enter`);
            }
            msgSent = true;
          }
        } catch (err) {
          console.log(`[MP Contact] Error typing message: ${err.message}`);
        }

        if (!msgSent) {
          // The "Is this available" button may have already sent the message
          console.log(`[MP Contact] No message box found — button click may have sent default message`);
        }
      }

      contacted++;
      console.log(`[MP Contact] Contacted ${contacted}/${maxContacts}: "${listing.title}"`);

      // Random delay between contacts
      const delay = randomBetween(minDelay, maxDelay);
      console.log(`[MP Contact] Waiting ${Math.round(delay / 1000)}s before next...`);
      await page.waitForTimeout(delay);

    } catch (err) {
      console.log(`[MP Contact] Error on listing: ${err.message}`);
      errors++;
    }
  }

  console.log(`[MP Contact] Done — ${contacted} contacted, ${errors} errors`);
  return { contacted, errors, listings: listings.length };
}

// ── Reply to Marketplace Messages (template-based) ──
// Same strategy as chatbot but uses a fixed template instead of AI.
async function autoReplyMarketplace(page, replyTemplate) {
  await page.goto('https://www.facebook.com/marketplace/you/selling', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (await checkNotLoggedIn(page)) {
    return { success: false, error: 'Sesion no iniciada — cerrando navegador', closeBrowser: true };
  }

  // Collect listing links
  let listingLinks = await _collectListingLinks(page);
  if (listingLinks.length === 0) {
    return { replied: 0, skipped: 0, errors: 0, message: 'No se encontraron listings en tu pagina de ventas' };
  }

  console.log(`[MP AutoReply] Found ${listingLinks.length} listings`);
  let replied = 0, skipped = 0, errors = 0;

  for (let li = 0; li < listingLinks.length && replied + skipped + errors < 20; li++) {
    try {
      await page.goto(listingLinks[li].href, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(2000);
      if (await checkNotLoggedIn(page)) break;

      // Dismiss PIN prompt if shown
      await _dismissPinPrompt(page);

      let msgBox = await _findMessageBox(page);
      if (!msgBox) {
        await _clickMessageButton(page);
        await page.waitForTimeout(2000);
        await _dismissPinPrompt(page);
        msgBox = await _findMessageBox(page);
      }
      if (!msgBox) { skipped++; continue; }

      // Check last message is not ours
      const lastIsOurs = await _lastMessageIsOurs(page);
      if (lastIsOurs) { skipped++; continue; }

      await msgBox.click();
      await page.waitForTimeout(300);
      await msgBox.type(replyTemplate, { delay: humanDelay(20, 50) });
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      replied++;
      console.log(`[MP AutoReply] Listing ${li + 1}: replied`);
      await page.waitForTimeout(randomBetween(2000, 5000));
    } catch (err) {
      console.log(`[MP AutoReply] Listing ${li + 1}: error — ${err.message}`);
      errors++;
    }
  }

  console.log(`[MP AutoReply] Done — replied: ${replied}, skipped: ${skipped}, errors: ${errors}`);
  return { replied, skipped, errors };
}

// ── Shared helpers for marketplace messaging ──

async function _collectListingLinks(page) {
  // Scroll to load listings
  for (let s = 0; s < 3; s++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(1000);
  }
  return await page.evaluate(() => {
    const links = [];
    const anchors = document.querySelectorAll('a[href*="/marketplace/item/"]');
    for (const a of anchors) {
      const href = a.href || a.getAttribute('href') || '';
      if (href && !links.some(l => l.href === href)) {
        const title = (a.innerText || '').trim().substring(0, 80);
        links.push({ href: href.startsWith('http') ? href : `https://www.facebook.com${href}`, title });
      }
    }
    return links;
  }).catch(() => []);
}

async function _findMessageBox(page) {
  const selectors = [
    '[aria-label*="Mensaje"][contenteditable="true"]',
    '[aria-label*="Message"][contenteditable="true"]',
    '[aria-label*="Aa"][contenteditable="true"]',
    'p[contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"]:not([aria-label*="Buscar"]):not([aria-label*="Search"])',
  ];
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el && await el.isVisible()) return el;
    } catch {}
  }
  return null;
}

async function _clickMessageButton(page) {
  return await page.evaluate(() => {
    const btns = document.querySelectorAll('a, div[role="button"], span[role="button"], button');
    for (const btn of btns) {
      const text = (btn.innerText || '').toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text.includes('message again') || text.includes('enviar mensaje de nuevo') ||
          text.includes('mensaje de nuevo') || text.includes('volver a enviar') ||
          text.includes('mensaje') || text.includes('message') || text.includes('responder') ||
          ariaLabel.includes('mensaje') || ariaLabel.includes('message')) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) { btn.click(); return true; }
      }
    }
    return false;
  }).catch(() => false);
}

// Dismiss Facebook's "Create a PIN" popup for end-to-end encrypted chats
async function _dismissPinPrompt(page) {
  // Try multiple dismiss strategies
  const dismissed = await page.evaluate(() => {
    const body = (document.body.innerText || '').toLowerCase();
    if (!body.includes('create a pin') && !body.includes('crear un pin') && !body.includes('crea un pin')) {
      return 'no-pin';
    }

    // Strategy 1: Click "Not now" / "Ahora no" / "Skip" / close button
    const dismissTexts = ['not now', 'ahora no', 'skip', 'omitir', 'cancelar', 'cancel', 'close', 'cerrar', 'later', 'despues'];
    const allClickable = document.querySelectorAll('a, button, div[role="button"], span[role="button"], [aria-label*="Close"], [aria-label*="Cerrar"]');
    for (const el of allClickable) {
      const text = (el.innerText || '').toLowerCase().trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      for (const dismiss of dismissTexts) {
        if (text.includes(dismiss) || ariaLabel.includes(dismiss)) {
          el.click();
          return `clicked: ${text || ariaLabel}`;
        }
      }
    }

    // Strategy 2: Click X / close button by aria-label
    const closeBtn = document.querySelector('[aria-label="Close"], [aria-label="Cerrar"], [aria-label="close"]');
    if (closeBtn) {
      closeBtn.click();
      return 'clicked: close-btn';
    }

    // Strategy 3: Press Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return 'pressed-escape';
  }).catch(() => 'error');

  if (dismissed && dismissed !== 'no-pin') {
    console.log(`[MP] PIN prompt dismissed: ${dismissed}`);
    await page.waitForTimeout(2000);

    // Check if it's still showing — try pressing Escape as fallback
    const stillShowing = await page.evaluate(() => {
      return (document.body.innerText || '').toLowerCase().includes('create a pin') ||
             (document.body.innerText || '').toLowerCase().includes('crear un pin');
    }).catch(() => false);

    if (stillShowing) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      // Try clicking outside the modal
      await page.mouse.click(10, 10);
      await page.waitForTimeout(1000);
      console.log(`[MP] PIN prompt still showing — tried Escape + click outside`);
    }
  }

  return dismissed;
}

async function _lastMessageIsOurs(page) {
  return await page.evaluate(() => {
    const allText = document.querySelectorAll('div[dir="auto"]');
    if (allText.length === 0) return false;
    const last = allText[allText.length - 1];
    const bubble = last.closest('div[class]');
    if (!bubble) return false;
    const rect = bubble.getBoundingClientRect();
    const viewWidth = window.innerWidth || 360;
    return rect.right > viewWidth * 0.7;
  }).catch(() => false);
}

// ── Marketplace Chatbot (AI-powered auto-reply) ──
// Strategy: Facebook mobile (360px viewport) doesn't support /messages/t/.
// Instead we go to /marketplace/you/selling → click each listing → open buyer chat → read & reply.
async function chatbotMarketplace(page, options = {}) {
  const { instructions, generateResponse, maxConversations = 20 } = options;

  if (!generateResponse) {
    return { success: false, error: 'No se proporcionó función de generación de IA' };
  }

  // Step 1: Go to "Your Selling" page — works on mobile viewport
  await page.goto('https://www.facebook.com/marketplace/you/selling', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (await checkNotLoggedIn(page)) {
    return { success: false, error: 'Sesion no iniciada — cerrando navegador', closeBrowser: true };
  }

  console.log(`[MP Chatbot] On selling page: ${page.url()}`);

  // Step 2: Collect listing links from the selling page
  let listingLinks = await page.evaluate(() => {
    const links = [];
    const anchors = document.querySelectorAll('a[href*="/marketplace/item/"]');
    for (const a of anchors) {
      const href = a.href || a.getAttribute('href') || '';
      if (href && !links.includes(href)) {
        // Get listing title from nearby text
        const title = (a.innerText || '').trim().substring(0, 80);
        links.push({ href: href.startsWith('http') ? href : `https://www.facebook.com${href}`, title });
      }
    }
    return links;
  }).catch(() => []);

  // Scroll to load more listings
  if (listingLinks.length === 0) {
    for (let s = 0; s < 5; s++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1500);
    }
    listingLinks = await page.evaluate(() => {
      const links = [];
      const anchors = document.querySelectorAll('a[href*="/marketplace/item/"]');
      for (const a of anchors) {
        const href = a.href || a.getAttribute('href') || '';
        if (href && !links.some(l => l.href === href)) {
          const title = (a.innerText || '').trim().substring(0, 80);
          links.push({ href: href.startsWith('http') ? href : `https://www.facebook.com${href}`, title });
        }
      }
      return links;
    }).catch(() => []);
  }

  if (listingLinks.length === 0) {
    console.log(`[MP Chatbot] No listings found on selling page`);
    return { replied: 0, skipped: 0, errors: 0, message: 'No se encontraron listings en tu pagina de ventas' };
  }

  console.log(`[MP Chatbot] Found ${listingLinks.length} listings`);

  let replied = 0;
  let skipped = 0;
  let errors = 0;
  let processedConversations = 0;

  // Step 3: Visit each listing and check for buyer messages
  for (let li = 0; li < listingLinks.length && processedConversations < maxConversations; li++) {
    const listing = listingLinks[li];
    try {
      console.log(`[MP Chatbot] Listing ${li + 1}/${listingLinks.length}: ${listing.title || listing.href}`);
      await page.goto(listing.href, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(2000);

      // Check if redirected to login
      if (await checkNotLoggedIn(page)) {
        console.log(`[MP Chatbot] Session lost during navigation`);
        break;
      }

      // Dismiss PIN prompt if shown
      await _dismissPinPrompt(page);

      // Get listing info from the page
      const listingInfo = await page.evaluate(() => {
        const body = document.body.innerText || '';
        let title = '';
        let price = '';
        // Title is usually in a large heading
        const h1 = document.querySelector('h1, [role="heading"]');
        if (h1) title = (h1.innerText || '').trim();
        // Price is often near the top with currency symbols
        const priceMatch = body.match(/[\$S\/][\s]?[\d,.]+|[\d,.]+\s?(?:USD|PEN|MXN|ARS|COP|EUR)/i);
        if (priceMatch) price = priceMatch[0].trim();
        return { title: title || '', price: price || '' };
      }).catch(() => ({ title: listing.title, price: '' }));

      // Look for buyer message threads / "Messages" section on the listing page
      // On mobile, individual listing pages show a "Message" button or existing conversation
      // Try to find and click "See all" messages or individual buyer conversations
      const buyerLinks = await page.evaluate(() => {
        const results = [];
        // Look for message/conversation indicators
        const allLinks = document.querySelectorAll('a[href*="/messages/"], a[href*="messaging"], [role="button"]');
        for (const el of allLinks) {
          const text = (el.innerText || '').toLowerCase().trim();
          if (text.includes('mensaje') || text.includes('message') || text.includes('responder') || text.includes('reply')) {
            results.push({ type: 'button', text });
          }
        }
        // Also look for buyer conversation rows
        const rows = document.querySelectorAll('[role="listitem"], [role="row"]');
        for (const row of rows) {
          const text = (row.innerText || '').trim();
          if (text.length > 2 && text.length < 200) {
            results.push({ type: 'row', text: text.substring(0, 60) });
          }
        }
        return results;
      }).catch(() => []);

      console.log(`[MP Chatbot] Listing has ${buyerLinks.length} message indicators`);

      // Try to open the chat/messaging section
      // On mobile Facebook, clicking on a listing as seller shows buyer conversations
      // Look for the messaging area or chat popup

      // First, try to find the message input directly (some listings show inline chat)
      let msgBox = await _findMessageBox(page);

      if (!msgBox) {
        const clickedMsg = await _clickMessageButton(page);
        if (clickedMsg) {
          console.log(`[MP Chatbot] Clicked message button`);
          await page.waitForTimeout(3000);
          await _dismissPinPrompt(page);
          msgBox = await _findMessageBox(page);
        }
      }

      if (!msgBox) {
        // No chat found on this listing — might have no messages
        console.log(`[MP Chatbot] Listing ${li + 1}: no chat found — skipping`);
        skipped++;
        continue;
      }

      // Read conversation messages
      const conversationData = await page.evaluate(() => {
        const messages = [];
        // Look for message bubbles — try multiple selectors
        const msgContainers = document.querySelectorAll(
          '[role="row"] div[dir="auto"], ' +
          '[data-scope="messages_table"] div[dir="auto"], ' +
          'div[dir="auto"]'
        );

        const seen = new Set();
        for (const el of msgContainers) {
          const text = (el.innerText || '').trim();
          if (!text || text.length < 1 || text.length > 2000 || seen.has(text)) continue;
          seen.add(text);

          // Skip UI labels (buttons, headers, etc)
          const tag = el.tagName.toLowerCase();
          const parent = el.parentElement;
          if (parent && (parent.tagName === 'BUTTON' || parent.getAttribute('role') === 'button')) continue;

          // Determine sender by position
          const bubble = el.closest('div[class]');
          if (!bubble) continue;
          const rect = bubble.getBoundingClientRect();
          const viewWidth = window.innerWidth || 360;
          const isOutgoing = rect.right > viewWidth * 0.7;

          messages.push({ text, from: isOutgoing ? 'seller' : 'buyer' });
        }

        return messages;
      }).catch(() => []);

      if (conversationData.length === 0) {
        console.log(`[MP Chatbot] Listing ${li + 1}: no messages readable — skipping`);
        skipped++;
        continue;
      }

      processedConversations++;

      // Skip if last message is from us
      const lastMsg = conversationData[conversationData.length - 1];
      if (lastMsg.from === 'seller') {
        console.log(`[MP Chatbot] Listing ${li + 1}: already replied — skipping`);
        skipped++;
        continue;
      }

      // Build AI prompt
      const history = conversationData
        .slice(-10)
        .map(m => `${m.from === 'buyer' ? 'Comprador' : 'Vendedor'}: ${m.text}`)
        .join('\n');

      const listingCtx = listingInfo.title
        ? `Producto: ${listingInfo.title}${listingInfo.price ? ` — Precio: ${listingInfo.price}` : ''}`
        : '';

      const defaultInstructions = `Eres un vendedor amigable en Facebook Marketplace. Responde de forma natural, corta y directa.
- Responde en el mismo idioma que el comprador.
- Si preguntan si esta disponible, di que si.
- Si preguntan por el precio, confirma el precio publicado.
- Si quieren negociar, di que el precio es firme pero puedes considerar ofertas razonables.
- Si quieren coordinar entrega/envio, pregunta por su ubicacion.
- Maximo 2 oraciones. No uses emojis excesivos. Suena humano, no como bot.`;

      const prompt = `${instructions || defaultInstructions}

${listingCtx ? `\n${listingCtx}\n` : ''}
Conversacion reciente:
${history}

Responde SOLO con el mensaje que debes enviar. Sin comillas, sin explicaciones, sin prefijos.`;

      console.log(`[MP Chatbot] Listing ${li + 1}: buyer says: "${lastMsg.text}"`);
      console.log(`[MP Chatbot] Generating AI response...`);

      const aiResponse = await generateResponse(prompt);
      if (!aiResponse || aiResponse.error) {
        console.log(`[MP Chatbot] AI error: ${aiResponse?.error || 'empty'}`);
        errors++;
        continue;
      }

      const reply = (typeof aiResponse === 'string' ? aiResponse : aiResponse.text || '').trim().replace(/^["']|["']$/g, '');
      if (!reply) {
        console.log(`[MP Chatbot] AI returned empty response`);
        errors++;
        continue;
      }

      console.log(`[MP Chatbot] AI reply: "${reply}"`);

      // Send reply
      await msgBox.click();
      await page.waitForTimeout(300);
      await msgBox.type(reply, { delay: humanDelay(20, 50) });
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);

      replied++;
      console.log(`[MP Chatbot] Listing ${li + 1}: reply sent!`);

      await page.waitForTimeout(randomBetween(3000, 7000));

    } catch (err) {
      console.log(`[MP Chatbot] Listing ${li + 1}: error — ${err.message}`);
      errors++;
    }
  }

  console.log(`[MP Chatbot] Done — replied: ${replied}, skipped: ${skipped}, errors: ${errors}`);
  return { replied, skipped, errors };
}

// ── Warm-up Account ──
async function warmupAccount(page, options = {}) {
  const actions = [];

  // Scroll feed
  await page.goto(FB_URLS.home, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  for (let i = 0; i < (options.scrolls || 5); i++) {
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(randomBetween(2000, 5000));

    // Random like
    if (Math.random() < 0.3) {
      const likeBtn = await page.$('[aria-label*="Me gusta"]:not([aria-pressed="true"])');
      if (likeBtn) {
        await likeBtn.click();
        actions.push('like');
        await page.waitForTimeout(randomBetween(1000, 3000));
      }
    }
  }

  // View some stories
  if (options.viewStories) {
    const storyBtn = await page.$('[aria-label*="Historia"], [aria-label*="Story"]');
    if (storyBtn) {
      await storyBtn.click();
      await page.waitForTimeout(5000);
      actions.push('story_view');
      await page.keyboard.press('Escape');
    }
  }

  return { actions };
}

// ── Helpers ──
function humanDelay(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

module.exports = {
  FB_URLS,
  marketplaceCreateListing,
  marketplaceRepost,
  sendMessage,
  sendMassDM,
  createPost,
  postToGroup,
  likePosts,
  commentOnPosts,
  sharePost,
  joinGroup,
  addFriends,
  scrapeGroupMembers,
  scrapeMarketplace,
  deepScrapeMarketplace,
  contactMarketplaceSellers,
  autoReplyMarketplace,
  chatbotMarketplace,
  warmupAccount,
  resetUsedImages,
  getImageStats,
};
