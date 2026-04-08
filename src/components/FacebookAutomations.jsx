import React, { useState, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// ACTIONS REGISTRY
// ---------------------------------------------------------------------------
const FB_ACTIONS = [
  // Marketplace
  { id: 'mp-create', name: 'Publicar en Marketplace', icon: '🏪', color: 'text-blue-500', category: 'Marketplace', desc: 'Crear listing con fotos, precio y ubicacion' },
  { id: 'mp-repost', name: 'Repostear Listings', icon: '🔄', color: 'text-blue-400', category: 'Marketplace', desc: 'Eliminar y volver a publicar para aparecer primero' },
  { id: 'mp-scrape', name: 'Scrape Marketplace', icon: '🔍', color: 'text-cyan-500', category: 'Marketplace', desc: 'Extraer listings por keyword (precios, titulos)' },
  { id: 'mp-autoreply', name: 'Auto-Responder Marketplace', icon: '💬', color: 'text-green-500', category: 'Marketplace', desc: 'Responder automaticamente a mensajes de compradores' },
  { id: 'mp-contact', name: 'Contactar Vendedores', icon: '📩', color: 'text-emerald-500', category: 'Marketplace', desc: 'Enviar "Sigue disponible?" y mensaje a listings de Marketplace' },

  // Messenger / DMs
  { id: 'dm-send', name: 'Enviar DM', icon: '✉️', color: 'text-purple-500', category: 'Messenger', desc: 'Enviar mensaje directo a un usuario' },
  { id: 'dm-mass', name: 'DM Masivo', icon: '📨', color: 'text-purple-400', category: 'Messenger', desc: 'Enviar DMs masivos con templates personalizados' },

  // Posts
  { id: 'post-create', name: 'Crear Post', icon: '📝', color: 'text-blue-600', category: 'Posts', desc: 'Publicar post en tu perfil o pagina' },
  { id: 'post-group', name: 'Post en Grupo', icon: '👥', color: 'text-indigo-500', category: 'Posts', desc: 'Publicar en uno o varios grupos' },
  { id: 'post-share', name: 'Compartir Post', icon: '↪️', color: 'text-sky-500', category: 'Posts', desc: 'Compartir un post en tu perfil' },

  // Engagement
  { id: 'like', name: 'Like en Posts', icon: '👍', color: 'text-blue-500', category: 'Engagement', desc: 'Dar likes a posts de un perfil o pagina' },
  { id: 'comment', name: 'Comentar', icon: '💬', color: 'text-yellow-500', category: 'Engagement', desc: 'Comentar en posts con templates rotativos' },
  { id: 'add-friend', name: 'Agregar Amigos', icon: '➕', color: 'text-green-500', category: 'Engagement', desc: 'Enviar solicitudes de amistad masivas' },

  // Groups
  { id: 'group-join', name: 'Unirse a Grupos', icon: '🚪', color: 'text-teal-500', category: 'Grupos', desc: 'Unirse a varios grupos automaticamente' },
  { id: 'group-scrape', name: 'Scrape Miembros', icon: '📋', color: 'text-emerald-500', category: 'Grupos', desc: 'Extraer lista de miembros de un grupo' },

  // Account
  { id: 'warmup', name: 'Warm-up Cuenta', icon: '🔥', color: 'text-orange-500', category: 'Cuenta', desc: 'Calentar cuenta: scroll, likes, stories' },
];

// ---------------------------------------------------------------------------
// FIELD DEFINITIONS PER ACTION
// ---------------------------------------------------------------------------
const ACTION_FIELDS = {
  'mp-create': [
    { key: 'mpTitle', label: 'Titulo del Listing', type: 'text', placeholder: 'iPhone 15 Pro Max 256GB' },
    { key: 'mpCurrency', label: 'Divisa', type: 'select', options: [
      { value: 'USD', label: 'USD ($) — Dolar estadounidense' },
      { value: 'EUR', label: 'EUR (€) — Euro' },
      { value: 'GBP', label: 'GBP (£) — Libra esterlina' },
      { value: 'MXN', label: 'MXN ($) — Peso mexicano' },
      { value: 'PEN', label: 'PEN (S/) — Sol peruano' },
      { value: 'ARS', label: 'ARS ($) — Peso argentino' },
      { value: 'COP', label: 'COP ($) — Peso colombiano' },
      { value: 'CLP', label: 'CLP ($) — Peso chileno' },
      { value: 'BRL', label: 'BRL (R$) — Real brasileño' },
      { value: 'DOP', label: 'DOP (RD$) — Peso dominicano' },
      { value: 'CAD', label: 'CAD ($) — Dolar canadiense' },
      { value: 'AUD', label: 'AUD ($) — Dolar australiano' },
    ], default: 'USD' },
    { key: 'mpPrice', label: 'Precio', type: 'number', placeholder: '999', min: 0, max: 999999 },
    { key: 'mpDescription', label: 'Descripcion', type: 'textarea', placeholder: 'Producto en excelente estado...', rows: 3 },
    { key: 'mpCategory', label: 'Categoria', type: 'select', options: [{ value: 'Electronica', label: 'Electronica' }, { value: 'Vehiculos', label: 'Vehiculos' }, { value: 'Hogar', label: 'Hogar' }, { value: 'Ropa', label: 'Ropa' }, { value: 'Deportes', label: 'Deportes' }, { value: 'Juguetes', label: 'Juguetes' }, { value: 'Otra', label: 'Otra' }], default: 'Electronica' },
    { key: 'mpCondition', label: 'Estado', type: 'select', options: [{ value: 'Nuevo', label: 'Nuevo' }, { value: 'Como nuevo', label: 'Como nuevo' }, { value: 'Buen estado', label: 'Buen estado' }, { value: 'Aceptable', label: 'Aceptable' }], default: 'Nuevo' },
    { key: 'mpLocation', label: 'Ubicacion', type: 'text', placeholder: 'Lima, Peru' },
    { key: 'mpPhotos', label: 'Fotos (carpeta o rutas separadas por coma)', type: 'textarea', placeholder: '/Users/tu/carpeta-fotos o /ruta/foto1.jpg, /ruta/foto2.jpg', rows: 2 },
  ],
  'mp-repost': [
    { key: 'mpListingUrl', label: 'URL del Listing', type: 'text', placeholder: 'https://facebook.com/marketplace/item/...' },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 5 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 15 },
  ],
  'mp-scrape': [
    { key: 'mpSearchQuery', label: 'Buscar', type: 'text', placeholder: 'iPhone' },
    { key: 'mpMaxResults', label: 'Max Resultados', type: 'number', placeholder: '50', min: 1, max: 500, default: 50 },
  ],
  'mp-autoreply': [
    { key: 'mpReplyTemplate', label: 'Template de Respuesta', type: 'textarea', placeholder: 'Hola! Si, esta disponible. El precio es $X. Te interesa?', rows: 3 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 10 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 30 },
  ],
  'mp-contact': [
    { key: 'mpContactQuery', label: 'Buscar en Marketplace', type: 'text', placeholder: 'iPhone, laptop, auto...' },
    { key: 'mpContactMessage', label: 'Mensaje personalizado (vacio = "Sigue disponible?")', type: 'textarea', placeholder: 'Hola! Me interesa tu producto. Sigue disponible? Cual es tu mejor precio?', rows: 3 },
    { key: 'mpMaxContacts', label: 'Max contactos', type: 'number', placeholder: '10', min: 1, max: 100, default: 10 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 5, max: 300, default: 15 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 5, max: 300, default: 45 },
  ],
  'dm-send': [
    { key: 'dmRecipient', label: 'Destinatario (nombre o perfil)', type: 'text', placeholder: 'Juan Perez' },
    { key: 'dmMessage', label: 'Mensaje', type: 'textarea', placeholder: 'Hola {nombre}, te escribo porque...', rows: 3 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 5 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 15 },
  ],
  'dm-mass': [
    { key: 'dmRecipients', label: 'Destinatarios (uno por linea)', type: 'textarea', placeholder: 'usuario1\nusuario2\nusuario3', rows: 5 },
    { key: 'useAI', label: 'Generar mensaje con IA', type: 'checkbox', default: false },
    { key: 'aiApiKey', label: 'API Key (OpenAI o Anthropic)', type: 'text', placeholder: 'sk-...', mono: true, showIf: 'useAI' },
    { key: 'aiProvider', label: 'Proveedor IA', type: 'select', options: [{ value: 'openai', label: 'OpenAI (GPT)' }, { value: 'anthropic', label: 'Anthropic (Claude)' }], default: 'openai', showIf: 'useAI' },
    { key: 'aiPrompt', label: 'Instruccion para la IA', type: 'textarea', placeholder: 'Genera un DM personalizado para {nombre}. Tono amigable, profesional. Maximo 2 frases.', rows: 3, showIf: 'useAI' },
    { key: 'dmTemplates', label: 'Templates de mensaje (uno por linea)', type: 'textarea', placeholder: 'Hola {nombre}, vi tu perfil y...\nHola! Te contacto porque...', rows: 3, hideIf: 'useAI' },
    { key: 'dmMinDelay', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 300, default: 30 },
    { key: 'dmMaxDelay', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 300, default: 120 },
  ],
  'post-create': [
    { key: 'postText', label: 'Texto del Post', type: 'textarea', placeholder: 'Escribe tu publicacion aqui...', rows: 3 },
    { key: 'postPhotos', label: 'Fotos (rutas)', type: 'textarea', placeholder: '/ruta/foto1.jpg', rows: 2 },
    { key: 'postPageUrl', label: 'URL de Pagina (dejar vacio = perfil)', type: 'text', placeholder: 'https://facebook.com/mipagina' },
  ],
  'post-group': [
    { key: 'groupUrls', label: 'URLs de Grupos (uno por linea)', type: 'textarea', placeholder: 'https://facebook.com/groups/grupo1\nhttps://facebook.com/groups/grupo2', rows: 4 },
    { key: 'postText', label: 'Texto del Post', type: 'textarea', placeholder: 'Escribe tu publicacion aqui...', rows: 3 },
    { key: 'postPhotos', label: 'Fotos (rutas)', type: 'textarea', placeholder: '/ruta/foto1.jpg', rows: 2 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 10 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 30 },
  ],
  'post-share': [
    { key: 'sharePostUrl', label: 'URL del Post a Compartir', type: 'text', placeholder: 'https://facebook.com/post/...' },
  ],
  'like': [
    { key: 'likeTargetUrl', label: 'URL del Perfil/Pagina', type: 'text', placeholder: 'https://facebook.com/pagina' },
    { key: 'maxLikes', label: 'Max Likes', type: 'number', min: 1, max: 100, default: 10 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 3 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 10 },
  ],
  'comment': [
    { key: 'commentTargetUrl', label: 'URL del Perfil/Pagina', type: 'text', placeholder: 'https://facebook.com/pagina' },
    { key: 'useAI', label: 'Generar comentarios con IA', type: 'checkbox', default: false },
    { key: 'aiApiKey', label: 'API Key (OpenAI o Anthropic)', type: 'text', placeholder: 'sk-...', mono: true, showIf: 'useAI' },
    { key: 'aiProvider', label: 'Proveedor IA', type: 'select', options: [{ value: 'openai', label: 'OpenAI (GPT)' }, { value: 'anthropic', label: 'Anthropic (Claude)' }], default: 'openai', showIf: 'useAI' },
    { key: 'aiPrompt', label: 'Instruccion para la IA', type: 'textarea', placeholder: 'Genera un comentario corto, positivo y natural para un post de Facebook sobre {tema}. Maximo 1 frase. No uses emojis excesivos.', rows: 3, showIf: 'useAI' },
    { key: 'aiLanguage', label: 'Idioma', type: 'select', options: [{ value: 'es', label: 'Espanol' }, { value: 'en', label: 'Ingles' }, { value: 'pt', label: 'Portugues' }], default: 'es', showIf: 'useAI' },
    { key: 'comments', label: 'Comentarios manuales (uno por linea)', type: 'textarea', placeholder: 'Excelente post!\nMuy bueno, gracias por compartir\nInteresante!', rows: 5, hideIf: 'useAI' },
    { key: 'maxComments', label: 'Max Comentarios', type: 'number', min: 1, max: 50, default: 5 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 10 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 30 },
  ],
  'add-friend': [
    { key: 'friendUrls', label: 'URLs de Perfiles (uno por linea)', type: 'textarea', placeholder: 'https://facebook.com/usuario1\nhttps://facebook.com/usuario2', rows: 5 },
    { key: 'maxRequests', label: 'Max Solicitudes', type: 'number', min: 1, max: 100, default: 20 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 10 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 30 },
  ],
  'group-join': [
    { key: 'groupUrls', label: 'URLs de Grupos (uno por linea)', type: 'textarea', placeholder: 'https://facebook.com/groups/grupo1\nhttps://facebook.com/groups/grupo2', rows: 5 },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 10 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 30 },
  ],
  'group-scrape': [
    { key: 'groupUrl', label: 'URL del Grupo', type: 'text', placeholder: 'https://facebook.com/groups/migrupo' },
    { key: 'maxMembers', label: 'Max Miembros', type: 'number', min: 1, max: 5000, default: 100 },
  ],
  'warmup': [
    { key: 'warmupScrolls', label: 'Scrolls en Feed', type: 'number', min: 1, max: 50, default: 5 },
    { key: 'warmupStories', label: 'Ver Stories', type: 'select', options: [{ value: 'Si', label: 'Si' }, { value: 'No', label: 'No' }], default: 'Si' },
    { key: 'delayMin', label: 'Delay minimo (seg)', type: 'number', min: 1, max: 120, default: 3 },
    { key: 'delayMax', label: 'Delay maximo (seg)', type: 'number', min: 1, max: 120, default: 10 },
  ],
};

// ---------------------------------------------------------------------------
// STYLE CONSTANTS
// ---------------------------------------------------------------------------
const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-trust-accent focus:ring-1 focus:ring-trust-accent/20';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const PIPELINES_KEY = 'trustface_pipelines';

function loadPipelines() {
  try {
    return JSON.parse(window.localStorage.getItem(PIPELINES_KEY) || '[]');
  } catch { return []; }
}

function savePipelines(pipelines) {
  window.localStorage.setItem(PIPELINES_KEY, JSON.stringify(pipelines));
}

function getDefaultConfig(actionId) {
  const fields = ACTION_FIELDS[actionId] || [];
  const cfg = {};
  for (const f of fields) {
    if (f.default !== undefined) cfg[f.key] = f.default;
  }
  return cfg;
}

function getActionById(id) {
  return FB_ACTIONS.find((a) => a.id === id);
}

/** Build the config object to send to the existing window.api methods */
function buildApiConfig(actionId, cfg) {
  const c = { ...cfg };
  // Parse numbers
  for (const k of ['maxLikes', 'maxComments', 'maxRequests', 'maxMembers', 'mpMaxResults', 'mpPrice', 'warmupScrolls', 'dmMinDelay', 'dmMaxDelay', 'delayMin', 'delayMax']) {
    if (c[k] !== undefined) c[k] = parseInt(c[k]) || 0;
  }
  // Parse textareas into arrays
  if (c.dmRecipients && typeof c.dmRecipients === 'string') c.dmRecipients = c.dmRecipients.split('\n').map(u => u.trim()).filter(Boolean);
  if (c.dmTemplates && typeof c.dmTemplates === 'string') c.dmTemplates = c.dmTemplates.split('\n').filter(x => x.trim());
  if (c.comments && typeof c.comments === 'string') c.comments = c.comments.split('\n').filter(x => x.trim());
  if (c.groupUrls && typeof c.groupUrls === 'string') c.groupUrls = c.groupUrls.split('\n').map(u => u.trim()).filter(Boolean);
  if (c.friendUrls && typeof c.friendUrls === 'string') c.friendUrls = c.friendUrls.split('\n').map(u => u.trim()).filter(Boolean);
  if (c.mpPhotos && typeof c.mpPhotos === 'string') c.mpPhotos = c.mpPhotos.split(',').map(p => p.trim()).filter(Boolean);
  if (c.postPhotos && typeof c.postPhotos === 'string') c.postPhotos = c.postPhotos.split(',').map(p => p.trim()).filter(Boolean);
  return c;
}

/** Execute a single action on a single profile */
async function executeAction(profileId, actionId, rawConfig) {
  const c = buildApiConfig(actionId, rawConfig);
  switch (actionId) {
    case 'mp-create': return window.api.fbMarketplaceCreate(profileId, c);
    case 'mp-repost': return window.api.fbMarketplaceRepost(profileId, c.mpListingUrl, c);
    case 'mp-scrape': return window.api.fbMarketplaceScrape(profileId, c.mpSearchQuery, c.mpMaxResults);
    case 'mp-autoreply': return window.api.fbMarketplaceAutoreply(profileId, c.mpReplyTemplate);
    case 'mp-contact': return window.api.fbMarketplaceContact(profileId, c.mpContactQuery, c.mpContactMessage, { maxContacts: c.mpMaxContacts || 10, minDelay: (c.delayMin || 15) * 1000, maxDelay: (c.delayMax || 45) * 1000 });
    case 'dm-send': return window.api.fbSendDM(profileId, c.dmRecipient, c.dmMessage);
    case 'dm-mass': return window.api.fbMassDM(profileId, c.dmRecipients, c.dmTemplates, { minDelay: c.dmMinDelay, maxDelay: c.dmMaxDelay });
    case 'post-create': return window.api.fbCreatePost(profileId, c.postText, { photos: c.postPhotos, pageUrl: c.postPageUrl });
    case 'post-group': return window.api.fbPostGroup(profileId, c.groupUrls, { text: c.postText, photos: c.postPhotos });
    case 'post-share': return window.api.fbShare(profileId, c.sharePostUrl);
    case 'like': return window.api.fbLike(profileId, c.likeTargetUrl, c.maxLikes);
    case 'comment': return window.api.fbComment(profileId, c.commentTargetUrl, c.comments, c.maxComments);
    case 'add-friend': return window.api.fbAddFriends(profileId, c.friendUrls, c.maxRequests);
    case 'group-join': return window.api.fbJoinGroup(profileId, c.groupUrls);
    case 'group-scrape': return window.api.fbScrapeGroup(profileId, c.groupUrl, c.maxMembers);
    case 'warmup': return window.api.fbWarmup(profileId, { scrolls: c.warmupScrolls, stories: c.warmupStories });
    default: return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------------------------

/** Renders config fields for one action */
function ConfigFields({ actionId, config, onChange }) {
  const fields = ACTION_FIELDS[actionId] || [];
  const update = (key, val) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-3">
      {fields.map((f) => {
        if (f.showIf && !config[f.showIf]) return null;
        if (f.hideIf && config[f.hideIf]) return null;

        if (f.type === 'checkbox') {
          return (
            <div key={f.key} className="flex items-center gap-3">
              <input type="checkbox" checked={config[f.key] || false} onChange={(e) => update(f.key, e.target.checked)} className="accent-trust-accent w-4 h-4" />
              <label className="text-sm text-trust-dark">{f.label}</label>
            </div>
          );
        }
        if (f.type === 'select') {
          return (
            <div key={f.key}>
              <label className={LABEL_CLASS}>{f.label}</label>
              <select value={config[f.key] || f.default || ''} onChange={(e) => update(f.key, e.target.value)} className={INPUT_CLASS}>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          );
        }
        if (f.type === 'textarea') {
          return (
            <div key={f.key}>
              <label className={LABEL_CLASS}>{f.label}</label>
              <textarea
                value={config[f.key] || ''}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder || ''}
                rows={f.rows || 3}
                className={INPUT_CLASS + ' resize-none' + (f.mono ? ' font-mono' : '')}
              />
            </div>
          );
        }
        if (f.type === 'number') {
          return (
            <div key={f.key}>
              <label className={LABEL_CLASS}>{f.label}</label>
              <input
                type="number"
                value={config[f.key] ?? f.default ?? ''}
                onChange={(e) => update(f.key, e.target.value)}
                min={f.min}
                max={f.max}
                placeholder={f.placeholder || ''}
                className={INPUT_CLASS}
              />
            </div>
          );
        }
        // text
        return (
          <div key={f.key}>
            <label className={LABEL_CLASS}>{f.label}</label>
            <input
              type="text"
              value={config[f.key] || ''}
              onChange={(e) => update(f.key, e.target.value)}
              placeholder={f.placeholder || ''}
              className={INPUT_CLASS + (f.mono ? ' font-mono' : '')}
            />
          </div>
        );
      })}
    </div>
  );
}

/** A brief summary string for a pipeline step */
function stepSummary(actionId, cfg) {
  const parts = [];
  if (cfg.likeTargetUrl) parts.push(cfg.likeTargetUrl.substring(0, 30));
  if (cfg.commentTargetUrl) parts.push(cfg.commentTargetUrl.substring(0, 30));
  if (cfg.mpSearchQuery) parts.push(`"${cfg.mpSearchQuery}"`);
  if (cfg.dmRecipient) parts.push(cfg.dmRecipient);
  if (cfg.maxLikes) parts.push(`${cfg.maxLikes} likes`);
  if (cfg.maxComments) parts.push(`${cfg.maxComments} comments`);
  if (cfg.maxRequests) parts.push(`${cfg.maxRequests} requests`);
  if (cfg.delayMin && cfg.delayMax) parts.push(`delay ${cfg.delayMin}-${cfg.delayMax}s`);
  return parts.join(', ') || 'Sin configurar';
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------
export default function FacebookAutomations({ tier, onUpgrade }) {
  // ---- Data state ----
  const [profiles, setProfiles] = useState([]);
  const [runningIds, setRunningIds] = useState([]);
  const [selectedProfiles, setSelectedProfiles] = useState([]);

  // ---- Mode ----
  const [mode, setMode] = useState('simple'); // 'simple' | 'pipeline'

  // ---- Simple mode state ----
  const [selectedAction, setSelectedAction] = useState(null);
  const [config, setConfig] = useState({});
  const [filterCategory, setFilterCategory] = useState('all');

  // ---- Pipeline mode state ----
  const [pipelineSteps, setPipelineSteps] = useState([]);
  const [expandedStep, setExpandedStep] = useState(null);
  const [showActionPicker, setShowActionPicker] = useState(false);
  const [pipelineName, setPipelineName] = useState('');
  const [savedPipelines, setSavedPipelines] = useState([]);
  const [selectedPipelineIdx, setSelectedPipelineIdx] = useState(-1);

  // ---- Execution state ----
  const [running, setRunning] = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(-1);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);
  const cancelledRef = useRef(false);

  // ---- Load data ----
  useEffect(() => {
    loadData();
    setSavedPipelines(loadPipelines());
    const interval = setInterval(loadData, 3000);

    window.api.onAutomationEvent?.((event) => {
      const time = new Date().toLocaleTimeString();
      const { profileId, event: evt, data } = event;
      let msg = '';
      if (evt === 'start') msg = `Iniciando ${data?.type || ''}${data?.target ? ` en ${data.target}` : ''}`;
      if (evt === 'progress') msg = `${data?.type || ''}: ${data?.current || 0}/${data?.total || 0}`;
      if (evt === 'done') msg = `Completado`;
      if (evt === 'error') msg = `Error: ${data?.error || data?.message || ''}`;
      if (msg) {
        setLogs((prev) => [...prev.slice(-200), { time, msg, evt, profileId }]);
      }
    });

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const loadData = async () => {
    try {
      const data = await window.api.listProfiles();
      setProfiles(data || []);
      const status = await window.api.getBrowserStatus();
      setRunningIds(status || []);
    } catch {}
  };

  // Show ALL profiles with credentials — auto-launch when executing
  const allProfiles = profiles.filter((p) => p.fb_user);
  const activeProfiles = allProfiles; // Keep name for UI compatibility

  const toggleProfile = (id) => {
    setSelectedProfiles((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };
  const selectAll = () => setSelectedProfiles(allProfiles.map((p) => p.id));

  /** Auto-open browsers and wait for login/2FA to complete */
  const ensureBrowsersOpen = async (profileIds) => {
    const launchedIds = [];
    for (const pid of profileIds) {
      const pName = profiles.find(p => p.id === pid)?.name || pid;
      try {
        addLog(`Abriendo navegador para ${pName}...`, 'info');
        await window.api.launchBrowser(pid);
        launchedIds.push(pid);
      } catch (err) {
        if (err?.message?.includes('ya tiene') || err?.message?.includes('already')) {
          launchedIds.push(pid);
        } else {
          addLog(`Error abriendo ${pName}: ${err.message}`, 'error');
        }
      }
    }
    if (launchedIds.length === 0) return [];

    addLog(`Esperando login/2FA de ${launchedIds.length} perfil(es)...`, 'info');
    const readyIds = [];
    const failedIds = [];
    const startTime = Date.now();

    while (Date.now() - startTime < 90000) {
      await new Promise(r => setTimeout(r, 5000));
      const loginStatus = await window.api.getBrowserLoginStatus().catch(() => []);
      const activeBrowsers = await window.api.getBrowserStatus().catch(() => []);

      for (const pid of launchedIds) {
        if (readyIds.includes(pid) || failedIds.includes(pid)) continue;
        const pName = profiles.find(p => p.id === pid)?.name || pid;
        const status = loginStatus.find(s => s.id === pid);
        const isActive = activeBrowsers.includes(pid);

        if (status?.loggedIn) {
          readyIds.push(pid);
          addLog(`${pName}: logueado y listo`, 'done');
        } else if (!isActive) {
          failedIds.push(pid);
          addLog(`${pName}: fallo login`, 'error');
        }
      }
      if (readyIds.length + failedIds.length >= launchedIds.length) break;
    }

    const finalStatus = await window.api.getBrowserLoginStatus().catch(() => []);
    for (const pid of launchedIds) {
      if (!readyIds.includes(pid) && !failedIds.includes(pid)) {
        const s = finalStatus.find(x => x.id === pid);
        if (s?.loggedIn) readyIds.push(pid);
      }
    }

    await loadData();
    addLog(`${readyIds.length} de ${launchedIds.length} perfil(es) listos`, readyIds.length > 0 ? 'done' : 'error');
    return readyIds;
  };

  // ---- Simple mode execution ----
  const handleRunSimple = async () => {
    if (!selectedAction || selectedProfiles.length === 0) return;
    setRunning(true);
    cancelledRef.current = false;

    // Auto-open browsers
    const readyIds = await ensureBrowsersOpen(selectedProfiles);
    if (readyIds.length === 0) { setRunning(false); addLog('No se pudieron abrir navegadores', 'error'); return; }

    addLog(`Ejecutando ${selectedAction.name} en ${readyIds.length} perfil(es)...`, 'start');

    for (const pid of readyIds) {
      if (cancelledRef.current) break;
      try {
        const result = await executeAction(pid, selectedAction.id, config);
        if (result?.error) {
          addLog(`Error: ${result.error}`, 'error');
        } else if (Array.isArray(result) && result.length > 0) {
          // Scrape results — show count and details
          addLog(`Extraidos ${result.length} resultados:`, 'done');
          result.forEach((item, i) => {
            const title = item.title || item.name || '';
            const price = item.price || '';
            const href = item.href || '';
            addLog(`  ${i + 1}. ${title} ${price ? '— ' + price : ''} ${href ? '(' + href.substring(0, 60) + '...)' : ''}`, 'info');
          });
        } else if (result && typeof result === 'object') {
          // Single result with stats (e.g. contacted, liked, etc.)
          const stats = Object.entries(result)
            .filter(([k, v]) => typeof v === 'number' || typeof v === 'boolean')
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          if (stats) addLog(`Resultado: ${stats}`, 'done');
        }
      } catch (err) {
        addLog(`Error: ${err?.message || err}`, 'error');
      }
    }
    setRunning(false);
    addLog('Ejecucion completada', 'done');
    loadData();
  };

  // ---- Pipeline execution ----
  const handleRunPipeline = async () => {
    if (pipelineSteps.length === 0 || selectedProfiles.length === 0) return;
    setRunning(true);
    cancelledRef.current = false;
    addLog(`Iniciando pipeline "${pipelineName || 'Sin nombre'}" con ${pipelineSteps.length} paso(s) en ${selectedProfiles.length} perfil(es)`, 'start');

    for (let i = 0; i < pipelineSteps.length; i++) {
      if (cancelledRef.current) break;
      const step = pipelineSteps[i];
      const action = getActionById(step.actionId);
      setCurrentStepIdx(i);
      addLog(`--- Paso ${i + 1}/${pipelineSteps.length}: ${action?.name || step.actionId} ---`, 'start');

      for (const profileId of selectedProfiles) {
        if (cancelledRef.current) break;
        try {
          await executeAction(profileId, step.actionId, step.config);
        } catch (err) {
          addLog(`Error en paso ${i + 1}: ${err?.message || err}`, 'error');
        }
      }
    }

    setCurrentStepIdx(-1);
    setRunning(false);
    if (!cancelledRef.current) addLog('Pipeline completado', 'done');
    loadData();
  };

  const handleCancel = async () => {
    cancelledRef.current = true;
    for (const id of selectedProfiles) {
      try { await window.api.cancelAutomation(id); } catch {}
    }
    setRunning(false);
    setCurrentStepIdx(-1);
    addLog('Automatizaciones canceladas', 'error');
  };

  // ---- Helpers ----
  function addLog(msg, evt) {
    setLogs((prev) => [...prev.slice(-200), { time: new Date().toLocaleTimeString(), msg, evt }]);
  }

  // ---- Pipeline CRUD ----
  const addPipelineStep = (actionId) => {
    const newStep = { actionId, config: getDefaultConfig(actionId) };
    setPipelineSteps((prev) => [...prev, newStep]);
    setExpandedStep(pipelineSteps.length);
    setShowActionPicker(false);
  };

  const removePipelineStep = (idx) => {
    setPipelineSteps((prev) => prev.filter((_, i) => i !== idx));
    if (expandedStep === idx) setExpandedStep(null);
    else if (expandedStep > idx) setExpandedStep(expandedStep - 1);
  };

  const updateStepConfig = (idx, newConfig) => {
    setPipelineSteps((prev) => prev.map((s, i) => i === idx ? { ...s, config: newConfig } : s));
  };

  const moveStep = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= pipelineSteps.length) return;
    setPipelineSteps((prev) => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
    if (expandedStep === idx) setExpandedStep(newIdx);
    else if (expandedStep === newIdx) setExpandedStep(idx);
  };

  const handleSavePipeline = () => {
    if (!pipelineName.trim() || pipelineSteps.length === 0) return;
    const pipeline = { name: pipelineName.trim(), steps: pipelineSteps };
    const existing = loadPipelines();
    const existIdx = existing.findIndex((p) => p.name === pipeline.name);
    if (existIdx >= 0) existing[existIdx] = pipeline;
    else existing.push(pipeline);
    savePipelines(existing);
    setSavedPipelines(existing);
    addLog(`Pipeline "${pipeline.name}" guardado`, 'done');
  };

  const handleLoadPipeline = (idx) => {
    const pipelines = loadPipelines();
    if (idx < 0 || idx >= pipelines.length) return;
    const p = pipelines[idx];
    setPipelineName(p.name);
    setPipelineSteps(p.steps);
    setExpandedStep(null);
    setSelectedPipelineIdx(idx);
    addLog(`Pipeline "${p.name}" cargado`, 'start');
  };

  const handleDeletePipeline = (idx) => {
    const pipelines = loadPipelines();
    const name = pipelines[idx]?.name;
    pipelines.splice(idx, 1);
    savePipelines(pipelines);
    setSavedPipelines(pipelines);
    setSelectedPipelineIdx(-1);
    addLog(`Pipeline "${name}" eliminado`, 'error');
  };

  const categories = [...new Set(FB_ACTIONS.map(a => a.category))];
  const filteredActions = filterCategory === 'all' ? FB_ACTIONS : FB_ACTIONS.filter(a => a.category === filterCategory);

  // ---- RENDER ----
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-trust-dark flex items-center gap-2">
            <span className="text-2xl">📘</span> Facebook Automations
          </h2>
          <p className="text-xs text-trust-muted mt-1">Marketplace, Messenger, Grupos, Posts y Engagement</p>
        </div>
        {/* Mode toggle */}
        <div className="flex bg-trust-surface border border-trust-border rounded-lg p-0.5">
          <button
            onClick={() => setMode('simple')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${mode === 'simple' ? 'bg-white text-trust-dark shadow-sm' : 'text-trust-muted hover:text-trust-dark'}`}
          >
            Simple
          </button>
          <button
            onClick={() => setMode('pipeline')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${mode === 'pipeline' ? 'bg-white text-trust-dark shadow-sm' : 'text-trust-muted hover:text-trust-dark'}`}
          >
            Pipeline
          </button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* ================================================================ */}
        {/* LEFT SIDEBAR - Profile selector                                  */}
        {/* ================================================================ */}
        <div className="w-44 flex-shrink-0 bg-white rounded-xl border border-trust-border p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-trust-dark">Perfiles activos</h3>
            <button onClick={selectAll} className="text-[10px] text-blue-500 hover:underline">Todos</button>
          </div>
          {allProfiles.length === 0 && <p className="text-[10px] text-trust-muted">No hay perfiles con credenciales</p>}
          {allProfiles.map(p => {
            const isActive = runningIds.includes(p.id);
            const isSelected = selectedProfiles.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggleProfile(p.id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs mb-0.5 truncate ${isSelected ? 'bg-blue-500/10 text-blue-600 font-medium' : 'text-trust-muted hover:bg-trust-surface'}`}>
                {isSelected ? '✓ ' : ''}<span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>{p.name}
              </button>
            );
          })}
        </div>

        {/* ================================================================ */}
        {/* MAIN AREA                                                        */}
        {/* ================================================================ */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {mode === 'simple' ? (
            /* ---------- SIMPLE MODE ---------- */
            <>
              {/* Category filter */}
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setFilterCategory('all')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                    filterCategory === 'all' ? 'bg-trust-accent text-white border-trust-accent' : 'border-trust-border text-trust-muted hover:text-trust-dark'
                  }`}
                >Todas</button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFilterCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      filterCategory === cat ? 'bg-trust-accent text-white border-trust-accent' : 'border-trust-border text-trust-muted hover:text-trust-dark'
                    }`}
                  >{cat}</button>
                ))}
              </div>

              {/* Action grid */}
              <div className="bg-white border border-trust-border rounded-xl p-4 shadow-trust">
                <h3 className="text-sm font-semibold text-trust-dark mb-3">Selecciona una accion</h3>
                <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                  {filteredActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => { setSelectedAction(action); setConfig(getDefaultConfig(action.id)); }}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-all ${
                        selectedAction?.id === action.id
                          ? `bg-trust-accent/5 border-trust-accent/40 ${action.color} shadow-sm`
                          : 'border-trust-border text-trust-muted hover:text-trust-dark hover:border-trust-accent/30 hover:bg-trust-surface'
                      }`}
                    >
                      <span className="text-lg leading-none">{action.icon}</span>
                      <span className="text-[10px] font-semibold leading-tight">{action.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Config for selected action */}
              {selectedAction && (
                <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-lg ${selectedAction.color}`}>{selectedAction.icon}</span>
                    <h3 className="text-sm font-bold text-trust-dark">{selectedAction.name}</h3>
                  </div>
                  <p className="text-xs text-trust-muted mb-4">{selectedAction.desc}</p>
                  <ConfigFields actionId={selectedAction.id} config={config} onChange={setConfig} />
                  <div className="flex gap-3 mt-5">
                    {!running ? (
                      <button
                        onClick={handleRunSimple}
                        disabled={selectedProfiles.length === 0}
                        className="flex-1 px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-trust"
                      >
                        Ejecutar en {selectedProfiles.length} perfil{selectedProfiles.length !== 1 ? 'es' : ''}
                      </button>
                    ) : (
                      <button onClick={handleCancel} className="flex-1 px-4 py-2.5 bg-trust-red text-white rounded-lg text-sm font-bold hover:bg-trust-red/90 transition-colors">
                        Cancelar Todo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ---------- PIPELINE MODE ---------- */
            <>
              {/* Pipeline header */}
              <div className="bg-white border border-trust-border rounded-xl p-4 shadow-trust">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <label className={LABEL_CLASS}>Nombre del pipeline</label>
                    <input
                      type="text"
                      value={pipelineName}
                      onChange={(e) => setPipelineName(e.target.value)}
                      placeholder="Mi pipeline de engagement..."
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="w-52">
                    <label className={LABEL_CLASS}>Cargar guardado</label>
                    <div className="flex gap-1">
                      <select
                        value={selectedPipelineIdx}
                        onChange={(e) => setSelectedPipelineIdx(parseInt(e.target.value))}
                        className={INPUT_CLASS + ' flex-1'}
                      >
                        <option value={-1}>-- Seleccionar --</option>
                        {savedPipelines.map((p, i) => (
                          <option key={i} value={i}>{p.name} ({p.steps.length} pasos)</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 items-end pt-5">
                    <button
                      onClick={() => handleLoadPipeline(selectedPipelineIdx)}
                      disabled={selectedPipelineIdx < 0}
                      className="px-3 py-2.5 bg-trust-surface border border-trust-border text-trust-dark rounded-lg text-xs font-semibold hover:bg-trust-accent/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Cargar
                    </button>
                    <button
                      onClick={() => handleDeletePipeline(selectedPipelineIdx)}
                      disabled={selectedPipelineIdx < 0}
                      className="px-3 py-2.5 bg-trust-surface border border-trust-border text-trust-red rounded-lg text-xs font-semibold hover:bg-trust-red/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>

              {/* Pipeline steps list */}
              <div className="bg-white border border-trust-border rounded-xl shadow-trust flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-trust-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-trust-dark">
                    Pasos del Pipeline
                    {pipelineSteps.length > 0 && <span className="ml-2 text-trust-muted font-normal">({pipelineSteps.length})</span>}
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {pipelineSteps.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-4xl mb-3 opacity-20">+</div>
                      <p className="text-sm text-trust-muted">Agrega pasos al pipeline con el boton de abajo</p>
                    </div>
                  ) : (
                    pipelineSteps.map((step, idx) => {
                      const action = getActionById(step.actionId);
                      const isExpanded = expandedStep === idx;
                      const isRunningStep = running && currentStepIdx === idx;
                      return (
                        <div
                          key={idx}
                          className={`border rounded-xl transition-all ${
                            isRunningStep
                              ? 'border-trust-yellow bg-trust-yellow/5 shadow-md'
                              : isExpanded
                                ? 'border-trust-accent/40 bg-trust-accent/5'
                                : 'border-trust-border hover:border-trust-accent/30'
                          }`}
                        >
                          <div
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                            onClick={() => setExpandedStep(isExpanded ? null : idx)}
                          >
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              isRunningStep ? 'bg-trust-yellow text-white animate-pulse' : 'bg-trust-accent/10 text-trust-accent'
                            }`}>
                              {idx + 1}
                            </div>
                            <span className={`text-base ${action?.color || ''}`}>{action?.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-trust-dark">{action?.name || step.actionId}</div>
                              <div className="text-xs text-trust-muted truncate">{stepSummary(step.actionId, step.config)}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => moveStep(idx, -1)}
                                disabled={idx === 0}
                                className="w-7 h-7 rounded-lg text-trust-muted hover:text-trust-dark hover:bg-trust-surface transition-colors disabled:opacity-20 text-xs"
                              >
                                &#9650;
                              </button>
                              <button
                                onClick={() => moveStep(idx, 1)}
                                disabled={idx === pipelineSteps.length - 1}
                                className="w-7 h-7 rounded-lg text-trust-muted hover:text-trust-dark hover:bg-trust-surface transition-colors disabled:opacity-20 text-xs"
                              >
                                &#9660;
                              </button>
                              <button
                                onClick={() => removePipelineStep(idx)}
                                className="w-7 h-7 rounded-lg text-trust-red/60 hover:text-trust-red hover:bg-trust-red/5 transition-colors text-sm font-bold"
                              >
                                &times;
                              </button>
                            </div>
                            <span className={`text-trust-muted text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>&#9660;</span>
                          </div>
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 border-t border-trust-border/50">
                              <ConfigFields
                                actionId={step.actionId}
                                config={step.config}
                                onChange={(newCfg) => updateStepConfig(idx, newCfg)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add step + action buttons */}
                <div className="px-4 py-3 border-t border-trust-border space-y-3">
                  {showActionPicker && (
                    <div className="bg-trust-surface border border-trust-border rounded-xl p-3 max-h-52 overflow-y-auto">
                      <div className="grid grid-cols-3 xl:grid-cols-4 gap-1.5">
                        {FB_ACTIONS.map((action) => (
                          <button
                            key={action.id}
                            onClick={() => addPipelineStep(action.id)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent text-left transition-all hover:border-trust-accent/30 hover:bg-white"
                          >
                            <span className={`text-sm ${action.color}`}>{action.icon}</span>
                            <span className="text-xs font-medium text-trust-dark truncate">{action.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowActionPicker(!showActionPicker)}
                      className="flex-1 px-4 py-2.5 bg-trust-surface border border-trust-border text-trust-dark rounded-lg text-sm font-semibold hover:bg-trust-accent/5 hover:border-trust-accent/30 transition-colors"
                    >
                      {showActionPicker ? 'Cerrar' : '+ Agregar Paso'}
                    </button>
                    <button
                      onClick={handleSavePipeline}
                      disabled={pipelineSteps.length === 0 || !pipelineName.trim()}
                      className="px-4 py-2.5 bg-trust-surface border border-trust-border text-trust-accent rounded-lg text-sm font-semibold hover:bg-trust-accent/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Guardar Pipeline
                    </button>
                    {!running ? (
                      <button
                        onClick={handleRunPipeline}
                        disabled={selectedProfiles.length === 0 || pipelineSteps.length === 0}
                        className="px-6 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-trust"
                      >
                        Ejecutar Pipeline
                      </button>
                    ) : (
                      <button
                        onClick={handleCancel}
                        className="px-6 py-2.5 bg-trust-red text-white rounded-lg text-sm font-bold hover:bg-trust-red/90 transition-colors"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ================================================================ */}
        {/* RIGHT PANEL - Activity Log                                       */}
        {/* ================================================================ */}
        <div className="w-72 shrink-0 flex flex-col">
          <div className="bg-white border border-trust-border rounded-xl flex-1 flex flex-col min-h-0 shadow-trust">
            <div className="px-4 py-3 border-b border-trust-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-trust-dark">Log de actividad</h3>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-xs text-trust-muted hover:text-trust-dark font-medium">Limpiar</button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 bg-trust-dark rounded-b-xl font-mono text-xs space-y-1">
              {logs.length === 0 ? (
                <p className="text-white/20 text-center py-8">Las acciones apareceran aqui...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`flex gap-2 leading-relaxed ${
                    log.evt === 'error' ? 'text-red-400' : log.evt === 'done' ? 'text-green-400' : 'text-white/60'
                  }`}>
                    <span className="text-white/30 shrink-0">{log.time}</span>
                    <span>{log.msg}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
