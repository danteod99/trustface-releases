import React, { useState, useEffect } from 'react';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-blue-500';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';
const CATEGORIES = ['Electronica', 'Vehiculos', 'Hogar y Jardin', 'Ropa y Accesorios', 'Deportes', 'Juguetes', 'Instrumentos Musicales', 'Otra'];
const CONDITIONS = ['Nuevo', 'Como nuevo', 'Buen estado', 'Aceptable'];

export default function Marketplace({ tier }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [listings, setListings] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({ title: '', price: '', description: '', category: '', condition: 'Nuevo', location: '', photos: '' });
  const [scrapeQuery, setScrapeQuery] = useState('');
  const [scrapeResults, setScrapeResults] = useState([]);

  useEffect(() => {
    window.api.listProfiles().then(p => setProfiles(p || []));
  }, []);

  const publish = async () => {
    if (!form.title || selectedProfiles.length === 0) return;
    setRunning(true);
    const photos = form.photos ? form.photos.split(',').map(p => p.trim()).filter(Boolean) : [];
    for (const profileId of selectedProfiles) {
      try {
        await window.api.fbMarketplaceCreate(profileId, { ...form, photos, autoPublish: true });
      } catch {}
    }
    setRunning(false);
    setShowCreate(false);
    setForm({ title: '', price: '', description: '', category: '', condition: 'Nuevo', location: '', photos: '' });
  };

  const scrape = async () => {
    if (!scrapeQuery || selectedProfiles.length === 0) return;
    setRunning(true);
    try {
      const results = await window.api.fbMarketplaceScrape(selectedProfiles[0], scrapeQuery, 50);
      setScrapeResults(Array.isArray(results) ? results : []);
    } catch {}
    setRunning(false);
  };

  const repostAll = async () => {
    setRunning(true);
    for (const profileId of selectedProfiles) {
      for (const listing of listings) {
        try {
          await window.api.fbMarketplaceRepost(profileId, listing.fb_listing_url, listing);
        } catch {}
      }
    }
    setRunning(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-trust-dark flex items-center gap-2">🏪 Marketplace</h2>
          <p className="text-xs text-trust-muted mt-1">Publica, reposta y scrapea listings de Facebook Marketplace</p>
        </div>
        <div className="flex gap-2">
          <button onClick={repostAll} disabled={running || selectedProfiles.length === 0} className="px-3 py-2 bg-orange-500/10 text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-500/20 disabled:opacity-40">🔄 Repostear Todo</button>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ Nuevo Listing</button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Profiles */}
        <div className="w-48 flex-shrink-0 bg-white rounded-xl border border-trust-border p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold text-trust-dark mb-2">Perfiles</h3>
          {profiles.map(p => (
            <button key={p.id} onClick={() => setSelectedProfiles(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs mb-0.5 ${selectedProfiles.includes(p.id) ? 'bg-blue-500/10 text-blue-600 font-medium' : 'text-trust-muted hover:bg-trust-surface'}`}>
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col gap-4">
          {/* Scrape section */}
          <div className="bg-white rounded-xl border border-trust-border p-4">
            <h3 className="text-sm font-semibold text-trust-dark mb-3">🔍 Scrape Marketplace</h3>
            <div className="flex gap-2">
              <input type="text" value={scrapeQuery} onChange={e => setScrapeQuery(e.target.value)} placeholder="Buscar productos..." className={INPUT_CLASS} onKeyDown={e => e.key === 'Enter' && scrape()} />
              <button onClick={scrape} disabled={running || !scrapeQuery} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap disabled:opacity-40">Buscar</button>
            </div>
            {scrapeResults.length > 0 && (
              <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
                {scrapeResults.map((r, i) => (
                  <div key={i} className="flex justify-between items-center px-3 py-2 bg-trust-surface rounded-lg text-xs">
                    <span className="truncate flex-1 text-trust-dark">{r.title}</span>
                    <span className="text-blue-600 font-semibold ml-2">{r.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create listing modal */}
          {showCreate && (
            <div className="bg-white rounded-xl border border-trust-border p-4">
              <h3 className="text-sm font-semibold text-trust-dark mb-3">Nuevo Listing</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={LABEL_CLASS}>Titulo</label><input type="text" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} placeholder="iPhone 15 Pro Max" className={INPUT_CLASS} /></div>
                <div><label className={LABEL_CLASS}>Precio</label><input type="number" value={form.price} onChange={e => setForm(p => ({...p, price: e.target.value}))} placeholder="999" className={INPUT_CLASS} /></div>
                <div><label className={LABEL_CLASS}>Categoria</label><select value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))} className={INPUT_CLASS}><option value="">Seleccionar</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className={LABEL_CLASS}>Estado</label><select value={form.condition} onChange={e => setForm(p => ({...p, condition: e.target.value}))} className={INPUT_CLASS}>{CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="col-span-2"><label className={LABEL_CLASS}>Ubicacion</label><input type="text" value={form.location} onChange={e => setForm(p => ({...p, location: e.target.value}))} placeholder="Lima, Peru" className={INPUT_CLASS} /></div>
                <div className="col-span-2"><label className={LABEL_CLASS}>Descripcion</label><textarea value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} rows={3} placeholder="Descripcion del producto..." className={INPUT_CLASS + ' resize-none'} /></div>
                <div className="col-span-2"><label className={LABEL_CLASS}>Fotos (rutas separadas por coma)</label><input type="text" value={form.photos} onChange={e => setForm(p => ({...p, photos: e.target.value}))} placeholder="/ruta/foto1.jpg, /ruta/foto2.jpg" className={INPUT_CLASS} /></div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={publish} disabled={running || !form.title} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">{running ? 'Publicando...' : `Publicar en ${selectedProfiles.length} perfil(es)`}</button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-trust-muted text-sm">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
