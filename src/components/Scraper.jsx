import React, { useState, useEffect } from 'react';
import UpgradePrompt from './shared/UpgradePrompt';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-trust-accent focus:ring-1 focus:ring-trust-accent/20';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

const DATA_TABS = [
  { id: 'username', label: 'Usernames', icon: '@' },
  { id: 'email', label: 'Emails', icon: '\u2709' },
  { id: 'phone', label: 'Telefonos', icon: '#' },
  { id: 'bio', label: 'Bios', icon: 'T' },
  { id: 'link', label: 'Links', icon: '~' },
];

export default function Scraper({ tier, onUpgrade }) {
  const [profiles, setProfiles] = useState([]);
  const [runningIds, setRunningIds] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [mode, setMode] = useState('friends'); // 'friends' | 'profiles' | 'group'
  const [usernames, setUsernames] = useState('');
  const [groupUrl, setGroupUrl] = useState('');
  const [friendTarget, setFriendTarget] = useState('');
  const [friendMax, setFriendMax] = useState(100);
  const [fastMode, setFastMode] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressCount, setProgressCount] = useState(0);
  const [activeDataTab, setActiveDataTab] = useState('username');
  const [data, setData] = useState([]);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const copyAllValues = () => {
    const values = filtered.map((d) => d.value).join('\n');
    navigator.clipboard.writeText(values).then(() => {
      setCopiedId('all');
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  useEffect(() => {
    loadProfiles();
    loadData('username');

    // Listen for scraper progress events
    window.api.onAutomationEvent?.((event) => {
      if (event.event === 'progress' || event.event === 'scrape-progress') {
        setProgress(event.data?.message || event.data?.status || `Scrapeando...`);
        if (event.data?.count) setProgressCount(event.data.count);
      }
      if (event.event === 'done' || event.event === 'scrape-done') {
        setProgress('');
        setProgressCount(0);
      }
    });
  }, []);

  const loadProfiles = async () => {
    const p = await window.api.listProfiles();
    setProfiles(p);
    const s = await window.api.getBrowserStatus();
    setRunningIds(s);
  };

  const loadData = async (type) => {
    const d = await window.api.getScrapedData(type);
    setData(d);
    setActiveDataTab(type);
  };

  const activeProfiles = profiles.filter((p) => runningIds.includes(p.id));

  const handleScrape = async () => {
    if (!selectedProfile) return;
    setRunning(true);
    setProgress('Iniciando scraping...');
    setProgressCount(0);

    try {
      if (mode === 'friends') {
        await window.api.scrapeFollowersData(selectedProfile, {
          targetUser: friendTarget.replace(/^@/, ''),
          maxFollowers: parseInt(friendMax) || 100,
          fastMode,
        });
      } else if (mode === 'profiles') {
        const users = usernames.split('\n').filter((u) => u.trim());
        await window.api.scrapeProfiles(selectedProfile, { usernames: users });
      } else {
        await window.api.scrapeHashtagEmails(selectedProfile, { hashtag: groupUrl.trim(), maxProfiles: 30 });
      }
    } catch (err) {
      setProgress('Error: ' + (err.message || 'Error desconocido'));
    }

    setRunning(false);
    setProgress('');
    setProgressCount(0);
    if (mode === 'friends' && fastMode) {
      loadData('username');
    } else {
      loadData('email');
    }
    setTimeout(() => loadData(activeDataTab), 500);
  };

  const handleExport = async () => {
    const csv = await window.api.exportScrapedCsv(activeDataTab);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scrape_${activeDataTab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!confirm(`Eliminar todos los datos de tipo "${activeDataTab}"?`)) return;
    await window.api.deleteScrapedData(activeDataTab);
    loadData(activeDataTab);
  };

  const filtered = data.filter((d) =>
    (d.target_user || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.value || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full relative">
      {tier !== 'pro' && <UpgradePrompt feature="scraper" onUpgrade={onUpgrade} onClose={() => {}} />}
      <h2 className="text-2xl font-bold text-trust-dark mb-1">Scraper de Datos</h2>
      <p className="text-trust-muted text-sm mb-5">Extraer emails, telefonos, bios y links de perfiles de Facebook</p>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left: Config */}
        <div className="w-80 flex flex-col gap-4 shrink-0">
          <div className="bg-white border border-trust-border rounded-xl p-4 shadow-trust">
            <h3 className="text-sm font-semibold text-trust-dark mb-3">Configuracion</h3>

            <div className="mb-3">
              <label className={LABEL_CLASS}>Perfil activo para scraping</label>
              <select value={selectedProfile} onChange={(e) => setSelectedProfile(e.target.value)} className={INPUT_CLASS}>
                <option value="">Seleccionar...</option>
                {activeProfiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} {p.fb_user ? `(${p.fb_user})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className={LABEL_CLASS}>Modo de scraping</label>
              <div className="flex gap-1.5">
                <button onClick={() => setMode('friends')} className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${mode === 'friends' ? 'bg-trust-accent/5 border-trust-accent/40 text-trust-accent' : 'border-trust-border text-trust-muted'}`}>
                  Amigos
                </button>
                <button onClick={() => setMode('profiles')} className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${mode === 'profiles' ? 'bg-trust-accent/5 border-trust-accent/40 text-trust-accent' : 'border-trust-border text-trust-muted'}`}>
                  Perfiles
                </button>
                <button onClick={() => setMode('group')} className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium border transition-colors ${mode === 'group' ? 'bg-trust-accent/5 border-trust-accent/40 text-trust-accent' : 'border-trust-border text-trust-muted'}`}>
                  Grupo
                </button>
              </div>
            </div>

            {mode === 'friends' && (
              <div className="mb-3 space-y-3">
                <div>
                  <label className={LABEL_CLASS}>Cuenta objetivo</label>
                  <input type="text" value={friendTarget} onChange={(e) => setFriendTarget(e.target.value)} placeholder="usuario o URL de perfil" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Cantidad de amigos a scrapear</label>
                  <input type="number" value={friendMax} onChange={(e) => setFriendMax(e.target.value)} min={10} max={2000} className={INPUT_CLASS} />
                </div>
                <div className="flex items-center justify-between p-2.5 bg-trust-surface border border-trust-border rounded-lg">
                  <div>
                    <span className="text-xs font-medium text-trust-dark">Modo rapido</span>
                    <p className="text-[10px] text-trust-muted">{fastMode ? 'Solo extrae usernames de la lista' : 'Visita cada perfil para sacar email/telefono'}</p>
                  </div>
                  <button
                    onClick={() => setFastMode(!fastMode)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${fastMode ? 'bg-trust-accent' : 'bg-gray-300'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${fastMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            )}

            {mode === 'profiles' && (
              <div className="mb-3">
                <label className={LABEL_CLASS}>Perfiles a scrapear (uno por linea)</label>
                <textarea value={usernames} onChange={(e) => setUsernames(e.target.value)} placeholder={`usuario1\nusuario2\nusuario3`} rows={6} className={INPUT_CLASS + ' resize-none font-mono'} />
              </div>
            )}

            {mode === 'group' && (
              <div className="mb-3">
                <label className={LABEL_CLASS}>URL o ID del grupo</label>
                <input type="text" value={groupUrl} onChange={(e) => setGroupUrl(e.target.value)} placeholder="https://facebook.com/groups/..." className={INPUT_CLASS} />
                <p className="text-xs text-trust-muted mt-1">Visitara los miembros del grupo y extraera datos de contacto</p>
              </div>
            )}

            <button
              onClick={handleScrape}
              disabled={running || !selectedProfile}
              className="w-full px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors disabled:opacity-30"
            >
              {running ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Scrapeando...
                </span>
              ) : 'Iniciar Scraping'}
            </button>

            {/* Progress indicator */}
            {running && (
              <div className="mt-3 p-3 bg-trust-accent/5 border border-trust-accent/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-trust-accent rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-trust-accent">En progreso</span>
                  {progressCount > 0 && (
                    <span className="text-xs text-trust-muted ml-auto">{progressCount} encontrados</span>
                  )}
                </div>
                {progress && <p className="text-[11px] text-trust-muted truncate">{progress}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Data type tabs */}
          <div className="flex gap-2 mb-4">
            {DATA_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => loadData(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  activeDataTab === tab.id
                    ? 'bg-trust-accent text-white border-trust-accent'
                    : 'bg-white text-trust-muted border-trust-border hover:text-trust-dark'
                }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
                {activeDataTab === tab.id && data.length > 0 && (
                  <span className="ml-1.5 bg-white/20 px-1.5 py-0.5 rounded text-xs">{data.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="bg-white border border-trust-border rounded-xl shadow-trust flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="px-5 py-3 border-b border-trust-border flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="bg-trust-surface border border-trust-border rounded-lg px-3 py-1.5 text-trust-dark text-sm focus:outline-none focus:border-trust-accent w-60" />
                <span className="text-xs text-trust-muted">{filtered.length} resultados</span>
              </div>
              <div className="flex gap-2">
                <button onClick={copyAllValues} disabled={filtered.length === 0} className="px-3 py-1.5 bg-trust-green text-white rounded-lg text-xs font-medium hover:bg-trust-green/90 disabled:opacity-30">
                  {copiedId === 'all' ? 'Copiado!' : `Copiar todo (${filtered.length})`}
                </button>
                <button onClick={handleExport} className="px-3 py-1.5 bg-trust-accent text-white rounded-lg text-xs font-medium hover:bg-trust-accent-hover">
                  Exportar CSV
                </button>
                <button onClick={handleDelete} className="px-3 py-1.5 bg-white text-trust-red border border-trust-red/30 rounded-lg text-xs font-medium hover:bg-red-50">
                  Eliminar
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-trust-surface border-b border-trust-border">
                  <tr>
                    <th className="text-left text-xs font-semibold text-trust-muted px-5 py-2.5 w-12">#</th>
                    <th className="text-left text-xs font-semibold text-trust-muted px-3 py-2.5">Usuario</th>
                    <th className="text-left text-xs font-semibold text-trust-muted px-3 py-2.5">Valor</th>
                    <th className="text-left text-xs font-semibold text-trust-muted px-3 py-2.5">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-trust-border">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-12 text-trust-muted text-sm">No hay datos</td></tr>
                  ) : (
                    filtered.map((d, i) => (
                      <tr key={d.id || i} className="hover:bg-trust-surface transition-colors group">
                        <td className="px-5 py-1.5 text-xs text-trust-muted">{i + 1}</td>
                        <td className="px-3 py-1.5 text-xs text-trust-accent font-medium select-all">{d.target_user}</td>
                        <td className="px-3 py-1.5">
                          <span
                            onClick={() => copyToClipboard(d.value, d.id || i)}
                            className="text-sm text-trust-dark font-mono select-all cursor-pointer hover:bg-trust-accent/10 px-1.5 py-0.5 rounded transition-colors inline-block"
                            title="Click para copiar"
                          >
                            {copiedId === (d.id || i) ? (
                              <span className="text-trust-green text-xs font-medium">Copiado!</span>
                            ) : d.value}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-[11px] text-trust-muted">
                          {d.scraped_at ? new Date(d.scraped_at + 'Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
