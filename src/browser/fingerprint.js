const SCREENS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1280, height: 800 },
  { width: 1680, height: 1050 },
  { width: 1360, height: 768 },
  { width: 1280, height: 1024 },
  { width: 1440, height: 1080 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1440 },
];

const WEBGL_VENDORS = [
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Plus Graphics 640 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) HD Graphics 530 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Apple', renderer: 'Apple GPU' },
  { vendor: 'Apple', renderer: 'Apple M1' },
  { vendor: 'Apple', renderer: 'Apple M2' },
];

const PLATFORMS = ['Win32', 'MacIntel', 'Linux x86_64'];

const PLATFORM_WEIGHTS = { 'Win32': 70, 'MacIntel': 20, 'Linux x86_64': 10 };

const LANGUAGE_SETS = [
  ['en-US', 'en'],
  ['en-US', 'en', 'es'],
  ['en-GB', 'en'],
  ['es-ES', 'es'],
  ['es-MX', 'es', 'en'],
  ['es-AR', 'es'],
  ['pt-BR', 'pt', 'en'],
  ['fr-FR', 'fr', 'en'],
  ['de-DE', 'de', 'en'],
  ['it-IT', 'it', 'en'],
  ['en-US', 'en', 'fr'],
  ['en-US', 'en', 'de'],
  ['es-CO', 'es', 'en'],
  ['es-PE', 'es', 'en'],
  ['es-CL', 'es'],
];

const CORES = [2, 4, 4, 4, 6, 6, 8, 8];
const MEMORY = [4, 4, 8, 8, 8, 16, 16];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedRandomPlatform() {
  const total = Object.values(PLATFORM_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [platform, weight] of Object.entries(PLATFORM_WEIGHTS)) {
    r -= weight;
    if (r <= 0) return platform;
  }
  return 'Win32';
}

function randomScreen() {
  return { ...randomItem(SCREENS) };
}

function randomWebGLVendor() {
  return { ...randomItem(WEBGL_VENDORS) };
}

function randomPlatform() {
  return weightedRandomPlatform();
}

function randomLanguages() {
  return [...randomItem(LANGUAGE_SETS)];
}

function randomCores() {
  return randomItem(CORES);
}

function randomMemory() {
  return randomItem(MEMORY);
}

function generateFingerprint(timezone) {
  return {
    screen: randomScreen(),
    webgl: randomWebGLVendor(),
    platform: randomPlatform(),
    languages: randomLanguages(),
    hardwareConcurrency: randomCores(),
    deviceMemory: randomMemory(),
    timezone: timezone || 'America/New_York',
  };
}

function getFingerprintScript(fingerprint) {
  const fp = JSON.stringify(fingerprint);

  return `
(function() {
  const fp = ${fp};

  // Override navigator.platform
  Object.defineProperty(navigator, 'platform', {
    get: function() { return fp.platform; },
    configurable: true
  });

  // Override navigator.languages
  Object.defineProperty(navigator, 'languages', {
    get: function() { return Object.freeze(fp.languages); },
    configurable: true
  });

  // Override navigator.language
  Object.defineProperty(navigator, 'language', {
    get: function() { return fp.languages[0]; },
    configurable: true
  });

  // Override navigator.hardwareConcurrency
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: function() { return fp.hardwareConcurrency; },
    configurable: true
  });

  // Override navigator.deviceMemory
  Object.defineProperty(navigator, 'deviceMemory', {
    get: function() { return fp.deviceMemory; },
    configurable: true
  });

  // Override screen dimensions
  Object.defineProperty(screen, 'width', {
    get: function() { return fp.screen.width; },
    configurable: true
  });
  Object.defineProperty(screen, 'height', {
    get: function() { return fp.screen.height; },
    configurable: true
  });
  Object.defineProperty(screen, 'availWidth', {
    get: function() { return fp.screen.width; },
    configurable: true
  });
  Object.defineProperty(screen, 'availHeight', {
    get: function() { return fp.screen.height - 40; },
    configurable: true
  });
  Object.defineProperty(screen, 'colorDepth', {
    get: function() { return 24; },
    configurable: true
  });
  Object.defineProperty(screen, 'pixelDepth', {
    get: function() { return 24; },
    configurable: true
  });

  // Override WebGL vendor and renderer
  const origGetParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    const UNMASKED_VENDOR = 0x9245;
    const UNMASKED_RENDERER = 0x9246;
    if (param === UNMASKED_VENDOR) return fp.webgl.vendor;
    if (param === UNMASKED_RENDERER) return fp.webgl.renderer;
    return origGetParameter.call(this, param);
  };

  if (typeof WebGL2RenderingContext !== 'undefined') {
    const origGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      const UNMASKED_VENDOR = 0x9245;
      const UNMASKED_RENDERER = 0x9246;
      if (param === UNMASKED_VENDOR) return fp.webgl.vendor;
      if (param === UNMASKED_RENDERER) return fp.webgl.renderer;
      return origGetParameter2.call(this, param);
    };
  }

  // Canvas fingerprint noise
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type) {
    if (this.width > 0 && this.height > 0) {
      try {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, Math.min(this.width, 2), Math.min(this.height, 2));
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] ^ (fp.hardwareConcurrency & 1);
            imageData.data[i + 1] = imageData.data[i + 1] ^ ((fp.deviceMemory >> 1) & 1);
          }
          ctx.putImageData(imageData, 0, 0);
        }
      } catch (e) {
        // canvas may be tainted, skip noise
      }
    }
    return origToDataURL.apply(this, arguments);
  };

  // Override timezone if specified
  if (fp.timezone) {
    const origDateTimeFormat = Intl.DateTimeFormat;
    const handler = {
      construct: function(target, args) {
        if (args.length === 0) {
          args = [undefined, { timeZone: fp.timezone }];
        } else if (args.length === 1) {
          args = [args[0], { timeZone: fp.timezone }];
        } else if (args[1] && !args[1].timeZone) {
          args[1].timeZone = fp.timezone;
        }
        return new target(...args);
      }
    };
    Intl.DateTimeFormat = new Proxy(origDateTimeFormat, handler);

    const origResolvedOptions = origDateTimeFormat.prototype.resolvedOptions;
    origDateTimeFormat.prototype.resolvedOptions = function() {
      const result = origResolvedOptions.call(this);
      result.timeZone = fp.timezone;
      return result;
    };
  }
})();
`;
}

module.exports = { generateFingerprint, getFingerprintScript };
