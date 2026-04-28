import React, { useState, useEffect, useRef } from 'react';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-blue-500';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';
const BTN_PRIMARY = 'px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40';
const BTN_SECONDARY = 'px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40';

const CATEGORIES = ['Electronica', 'Vehiculos', 'Hogar y Jardin', 'Ropa y Accesorios', 'Deportes', 'Juguetes', 'Instrumentos Musicales', 'Otra'];
const CONDITIONS = ['Nuevo', 'Como nuevo', 'Buen estado', 'Aceptable'];
const CURRENCIES = [
  { value: 'USD', label: 'USD ($)' }, { value: 'EUR', label: 'EUR (€)' }, { value: 'GBP', label: 'GBP (£)' },
  { value: 'MXN', label: 'MXN ($)' }, { value: 'PEN', label: 'PEN (S/)' }, { value: 'ARS', label: 'ARS ($)' },
  { value: 'COP', label: 'COP ($)' }, { value: 'CLP', label: 'CLP ($)' }, { value: 'BRL', label: 'BRL (R$)' },
  { value: 'DOP', label: 'DOP (RD$)' }, { value: 'CAD', label: 'CAD ($)' }, { value: 'AUD', label: 'AUD ($)' },
];

const TABS = [
  { id: 'publish', name: 'Publicar', icon: '🏪' },
  { id: 'scrape', name: 'Scrape', icon: '🔍' },
  { id: 'contact', name: 'Contactar', icon: '📩' },
  { id: 'repost', name: 'Repostear', icon: '🔄' },
  { id: 'autoreply', name: 'Auto-Responder', icon: '💬' },
];

export default function Marketplace({ tier }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [activeTab, setActiveTab] = useState('publish');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);

  // Form states
  const [publishForm, setPublishForm] = useState({ title: '', price: '', currency: 'USD', description: '', category: 'Electronica', condition: 'Nuevo', location: '', photos: '', aiTitle: false, aiDescription: false });
  const [scrapeForm, setScrapeForm] = useState({ query: '', maxResults: 50, deep: false });
  const [scrapeResults, setScrapeResults] = useState([]);
  const [scrapeSort, setScrapeSort] = useState('default'); // default, price-asc, price-desc, title-az, title-za
  const [scrapeFilter, setScrapeFilter] = useState('');
  const [scrapeCondFilter, setScrapeCondFilter] = useState('all'); // all, new, used
  const [scrapeCurrFilter, setScrapeCurrFilter] = useState('all');
  const [contactForm, setContactForm] = useState({ query: '', message: '', maxContacts: 10, delayMin: 15, delayMax: 45, directLinks: '' });
  const [repostForm, setRepostForm] = useState({ listingUrl: '' });
  const [autoreplyForm, setAutoreplyForm] = useState({ template: '', mode: 'chatbot', instructions: '' });
  const [aiLoading, setAiLoading] = useState(false);

  // AI: vary title
  const handleAiTitle = async () => {
    if (!publishForm.title) return;
    setAiLoading(true);
    try {
      const result = await window.api.generateAIText('anthropic', '', `Genera una variacion creativa de este titulo de producto para Facebook Marketplace. Solo responde con el titulo nuevo, sin explicaciones ni comillas. Titulo original: "${publishForm.title}"`);
      if (result?.error) addLog(`Error IA: ${result.error}`, 'error');
      else if (result) setPublishForm(p => ({...p, title: result.trim().replace(/^"|"$/g, '')}));
    } catch {}
    setAiLoading(false);
  };

  // AI: generate description
  const handleAiDescription = async () => {
    if (!publishForm.title) return;
    setAiLoading(true);
    try {
      const result = await window.api.generateAIText('anthropic', '', `Genera una descripcion corta y atractiva para vender este producto en Facebook Marketplace. Maximo 3 oraciones. Solo la descripcion, sin titulo ni comillas. Producto: "${publishForm.title}" ${publishForm.price ? `Precio: ${publishForm.price}` : ''} ${publishForm.condition ? `Estado: ${publishForm.condition}` : ''}`);
      if (result?.error) addLog(`Error IA: ${result.error}`, 'error');
      else if (result) setPublishForm(p => ({...p, description: result.trim().replace(/^"|"$/g, '')}));
    } catch {}
    setAiLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = () => window.api.listProfiles().then(p => setProfiles(p || []));

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [...prev.slice(-100), { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  // Show ALL profiles (not just active) — we auto-launch them
  const allProfiles = profiles.filter(p => p.fb_user);
  const toggleProfile = (id) => setSelectedProfiles(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll = () => setSelectedProfiles(allProfiles.map(p => p.id));

  /**
   * Ensure browsers are open and logged in for selected profiles.
   * Launches browsers, waits for login/2FA to complete, returns only ready profile IDs.
   */
  const ensureBrowsersOpen = async (profileIds) => {
    const launchedIds = [];

    // Step 1: Launch all browsers
    for (const pid of profileIds) {
      const pName = profiles.find(p => p.id === pid)?.name || pid;
      try {
        addLog(`Abriendo navegador para ${pName}...`);
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

    // Step 2: Wait for login/2FA to complete (poll every 5s, up to 90s)
    addLog(`Esperando login/2FA de ${launchedIds.length} perfil(es)... (hasta 90s)`);
    const readyIds = [];
    const failedIds = [];
    const startTime = Date.now();

    while (Date.now() - startTime < 90000) {
      await new Promise(r => setTimeout(r, 5000));

      // Check REAL login status — is the browser actually on Facebook (not /login or 2FA)?
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
          // Browser closed — login failed
          failedIds.push(pid);
          addLog(`${pName}: fallo login (navegador cerrado)`, 'error');
        }
        // If active but not logged in — still in login/2FA process, keep waiting
      }

      if (readyIds.length + failedIds.length >= launchedIds.length) break;

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const pending = launchedIds.length - readyIds.length - failedIds.length;
      if (pending > 0 && elapsed % 10 < 5) {
        addLog(`Esperando ${pending} perfil(es)... (${elapsed}s)`);
      }
    }

    // Final check for any remaining
    const finalStatus = await window.api.getBrowserLoginStatus().catch(() => []);
    for (const pid of launchedIds) {
      if (!readyIds.includes(pid) && !failedIds.includes(pid)) {
        const s = finalStatus.find(x => x.id === pid);
        const pName = profiles.find(p => p.id === pid)?.name || pid;
        if (s?.loggedIn) {
          readyIds.push(pid);
          addLog(`${pName}: logueado (tardio)`, 'done');
        } else {
          addLog(`${pName}: no logueado — omitido`, 'error');
        }
      }
    }

    await loadProfiles();
    addLog(`${readyIds.length} de ${launchedIds.length} perfil(es) listos`, readyIds.length > 0 ? 'done' : 'error');
    return readyIds;
  };

  // ── Publish ──
  const handlePublish = async () => {
    if (!publishForm.title || selectedProfiles.length === 0) return;
    setRunning(true);
    const readyIds = await ensureBrowsersOpen(selectedProfiles);
    if (readyIds.length === 0) { setRunning(false); addLog('No se pudieron abrir navegadores', 'error'); return; }
    const photos = publishForm.photos ? publishForm.photos.split(',').map(p => p.trim()).filter(Boolean) : [];
    addLog(`Publicando "${publishForm.title}" en ${readyIds.length} perfil(es)...`);
    for (const pid of readyIds) {
      try {
        let title = publishForm.title;
        let description = publishForm.description;

        // Generate AI variations per profile if checkboxes are on
        if (publishForm.aiTitle && title) {
          addLog(`Generando titulo con IA...`);
          const aiResult = await window.api.generateAIText('anthropic', '', `Genera una variacion creativa de este titulo de producto para Facebook Marketplace. Solo responde con el titulo nuevo, sin explicaciones ni comillas. Titulo original: "${title}"`);
          if (aiResult?.text) {
            title = aiResult.text.replace(/^"|"$/g, '');
            addLog(`Titulo IA: "${title}"`);
          } else if (aiResult?.error) {
            addLog(`Error IA: ${aiResult.error}`, 'error');
          }
        }
        if (publishForm.aiDescription) {
          addLog(`Generando descripcion con IA...`);
          const aiResult = await window.api.generateAIText('anthropic', '', `Genera una descripcion corta y atractiva para vender este producto en Facebook Marketplace. Maximo 3 oraciones. Solo la descripcion, sin titulo ni comillas. Producto: "${title}" ${publishForm.price ? `Precio: ${publishForm.price}` : ''} ${publishForm.condition ? `Estado: ${publishForm.condition}` : ''}`);
          if (aiResult?.text) {
            description = aiResult.text.replace(/^"|"$/g, '');
            addLog(`Descripcion IA generada`);
          } else if (aiResult?.error) {
            addLog(`Error IA: ${aiResult.error}`, 'error');
          }
        }

        const result = await window.api.fbMarketplaceCreate(pid, { ...publishForm, title, description, mpPhotos: photos, autoPublish: true });
        if (result?.error) {
          addLog(`Error: ${result.error}`, 'error');
          // Close browser if account is blocked/limited
          if (result.error.toLowerCase().includes('bloqueada') || result.error.toLowerCase().includes('limit')) {
            try { await window.api.closeBrowser(pid); } catch {}
            addLog(`Navegador cerrado (cuenta limitada)`, 'error');
          }
        } else addLog(`Publicado exitosamente`, 'done');
      } catch (err) {
        addLog(`Error: ${err?.message || err}`, 'error');
      }
    }
    setRunning(false);
    addLog('Publicacion completada', 'done');
  };

  // ── Scrape ──
  const handleScrape = async () => {
    if (!scrapeForm.query || selectedProfiles.length === 0) return;
    setRunning(true);
    const readyIds = await ensureBrowsersOpen(selectedProfiles);
    if (readyIds.length === 0) { setRunning(false); addLog('No se pudieron abrir navegadores', 'error'); return; }
    setScrapeResults([]);
    const perProfile = Math.ceil(scrapeForm.maxResults / readyIds.length);
    const mode = scrapeForm.deep ? 'profundo' : 'rapido';
    addLog(`Scrape ${mode}: "${scrapeForm.query}" con ${readyIds.length} perfil(es) (${perProfile} c/u)...`);
    const allResults = [];
    for (const pid of readyIds) {
      try {
        const pName = profiles.find(p => p.id === pid)?.name || pid;
        addLog(`Scrapeando con ${pName}...`);
        const scrapeFn = scrapeForm.deep ? window.api.fbMarketplaceDeepScrape : window.api.fbMarketplaceScrape;
        const results = await scrapeFn(pid, scrapeForm.query, perProfile);
        if (Array.isArray(results)) {
          for (const r of results) {
            if (!allResults.find(x => x.href === r.href)) allResults.push(r);
          }
          addLog(`${pName}: ${results.length} listings encontrados`, 'done');
        } else if (results?.error) {
          addLog(`${pName}: ${results.error}`, 'error');
        }
      } catch (err) {
        addLog(`Error: ${err?.message || err}`, 'error');
      }
    }
    setScrapeResults(allResults);
    addLog(`Total: ${allResults.length} listings unicos extraidos (${mode})`, 'done');
    setRunning(false);
  };

  // ── Contact Sellers ──
  const handleContact = async () => {
    if ((!contactForm.query && !contactForm.directLinks) || selectedProfiles.length === 0) return;
    setRunning(true);
    const readyIds = await ensureBrowsersOpen(selectedProfiles);
    if (readyIds.length === 0) { setRunning(false); addLog('No se pudieron abrir navegadores', 'error'); return; }

    // If direct links provided, use those instead of search
    const directLinks = contactForm.directLinks ? contactForm.directLinks.split('\n').map(l => l.trim()).filter(l => l.startsWith('http')) : [];

    if (directLinks.length > 0) {
      addLog(`Contactando ${directLinks.length} listing(s) por links directos...`);
      for (const pid of readyIds) {
        try {
          const result = await window.api.fbMarketplaceContact(pid, '', contactForm.message, {
            maxContacts: contactForm.maxContacts,
            minDelay: contactForm.delayMin * 1000,
            maxDelay: contactForm.delayMax * 1000,
            directLinks,
          });
          if (result?.error) addLog(`Error: ${result.error}`, 'error');
          else addLog(`Contactados: ${result.contacted}, Errores: ${result.errors}`, 'done');
        } catch (err) {
          addLog(`Error: ${err?.message || err}`, 'error');
        }
      }
    } else {
      addLog(`Contactando vendedores de "${contactForm.query}" (max: ${contactForm.maxContacts})...`);
      for (const pid of readyIds) {
        try {
          const result = await window.api.fbMarketplaceContact(pid, contactForm.query, contactForm.message, {
            maxContacts: contactForm.maxContacts,
            minDelay: contactForm.delayMin * 1000,
            maxDelay: contactForm.delayMax * 1000,
          });
          if (result?.error) addLog(`Error: ${result.error}`, 'error');
          else addLog(`Contactados: ${result.contacted}, Errores: ${result.errors}`, 'done');
        } catch (err) {
          addLog(`Error: ${err?.message || err}`, 'error');
        }
      }
    }
    setRunning(false);
  };

  // ── Repost ──
  const handleRepost = async () => {
    if (!repostForm.listingUrl || selectedProfiles.length === 0) return;
    setRunning(true);
    const readyIds = await ensureBrowsersOpen(selectedProfiles);
    if (readyIds.length === 0) { setRunning(false); addLog('No se pudieron abrir navegadores', 'error'); return; }
    addLog(`Reposteando listing...`);
    for (const pid of readyIds) {
      try {
        const result = await window.api.fbMarketplaceRepost(pid, repostForm.listingUrl, {});
        if (result?.error) addLog(`Error: ${result.error}`, 'error');
        else addLog(`Reposteado exitosamente`, 'done');
      } catch (err) {
        addLog(`Error: ${err?.message || err}`, 'error');
      }
    }
    setRunning(false);
  };

  // ── Auto-Reply / Chatbot ──
  const handleAutoreply = async () => {
    if (selectedProfiles.length === 0) return;
    if (autoreplyForm.mode === 'template' && !autoreplyForm.template) return;
    setRunning(true);
    const readyIds = await ensureBrowsersOpen(selectedProfiles);
    if (readyIds.length === 0) { setRunning(false); addLog('No se pudieron abrir navegadores', 'error'); return; }

    if (autoreplyForm.mode === 'chatbot') {
      addLog(`Chatbot IA activado — procesando conversaciones...`);
      for (const pid of readyIds) {
        try {
          const pName = profiles.find(p => p.id === pid)?.name || pid;
          const result = await window.api.fbMarketplaceChatbot(pid, autoreplyForm.instructions || '');
          if (result?.error) addLog(`${pName}: ${result.error}`, 'error');
          else if (result?.message) addLog(`${pName}: ${result.message}`, 'warning');
          else if (result.replied === 0 && result.skipped === 0 && result.errors === 0) addLog(`${pName}: No hay mensajes sin responder`, 'warning');
          else if (result.replied === 0) addLog(`${pName}: No hay mensajes pendientes (${result.skipped} ya respondidos)`, 'warning');
          else addLog(`${pName}: ${result.replied} respondidos | ${result.skipped} omitidos | ${result.errors} errores`, 'done');
        } catch (err) {
          addLog(`Error: ${err?.message || err}`, 'error');
        }
      }
    } else {
      addLog(`Auto-respondiendo con template...`);
      for (const pid of readyIds) {
        try {
          const pName2 = profiles.find(p => p.id === pid)?.name || pid;
          const result = await window.api.fbMarketplaceAutoreply(pid, autoreplyForm.template);
          if (result?.error) addLog(`${pName2}: ${result.error}`, 'error');
          else if (result?.message) addLog(`${pName2}: ${result.message}`, 'warning');
          else if (result.replied === 0 && result.skipped === 0 && result.errors === 0) addLog(`${pName2}: No hay mensajes sin responder`, 'warning');
          else if (result.replied === 0) addLog(`${pName2}: No hay mensajes pendientes (${result.skipped} ya respondidos)`, 'warning');
          else addLog(`${pName2}: ${result.replied} respondidos | ${result.skipped} omitidos | ${result.errors} errores`, 'done');
        } catch (err) {
          addLog(`Error: ${err?.message || err}`, 'error');
        }
      }
    }
    setRunning(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold text-trust-dark flex items-center gap-2">🏪 Marketplace</h2>
        <p className="text-xs text-trust-muted mt-1">Publica, scrapea, contacta vendedores y gestiona listings</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-trust-surface rounded-xl p-1">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-sm' : 'text-trust-muted hover:text-trust-dark hover:bg-white'}`}>
            <span>{tab.icon}</span> {tab.name}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Profile selector */}
        <div className="w-44 flex-shrink-0 bg-white rounded-xl border border-trust-border p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-trust-dark">Perfiles activos</h3>
            <button onClick={selectAll} className="text-[10px] text-blue-500 hover:underline">Todos</button>
          </div>
          {allProfiles.length === 0 && <p className="text-[10px] text-trust-muted">No hay perfiles con credenciales</p>}
          {allProfiles.map(p => {
            const isActive = p.status === 'active' || p.fb_logged_in;
            const isSelected = selectedProfiles.includes(p.id);
            return (
              <button key={p.id} onClick={() => toggleProfile(p.id)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs mb-0.5 truncate ${isSelected ? 'bg-blue-500/10 text-blue-600 font-medium' : 'text-trust-muted hover:bg-trust-surface'}`}>
                {isSelected ? '✓ ' : ''}<span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${isActive ? 'bg-green-500' : 'bg-gray-400'}`}></span>{p.name}
              </button>
            );
          })}
        </div>

        {/* Center: Active tab content */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          <div className="bg-white rounded-xl border border-trust-border p-4 flex-1 overflow-y-auto">

            {/* ── PUBLISH TAB ── */}
            {activeTab === 'publish' && (
              <div>
                <h3 className="text-sm font-semibold text-trust-dark mb-3">🏪 Publicar en Marketplace</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <div className="flex items-center justify-between">
                      <label className={LABEL_CLASS}>Titulo</label>
                      <label className="flex items-center gap-1.5 cursor-pointer mb-1">
                        <input type="checkbox" checked={publishForm.aiTitle} onChange={e => setPublishForm(p => ({...p, aiTitle: e.target.checked}))} className="accent-purple-600 w-3 h-3" />
                        <span className="text-[10px] text-purple-500 font-medium">✨ Variar con IA al publicar</span>
                      </label>
                    </div>
                    <input type="text" value={publishForm.title} onChange={e => setPublishForm(p => ({...p, title: e.target.value}))} placeholder="iPhone 15 Pro Max 256GB" className={INPUT_CLASS} />
                  </div>
                  <div>
                    <label className={LABEL_CLASS}>Divisa</label>
                    <select value={publishForm.currency} onChange={e => setPublishForm(p => ({...p, currency: e.target.value}))} className={INPUT_CLASS}>
                      {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div><label className={LABEL_CLASS}>Precio</label><input type="number" value={publishForm.price} onChange={e => setPublishForm(p => ({...p, price: e.target.value}))} placeholder="999" className={INPUT_CLASS} /></div>
                  <div><label className={LABEL_CLASS}>Categoria</label><select value={publishForm.category} onChange={e => setPublishForm(p => ({...p, category: e.target.value}))} className={INPUT_CLASS}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className={LABEL_CLASS}>Estado</label><select value={publishForm.condition} onChange={e => setPublishForm(p => ({...p, condition: e.target.value}))} className={INPUT_CLASS}>{CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div className="col-span-2"><label className={LABEL_CLASS}>Ubicacion</label><input type="text" value={publishForm.location} onChange={e => setPublishForm(p => ({...p, location: e.target.value}))} placeholder="Lima, Peru" className={INPUT_CLASS} /></div>
                  <div className="col-span-2">
                    <div className="flex items-center justify-between">
                      <label className={LABEL_CLASS}>Descripcion</label>
                      <label className="flex items-center gap-1.5 cursor-pointer mb-1">
                        <input type="checkbox" checked={publishForm.aiDescription} onChange={e => setPublishForm(p => ({...p, aiDescription: e.target.checked}))} className="accent-purple-600 w-3 h-3" />
                        <span className="text-[10px] text-purple-500 font-medium">✨ Generar con IA al publicar</span>
                      </label>
                    </div>
                    <textarea value={publishForm.description} onChange={e => setPublishForm(p => ({...p, description: e.target.value}))} rows={2} placeholder="Producto en excelente estado..." className={INPUT_CLASS + ' resize-none'} />
                  </div>
                  <div className="col-span-2">
                    <label className={LABEL_CLASS}>Fotos (arrastra una carpeta aqui o escribe la ruta)</label>
                    <input type="text" value={publishForm.photos}
                      onChange={e => setPublishForm(p => ({...p, photos: e.target.value}))}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#3b82f6'; }}
                      onDragLeave={e => { e.currentTarget.style.borderColor = ''; }}
                      onDrop={e => {
                        e.preventDefault();
                        e.currentTarget.style.borderColor = '';
                        const files = e.dataTransfer.files;
                        if (files.length > 0) {
                          // Get the path from the dropped file/folder
                          const path = files[0].path || files[0].name;
                          setPublishForm(p => ({...p, photos: path}));
                        }
                      }}
                      placeholder="Arrastra una carpeta aqui o escribe /ruta/carpeta-fotos"
                      className={INPUT_CLASS} />
                  </div>
                </div>
                <button onClick={handlePublish} disabled={running || !publishForm.title || selectedProfiles.length === 0} className={BTN_PRIMARY + ' mt-4'}>
                  {running ? (aiLoading ? 'Generando con IA...' : 'Publicando...') : `Publicar en ${selectedProfiles.length} perfil(es)`}
                </button>
              </div>
            )}

            {/* ── SCRAPE TAB ── */}
            {activeTab === 'scrape' && (
              <div>
                <h3 className="text-sm font-semibold text-trust-dark mb-3">🔍 Scrape Marketplace</h3>
                <div className="flex gap-2 mb-2">
                  <input type="text" value={scrapeForm.query} onChange={e => setScrapeForm(p => ({...p, query: e.target.value}))} placeholder="iPhone, laptop, auto..." className={INPUT_CLASS} onKeyDown={e => e.key === 'Enter' && handleScrape()} />
                  <input type="number" value={scrapeForm.maxResults} onChange={e => setScrapeForm(p => ({...p, maxResults: parseInt(e.target.value) || 50}))} className={INPUT_CLASS + ' w-20'} min={1} max={500} />
                  <button onClick={handleScrape} disabled={running || !scrapeForm.query || selectedProfiles.length === 0} className={BTN_PRIMARY + ' whitespace-nowrap'}>
                    {running ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={scrapeForm.deep} onChange={e => setScrapeForm(p => ({...p, deep: e.target.checked}))} className="accent-blue-600 w-3.5 h-3.5" />
                  <span className="text-xs text-trust-muted">Scrape profundo — extrae descripcion, vendedor, estado, fotos (mas lento)</span>
                </label>
                {scrapeResults.length > 0 && (() => {
                  // Parse numeric price for sorting/filtering
                  const parsePrice = (p) => {
                    if (!p) return 0;
                    const nums = p.replace(/[^\d.,]/g, '').replace(',', '');
                    return parseFloat(nums) || 0;
                  };

                  // Get unique currencies and conditions for filters
                  const currencies = [...new Set(scrapeResults.map(r => r.currency).filter(Boolean))];
                  const conditions = [...new Set(scrapeResults.map(r => (r.condition || '').toLowerCase()).filter(Boolean))];

                  // Apply filters
                  let filtered = scrapeResults.filter(r => {
                    if (scrapeFilter) {
                      const q = scrapeFilter.toLowerCase();
                      const match = (r.title || '').toLowerCase().includes(q) ||
                        (r.description || '').toLowerCase().includes(q) ||
                        (r.seller || '').toLowerCase().includes(q) ||
                        (r.location || '').toLowerCase().includes(q);
                      if (!match) return false;
                    }
                    if (scrapeCondFilter !== 'all') {
                      const cond = (r.condition || '').toLowerCase();
                      if (scrapeCondFilter === 'new' && !cond.match(/new|nuevo|neuf|novo/)) return false;
                      if (scrapeCondFilter === 'used' && !cond.match(/used|usado|occasion|usado/)) return false;
                    }
                    if (scrapeCurrFilter !== 'all' && r.currency !== scrapeCurrFilter) return false;
                    return true;
                  });

                  // Apply sort
                  if (scrapeSort === 'price-asc') filtered.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
                  else if (scrapeSort === 'price-desc') filtered.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
                  else if (scrapeSort === 'title-az') filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                  else if (scrapeSort === 'title-za') filtered.sort((a, b) => (b.title || '').localeCompare(a.title || ''));

                  return (
                  <div>
                    {/* Toolbar: search, filters, sort, export */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <input type="text" value={scrapeFilter} onChange={e => setScrapeFilter(e.target.value)} placeholder="Filtrar resultados..." className="bg-trust-surface border border-trust-border rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[120px] focus:outline-none focus:border-blue-500" />
                      <select value={scrapeSort} onChange={e => setScrapeSort(e.target.value)} className="bg-trust-surface border border-trust-border rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                        <option value="default">Orden original</option>
                        <option value="price-asc">Precio: menor a mayor</option>
                        <option value="price-desc">Precio: mayor a menor</option>
                        <option value="title-az">Titulo: A → Z</option>
                        <option value="title-za">Titulo: Z → A</option>
                      </select>
                      <select value={scrapeCondFilter} onChange={e => setScrapeCondFilter(e.target.value)} className="bg-trust-surface border border-trust-border rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                        <option value="all">Todo estado</option>
                        <option value="new">Nuevo</option>
                        <option value="used">Usado</option>
                      </select>
                      {currencies.length > 1 && (
                        <select value={scrapeCurrFilter} onChange={e => setScrapeCurrFilter(e.target.value)} className="bg-trust-surface border border-trust-border rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                          <option value="all">Toda divisa</option>
                          {currencies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-trust-muted">{filtered.length} de {scrapeResults.length} resultados</p>
                      <button onClick={() => {
                        const csv = ['Titulo,Precio,Divisa,Ubicacion,Fecha,Estado,Vendedor,Categoria,Fotos,URL,Descripcion',
                          ...filtered.map(r => `"${(r.title||'').replace(/"/g,'""')}","${r.price||''}","${r.currency||''}","${r.location||''}","${r.date||''}","${r.condition||''}","${r.seller||''}","${r.category||''}","${r.photos?.length||0}","${r.href||''}","${(r.description||'').replace(/"/g,'""')}"`)
                        ].join('\n');
                        navigator.clipboard.writeText(csv).then(() => addLog(`CSV copiado (${filtered.length} filas)`, 'done'));
                      }} className="text-[10px] text-blue-500 hover:underline">Copiar CSV</button>
                    </div>

                    {/* Results list */}
                    <div className="max-h-96 overflow-y-auto space-y-1.5">
                      {filtered.map((r, i) => (
                        <div key={i} className="px-3 py-2.5 bg-trust-surface rounded-lg text-xs hover:bg-blue-50">
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-trust-dark font-semibold leading-snug">{r.title || 'Sin titulo'}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[10px] text-trust-muted">
                                {r.location && <span>📍 {r.location}</span>}
                                {r.date && <span>🕐 {r.date}</span>}
                                {r.condition && <span>📦 {r.condition}</span>}
                                {r.seller && <span>👤 {r.seller}</span>}
                                {r.category && <span>🏷️ {r.category}</span>}
                                {r.currency && <span>💱 {r.currency}</span>}
                                {r.photos && r.photos.length > 0 && <span>📸 {r.photos.length} fotos</span>}
                              </div>
                              {r.description && <p className="text-[10px] text-trust-muted mt-1 line-clamp-2">{r.description}</p>}
                            </div>
                            <span className="text-blue-600 font-bold whitespace-nowrap text-sm flex-shrink-0">{r.price || '-'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })()}
              </div>
            )}

            {/* ── CONTACT TAB ── */}
            {activeTab === 'contact' && (
              <div>
                <h3 className="text-sm font-semibold text-trust-dark mb-3">📩 Contactar Vendedores</h3>
                <p className="text-xs text-trust-muted mb-3">Busca listings o pega links directos para enviar "Sigue disponible?"</p>
                <div className="space-y-3">
                  <div><label className={LABEL_CLASS}>Buscar en Marketplace (busqueda automatica)</label><input type="text" value={contactForm.query} onChange={e => setContactForm(p => ({...p, query: e.target.value}))} placeholder="iPhone, laptop, muebles..." className={INPUT_CLASS} /></div>
                  <div>
                    <label className={LABEL_CLASS}>O pegar links de listings directos (uno por linea)</label>
                    <textarea value={contactForm.directLinks} onChange={e => setContactForm(p => ({...p, directLinks: e.target.value}))} rows={3} placeholder="https://facebook.com/marketplace/item/123456&#10;https://facebook.com/marketplace/item/789012&#10;https://facebook.com/marketplace/item/345678" className={INPUT_CLASS + ' resize-none font-mono text-[11px]'} />
                  </div>
                  <div><label className={LABEL_CLASS}>Mensaje personalizado (vacio = "Sigue disponible?")</label><textarea value={contactForm.message} onChange={e => setContactForm(p => ({...p, message: e.target.value}))} rows={2} placeholder="Hola! Me interesa tu producto. Sigue disponible?" className={INPUT_CLASS + ' resize-none'} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><label className={LABEL_CLASS}>Max contactos</label><input type="number" value={contactForm.maxContacts} onChange={e => setContactForm(p => ({...p, maxContacts: parseInt(e.target.value) || 10}))} className={INPUT_CLASS} min={1} max={100} /></div>
                    <div><label className={LABEL_CLASS}>Delay min (seg)</label><input type="number" value={contactForm.delayMin} onChange={e => setContactForm(p => ({...p, delayMin: parseInt(e.target.value) || 15}))} className={INPUT_CLASS} min={5} max={300} /></div>
                    <div><label className={LABEL_CLASS}>Delay max (seg)</label><input type="number" value={contactForm.delayMax} onChange={e => setContactForm(p => ({...p, delayMax: parseInt(e.target.value) || 45}))} className={INPUT_CLASS} min={5} max={300} /></div>
                  </div>
                </div>
                <button onClick={handleContact} disabled={running || (!contactForm.query && !contactForm.directLinks) || selectedProfiles.length === 0} className={BTN_PRIMARY + ' mt-4'}>
                  {running ? 'Contactando...' : `Contactar con ${selectedProfiles.length} perfil(es)`}
                </button>
              </div>
            )}

            {/* ── REPOST TAB ── */}
            {activeTab === 'repost' && (
              <div>
                <h3 className="text-sm font-semibold text-trust-dark mb-3">🔄 Repostear Listings</h3>
                <p className="text-xs text-trust-muted mb-3">Elimina y vuelve a publicar un listing para que aparezca primero</p>
                <div><label className={LABEL_CLASS}>URL del Listing</label><input type="text" value={repostForm.listingUrl} onChange={e => setRepostForm(p => ({...p, listingUrl: e.target.value}))} placeholder="https://facebook.com/marketplace/item/..." className={INPUT_CLASS} /></div>
                <button onClick={handleRepost} disabled={running || !repostForm.listingUrl || selectedProfiles.length === 0} className={BTN_PRIMARY + ' mt-4'}>
                  {running ? 'Reposteando...' : `Repostear en ${selectedProfiles.length} perfil(es)`}
                </button>
              </div>
            )}

            {/* ── AUTOREPLY TAB ── */}
            {activeTab === 'autoreply' && (
              <div>
                <h3 className="text-sm font-semibold text-trust-dark mb-3">💬 Auto-Responder Marketplace</h3>
                <p className="text-xs text-trust-muted mb-3">Responde automaticamente a mensajes de compradores en tus listings</p>

                {/* Mode selector */}
                <div className="flex gap-1 mb-4 bg-trust-surface rounded-lg p-0.5">
                  <button onClick={() => setAutoreplyForm(p => ({...p, mode: 'chatbot'}))}
                    className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${autoreplyForm.mode === 'chatbot' ? 'bg-purple-600 text-white shadow-sm' : 'text-trust-muted hover:text-trust-dark'}`}>
                    Chatbot IA
                  </button>
                  <button onClick={() => setAutoreplyForm(p => ({...p, mode: 'template'}))}
                    className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${autoreplyForm.mode === 'template' ? 'bg-blue-600 text-white shadow-sm' : 'text-trust-muted hover:text-trust-dark'}`}>
                    Template fijo
                  </button>
                </div>

                {autoreplyForm.mode === 'chatbot' ? (
                  <div>
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
                      <p className="text-xs text-purple-700 font-medium mb-1">Chatbot con IA</p>
                      <p className="text-[10px] text-purple-600">Lee los mensajes del comprador, entiende el contexto del producto y genera respuestas inteligentes con Claude. Solo responde conversaciones sin contestar.</p>
                    </div>
                    <label className={LABEL_CLASS}>Instrucciones personalizadas (opcional)</label>
                    <textarea value={autoreplyForm.instructions} onChange={e => setAutoreplyForm(p => ({...p, instructions: e.target.value}))} rows={4}
                      placeholder={"Eres un vendedor amigable. Responde en espanol.\n- Si preguntan disponibilidad, di que si.\n- Precio firme, pero acepta ofertas razonables.\n- Para entrega, pregunta ubicacion del comprador.\n- Maximo 2 oraciones, suena natural."}
                      className={INPUT_CLASS + ' resize-none'} />
                    <p className="text-[10px] text-trust-muted mt-1">Si lo dejas vacio, usara instrucciones por defecto optimizadas para ventas.</p>
                  </div>
                ) : (
                  <div>
                    <label className={LABEL_CLASS}>Template de respuesta</label>
                    <textarea value={autoreplyForm.template} onChange={e => setAutoreplyForm(p => ({...p, template: e.target.value}))} rows={3} placeholder="Hola! Si, esta disponible. El precio es firme. Te interesa?" className={INPUT_CLASS + ' resize-none'} />
                  </div>
                )}

                <button onClick={handleAutoreply}
                  disabled={running || (autoreplyForm.mode === 'template' && !autoreplyForm.template) || selectedProfiles.length === 0}
                  className={(autoreplyForm.mode === 'chatbot' ? 'px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40' : BTN_PRIMARY) + ' mt-4'}>
                  {running ? (autoreplyForm.mode === 'chatbot' ? 'Chatbot procesando...' : 'Respondiendo...') : `${autoreplyForm.mode === 'chatbot' ? 'Activar Chatbot' : 'Ejecutar'} en ${selectedProfiles.length} perfil(es)`}
                </button>
              </div>
            )}
          </div>

          {/* Log */}
          <div className="bg-trust-dark rounded-xl p-3 h-36 flex-shrink-0 overflow-y-auto font-mono text-[11px]" ref={logRef}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-trust-muted text-[10px] font-semibold uppercase tracking-wider">Log de actividad</span>
              <button onClick={() => setLogs([])} className="text-[10px] text-trust-muted hover:text-white">Limpiar</button>
            </div>
            {logs.map((l, i) => (
              <div key={i} className={`${l.type === 'error' ? 'text-red-400' : l.type === 'done' ? 'text-green-400' : 'text-gray-400'}`}>
                <span className="text-trust-muted mr-2">{l.time}</span>{l.msg}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
