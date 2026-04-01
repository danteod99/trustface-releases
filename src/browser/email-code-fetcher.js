/**
 * email-code-fetcher.js
 *
 * Obtiene códigos de verificación de Facebook desde el correo electrónico
 * del perfil (Outlook/Hotmail/Gmail) usando IMAP con el módulo nativo `tls`.
 * No requiere dependencias externas.
 */

const tls = require('tls');

// Configuración IMAP por proveedor
const IMAP_SERVERS = {
  outlook: { host: 'imap-mail.outlook.com', port: 993 },
  gmail:   { host: 'imap.gmail.com',        port: 993 },
};

/**
 * Detecta el proveedor de email según el dominio
 */
function detectEmailProvider(email) {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.es'].includes(domain)) {
    return 'outlook';
  }
  if (['gmail.com', 'googlemail.com'].includes(domain)) {
    return 'gmail';
  }
  // Proveedor desconocido — intentar outlook como fallback
  console.log(`[Email Code] Proveedor desconocido para dominio ${domain}, intentando Outlook como fallback`);
  return 'outlook';
}

/**
 * Envía un comando IMAP y espera la respuesta
 */
function imapCommand(socket, tag, command, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const fullCmd = `${tag} ${command}\r\n`;

    const timer = setTimeout(() => {
      socket.removeListener('data', onData);
      reject(new Error(`IMAP timeout esperando respuesta a: ${command.substring(0, 50)}`));
    }, timeout);

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      // Buscar línea que empiece con el tag (respuesta final)
      const lines = buffer.split('\r\n');
      for (const line of lines) {
        if (line.startsWith(`${tag} OK`) || line.startsWith(`${tag} NO`) || line.startsWith(`${tag} BAD`)) {
          clearTimeout(timer);
          socket.removeListener('data', onData);
          resolve(buffer);
          return;
        }
      }
    }

    socket.on('data', onData);
    socket.write(fullCmd);
  });
}

/**
 * Espera el saludo inicial del servidor IMAP
 */
function waitForGreeting(socket, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      socket.removeListener('data', onData);
      reject(new Error('IMAP timeout esperando saludo del servidor'));
    }, timeout);

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      if (buffer.includes('OK') || buffer.includes('* OK')) {
        clearTimeout(timer);
        socket.removeListener('data', onData);
        resolve(buffer);
      }
    }

    socket.on('data', onData);
  });
}

/**
 * Extrae un código de verificación de 6 u 8 dígitos del cuerpo del email
 */
function extractVerificationCode(emailBody) {
  if (!emailBody) return null;

  // Decodificar quoted-printable si es necesario
  let decoded = emailBody
    .replace(/=\r?\n/g, '')  // líneas continuadas
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Decodificar entidades HTML comunes
  decoded = decoded
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Patrones para encontrar el código de verificación de Facebook
  // Prioridad: buscar el código cerca de texto relevante
  const contextPatterns = [
    // Código precedido por texto de Facebook típico
    /(?:c[oó]digo|code|verification|confirmaci[oó]n)[^0-9]{0,50}(\d{6,8})/i,
    /(\d{6,8})[^0-9]{0,50}(?:c[oó]digo|code|verification|confirmaci[oó]n)/i,
    // Código en tags grandes/bold (típico de emails de Facebook)
    /<(?:font|span|b|strong|h\d)[^>]*>\s*(\d{6,8})\s*<\//i,
    // Código solo en una línea
    /^\s*(\d{6,8})\s*$/m,
    // Código genérico de 6-8 dígitos que no sea año ni número largo
    /\b(\d{6,8})\b/,
  ];

  for (const pattern of contextPatterns) {
    const match = decoded.match(pattern);
    if (match && match[1]) {
      const code = match[1];
      // Filtrar falsos positivos (años, códigos postales pequeños, etc.)
      if (code.length >= 6 && code.length <= 8) {
        // No aceptar algo que parezca un año (2024, 2025, 2026)
        if (/^20\d\d$/.test(code)) continue;
        console.log(`[Email Code] Código encontrado: ${code}`);
        return code;
      }
    }
  }

  return null;
}

/**
 * Conecta por IMAP y busca el código de verificación de Facebook
 *
 * @param {Object} profile - Perfil con fb_email e fb_email_pass
 * @param {number} maxAgeMinutes - Máxima antigüedad del email en minutos
 * @returns {Promise<string|null>} - Código de verificación o null
 */
async function fetchEmailVerificationCode(profile, maxAgeMinutes = 5) {
  const email = profile.fb_email;
  const password = profile.fb_email_pass;

  if (!email || !password) {
    console.log(`[Email Code] No hay credenciales de email configuradas para ${profile.name}`);
    return null;
  }

  const provider = detectEmailProvider(email);
  if (!provider) {
    console.log(`[Email Code] No se pudo detectar proveedor de email para ${email}`);
    return null;
  }

  const server = IMAP_SERVERS[provider];
  console.log(`[Email Code] Conectando a ${server.host}:${server.port} para ${email}...`);

  let socket = null;
  let tagCounter = 0;
  const nextTag = () => `A${++tagCounter}`;

  try {
    // Conectar por TLS
    socket = await new Promise((resolve, reject) => {
      const s = tls.connect(server.port, server.host, {
        rejectUnauthorized: true,
        servername: server.host,
      }, () => {
        console.log(`[Email Code] Conexión TLS establecida con ${server.host}`);
        resolve(s);
      });
      s.on('error', (err) => reject(new Error(`Error TLS: ${err.message}`)));
      setTimeout(() => reject(new Error('Timeout de conexión TLS')), 15000);
    });

    // Esperar saludo
    await waitForGreeting(socket);
    console.log(`[Email Code] Saludo IMAP recibido`);

    // LOGIN
    const loginTag = nextTag();
    const loginResp = await imapCommand(socket, loginTag, `LOGIN "${email}" "${password.replace(/"/g, '\\"')}"`);
    if (loginResp.includes(`${loginTag} NO`) || loginResp.includes(`${loginTag} BAD`)) {
      console.log(`[Email Code] Error de autenticación IMAP para ${email}`);
      return null;
    }
    console.log(`[Email Code] Login IMAP exitoso`);

    // SELECT INBOX
    const selectTag = nextTag();
    const selectResp = await imapCommand(socket, selectTag, 'SELECT INBOX');
    if (selectResp.includes(`${selectTag} NO`)) {
      console.log(`[Email Code] No se pudo seleccionar INBOX`);
      return null;
    }

    // Buscar emails recientes de Facebook
    // Calcular fecha de búsqueda (hoy menos maxAgeMinutes, pero IMAP SINCE usa fecha, no hora)
    const searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 1); // Buscar desde ayer por seguridad
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = `${searchDate.getDate()}-${months[searchDate.getMonth()]}-${searchDate.getFullYear()}`;

    const searchTag = nextTag();
    const searchResp = await imapCommand(socket, searchTag,
      `SEARCH SINCE ${dateStr} FROM "facebook"`, 20000);

    // Parsear UIDs de la respuesta
    const searchLine = searchResp.split('\r\n').find(l => l.startsWith('* SEARCH'));
    if (!searchLine || searchLine.trim() === '* SEARCH') {
      console.log(`[Email Code] No se encontraron emails de Facebook`);
      // Intentar búsqueda más amplia
      const searchTag2 = nextTag();
      const searchResp2 = await imapCommand(socket, searchTag2,
        `SEARCH SINCE ${dateStr} OR FROM "security@mail.facebook.com" FROM "info@facebook.com"`, 20000);
      const searchLine2 = searchResp2.split('\r\n').find(l => l.startsWith('* SEARCH'));
      if (!searchLine2 || searchLine2.trim() === '* SEARCH') {
        console.log(`[Email Code] Ningún email de Facebook encontrado`);
        return null;
      }
    }

    const finalSearchLine = searchResp.split('\r\n').find(l => l.startsWith('* SEARCH')) || '';
    const uids = finalSearchLine.replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean);

    if (uids.length === 0) {
      console.log(`[Email Code] No hay UIDs en la respuesta de búsqueda`);
      return null;
    }

    console.log(`[Email Code] Encontrados ${uids.length} emails de Facebook, revisando los más recientes...`);

    // Revisar los últimos 5 emails (más recientes primero)
    const recentUids = uids.slice(-5).reverse();

    for (const uid of recentUids) {
      const fetchTag = nextTag();
      const fetchResp = await imapCommand(socket, fetchTag, `FETCH ${uid} BODY[TEXT]`, 20000);

      // Verificar que el email es reciente (dentro de maxAgeMinutes)
      // Intentar extraer fecha del encabezado también
      const headerTag = nextTag();
      const headerResp = await imapCommand(socket, headerTag, `FETCH ${uid} BODY[HEADER.FIELDS (DATE FROM SUBJECT)]`, 10000);

      // Verificar que es de Facebook
      const isFromFacebook = headerResp.toLowerCase().includes('facebook');
      if (!isFromFacebook) {
        continue;
      }

      // Verificar antigüedad del email
      const dateMatch = headerResp.match(/Date:\s*(.+)/i);
      if (dateMatch) {
        const emailDate = new Date(dateMatch[1].trim());
        const ageMs = Date.now() - emailDate.getTime();
        const ageMinutes = ageMs / 60000;
        if (ageMinutes > maxAgeMinutes) {
          console.log(`[Email Code] Email demasiado antiguo (${Math.round(ageMinutes)} min), saltando...`);
          continue;
        }
        console.log(`[Email Code] Email de hace ${Math.round(ageMinutes)} minutos`);
      }

      // Extraer código del cuerpo
      const code = extractVerificationCode(fetchResp);
      if (code) {
        console.log(`[Email Code] Código de verificación encontrado: ${code}`);
        // LOGOUT limpio
        try {
          const logoutTag = nextTag();
          await imapCommand(socket, logoutTag, 'LOGOUT', 5000);
        } catch { /* ignorar */ }
        socket.destroy();
        return code;
      }
    }

    console.log(`[Email Code] No se encontró código de verificación en los emails recientes`);

    // LOGOUT
    try {
      const logoutTag = nextTag();
      await imapCommand(socket, logoutTag, 'LOGOUT', 5000);
    } catch { /* ignorar */ }
    socket.destroy();
    return null;

  } catch (err) {
    console.log(`[Email Code] Error: ${err.message}`);
    if (socket) {
      try { socket.destroy(); } catch { /* ignorar */ }
    }
    return null;
  }
}

/**
 * Intenta obtener el código de verificación con reintentos
 * Espera unos segundos entre intentos para dar tiempo al email de llegar
 *
 * @param {Object} profile
 * @param {number} maxAttempts - Número máximo de intentos
 * @param {number} delayBetweenMs - Milisegundos entre intentos
 * @returns {Promise<string|null>}
 */
async function fetchCodeWithRetries(profile, maxAttempts = 6, delayBetweenMs = 10000) {
  console.log(`[Email Code] Iniciando búsqueda de código para ${profile.name} (max ${maxAttempts} intentos)...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[Email Code] Intento ${attempt}/${maxAttempts}...`);

    const code = await fetchEmailVerificationCode(profile, 5);
    if (code) {
      return code;
    }

    if (attempt < maxAttempts) {
      console.log(`[Email Code] Código no encontrado, esperando ${delayBetweenMs / 1000}s para reintentar...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
    }
  }

  console.log(`[Email Code] No se pudo obtener el código después de ${maxAttempts} intentos`);
  return null;
}

module.exports = {
  fetchEmailVerificationCode,
  fetchCodeWithRetries,
  detectEmailProvider,
  extractVerificationCode,
};
