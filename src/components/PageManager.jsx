import React, { useState, useEffect } from 'react';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-blue-500';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

export default function PageManager({ tier }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('search');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);

  // Search
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Scrape page info
  const [pageUrl, setPageUrl] = useState('');
  const [pageInfo, setPageInfo] = useState(null);

  // Page followers
  const [followersUrl, setFollowersUrl] = useState('');
  const [maxFollowers, setMaxFollowers] = useState('100');
  const [pageFollowers, setPageFollowers] = useState([]);

  // Post to page
  const [postPageUrl, setPostPageUrl] = useState('');
  const [postText, setPostText] = useState('');

  // Reviews
  const [reviewsUrl, setReviewsUrl] = useState('');
  const [reviews, setReviews] = useState([]);

  // Invite
  const [inviteUrl, setInviteUrl] = useState('');
  const [maxInvites, setMaxInvites] = useState('50');

  useEffect(() => { window.api.listProfiles().then(p => setProfiles(p || [])); }, []);

  const log = (msg, type = 'info') => setLogs(prev => [...prev.slice(-100), { msg, type, time: new Date().toLocaleTimeString() }]);

  const searchPagesAction = async () => {
    if (!searchKeyword || !selectedProfile) return;
    setRunning(true);
    log(`Buscando paginas: "${searchKeyword}"...`);
    try {
      const results = await window.api.fbSearchPages(selectedProfile, searchKeyword, 20);
      setSearchResults(Array.isArray(results) ? results : []);
      log(`Encontradas ${(results || []).length} paginas`, 'success');
    } catch (err) { log(`Error: ${err.message}`, 'error'); }
    setRunning(false);
  };

  const scrapeInfo = async () => {
    if (!pageUrl || !selectedProfile) return;
    setRunning(true);
    log(`Extrayendo info de ${pageUrl}...`);
    try {
      const info = await window.api.fbScrapePageInfo(selectedProfile, pageUrl);
      setPageInfo(info);
      log(`Info extraida: ${info.name || 'Sin nombre'} | ${info.allEmails?.length || 0} emails, ${info.allPhones?.length || 0} telefonos`, 'success');
    } catch (err) { log(`Error: ${err.message}`, 'error'); }
    setRunning(false);
  };

  const scrapeFollowers = async () => {
    if (!followersUrl || !selectedProfile) return;
    setRunning(true);
    log(`Extrayendo seguidores de ${followersUrl}...`);
    try {
      const result = await window.api.fbScrapePageFollowers(selectedProfile, followersUrl, parseInt(maxFollowers));
      setPageFollowers(Array.isArray(result) ? result : []);
      log(`${(result || []).length} seguidores extraidos`, 'success');
    } catch (err) { log(`Error: ${err.message}`, 'error'); }
    setRunning(false);
  };

  const postToPage = async () => {
    if (!postPageUrl || !postText || !selectedProfile) return;
    setRunning(true);
    log(`Publicando en ${postPageUrl}...`);
    try {
      await window.api.fbPostToPage(selectedProfile, postPageUrl, { text: postText });
      log('Publicado exitosamente', 'success');
    } catch (err) { log(`Error: ${err.message}`, 'error'); }
    setRunning(false);
  };

  const scrapeReviewsAction = async () => {
    if (!reviewsUrl || !selectedProfile) return;
    setRunning(true);
    log(`Extrayendo reviews de ${reviewsUrl}...`);
    try {
      const result = await window.api.fbScrapePageReviews(selectedProfile, reviewsUrl, 50);
      setReviews(Array.isArray(result) ? result : []);
      log(`${(result || []).length} reviews extraidas`, 'success');
    } catch (err) { log(`Error: ${err.message}`, 'error'); }
    setRunning(false);
  };

  const inviteAction = async () => {
    if (!inviteUrl || !selectedProfile) return;
    setRunning(true);
    log(`Invitando amigos a ${inviteUrl}...`);
    try {
      const result = await window.api.fbInviteToPage(selectedProfile, inviteUrl, parseInt(maxInvites));
      log(`${result?.invited || 0} invitaciones enviadas`, 'success');
    } catch (err) { log(`Error: ${err.message}`, 'error'); }
    setRunning(false);
  };

  const exportCSV = (data, filename) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = headers.join(',') + '\n' + data.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-trust-dark flex items-center gap-2">📄 Paginas</h2>
          <p className="text-xs text-trust-muted mt-1">Busca, scrapea y gestiona paginas de Facebook</p>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Profile + Tab selector */}
        <div className="w-48 flex-shrink-0 space-y-3">
          <div className="bg-white rounded-xl border border-trust-border p-3">
            <h3 className="text-xs font-semibold text-trust-dark mb-2">Perfil activo</h3>
            <select value={selectedProfile || ''} onChange={e => setSelectedProfile(e.target.value)} className={INPUT_CLASS}>
              <option value="">Seleccionar...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="bg-white rounded-xl border border-trust-border p-2 space-y-0.5">
            {[
              { id: 'search', label: 'Buscar Paginas', icon: '🔍' },
              { id: 'info', label: 'Scrape Info', icon: '📋' },
              { id: 'followers', label: 'Seguidores', icon: '👥' },
              { id: 'post', label: 'Publicar', icon: '📝' },
              { id: 'reviews', label: 'Reviews', icon: '⭐' },
              { id: 'invite', label: 'Invitar', icon: '📨' },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${activeTab === t.id ? 'bg-blue-600 text-white' : 'text-trust-muted hover:bg-trust-surface'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="bg-white rounded-xl border border-trust-border p-4">
            {activeTab === 'search' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-trust-dark">Buscar Paginas por Keyword</h3>
                <div className="flex gap-2">
                  <input type="text" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)} placeholder="restaurantes lima, tienda de ropa..." className={INPUT_CLASS} onKeyDown={e => e.key === 'Enter' && searchPagesAction()} />
                  <button onClick={searchPagesAction} disabled={running || !selectedProfile} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap disabled:opacity-40">Buscar</button>
                </div>
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {searchResults.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-trust-surface rounded-lg text-xs">
                        <div>
                          <p className="font-medium text-trust-dark">{r.name}</p>
                          <p className="text-trust-muted">{r.category}</p>
                        </div>
                        <button onClick={() => { setPageUrl(r.href); setActiveTab('info'); }} className="text-blue-600 text-[10px] hover:underline">Scrape</button>
                      </div>
                    ))}
                    <button onClick={() => exportCSV(searchResults, 'pages_search.csv')} className="text-xs text-blue-600 hover:underline">Exportar CSV</button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'info' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-trust-dark">Extraer Info de Pagina</h3>
                <p className="text-xs text-trust-muted">Extrae email, telefono, web, direccion, categoria, rating y mas</p>
                <div className="flex gap-2">
                  <input type="text" value={pageUrl} onChange={e => setPageUrl(e.target.value)} placeholder="https://facebook.com/mipagina" className={INPUT_CLASS} />
                  <button onClick={scrapeInfo} disabled={running || !selectedProfile} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap disabled:opacity-40">Extraer</button>
                </div>
                {pageInfo && (
                  <div className="bg-trust-surface rounded-lg p-3 space-y-1.5 text-xs">
                    {pageInfo.name && <p><strong>Nombre:</strong> {pageInfo.name}</p>}
                    {pageInfo.category && <p><strong>Categoria:</strong> {pageInfo.category}</p>}
                    {pageInfo.email && <p><strong>Email:</strong> <span className="text-blue-600">{pageInfo.email}</span></p>}
                    {pageInfo.allEmails?.length > 1 && <p><strong>Todos los emails:</strong> {pageInfo.allEmails.join(', ')}</p>}
                    {pageInfo.phone && <p><strong>Telefono:</strong> <span className="text-blue-600">{pageInfo.phone}</span></p>}
                    {pageInfo.allPhones?.length > 1 && <p><strong>Todos los telefonos:</strong> {pageInfo.allPhones.join(', ')}</p>}
                    {pageInfo.website && <p><strong>Web:</strong> {pageInfo.website}</p>}
                    {pageInfo.address && <p><strong>Direccion:</strong> {pageInfo.address}</p>}
                    {pageInfo.followers && <p><strong>Seguidores:</strong> {pageInfo.followers}</p>}
                    {pageInfo.likes && <p><strong>Likes:</strong> {pageInfo.likes}</p>}
                    {pageInfo.rating && <p><strong>Rating:</strong> {pageInfo.rating}/5</p>}
                    {pageInfo.hours && <p><strong>Horario:</strong> {pageInfo.hours}</p>}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'followers' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-trust-dark">Extraer Seguidores de Pagina</h3>
                <div className="flex gap-2">
                  <input type="text" value={followersUrl} onChange={e => setFollowersUrl(e.target.value)} placeholder="https://facebook.com/mipagina" className={INPUT_CLASS} />
                  <input type="number" value={maxFollowers} onChange={e => setMaxFollowers(e.target.value)} className={INPUT_CLASS + ' w-24'} />
                  <button onClick={scrapeFollowers} disabled={running || !selectedProfile} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap disabled:opacity-40">Extraer</button>
                </div>
                {pageFollowers.length > 0 && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-trust-muted">{pageFollowers.length} seguidores</span>
                      <button onClick={() => exportCSV(pageFollowers, 'page_followers.csv')} className="text-xs text-blue-600 hover:underline">Exportar CSV</button>
                    </div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {pageFollowers.slice(0, 50).map((f, i) => (
                        <div key={i} className="flex justify-between px-3 py-1.5 bg-trust-surface rounded text-xs">
                          <span className="text-trust-dark">{f.name}</span>
                          <span className="text-trust-muted">{f.username}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'post' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-trust-dark">Publicar en Pagina</h3>
                <input type="text" value={postPageUrl} onChange={e => setPostPageUrl(e.target.value)} placeholder="https://facebook.com/mipagina" className={INPUT_CLASS} />
                <textarea value={postText} onChange={e => setPostText(e.target.value)} rows={4} placeholder="Escribe tu publicacion..." className={INPUT_CLASS + ' resize-none'} />
                <button onClick={postToPage} disabled={running || !selectedProfile || !postText} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40">Publicar</button>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-trust-dark">Extraer Reviews</h3>
                <div className="flex gap-2">
                  <input type="text" value={reviewsUrl} onChange={e => setReviewsUrl(e.target.value)} placeholder="https://facebook.com/mipagina" className={INPUT_CLASS} />
                  <button onClick={scrapeReviewsAction} disabled={running || !selectedProfile} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm whitespace-nowrap disabled:opacity-40">Extraer</button>
                </div>
                {reviews.length > 0 && (
                  <div>
                    <button onClick={() => exportCSV(reviews, 'page_reviews.csv')} className="text-xs text-blue-600 hover:underline mb-2">Exportar CSV ({reviews.length})</button>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {reviews.map((r, i) => (
                        <div key={i} className="px-3 py-2 bg-trust-surface rounded text-xs">
                          <p className="font-medium text-trust-dark">{r.reviewer} {r.rating && `— ${r.rating}`}</p>
                          <p className="text-trust-muted">{r.text.substring(0, 150)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'invite' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-trust-dark">Invitar Amigos a Pagina</h3>
                <input type="text" value={inviteUrl} onChange={e => setInviteUrl(e.target.value)} placeholder="https://facebook.com/mipagina" className={INPUT_CLASS} />
                <div className="flex gap-2">
                  <input type="number" value={maxInvites} onChange={e => setMaxInvites(e.target.value)} placeholder="Max invitaciones" className={INPUT_CLASS + ' w-32'} />
                  <button onClick={inviteAction} disabled={running || !selectedProfile} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40">Invitar</button>
                </div>
              </div>
            )}
          </div>

          {/* Log */}
          <div className="flex-1 bg-trust-dark rounded-xl p-3 overflow-y-auto min-h-[100px]">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xs font-semibold text-white/60">Log</h3>
              {logs.length > 0 && <button onClick={() => setLogs([])} className="text-[10px] text-white/30 hover:text-white/60">Limpiar</button>}
            </div>
            {logs.map((l, i) => (
              <p key={i} className={`text-[11px] font-mono ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-green-400' : 'text-white/50'}`}>
                [{l.time}] {l.msg}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
