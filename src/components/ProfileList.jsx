import React, { useState, useEffect } from 'react';
import ProfileForm from './ProfileForm';

const QUICK_AUTOMATIONS = [
  { id: 'mp-create', name: 'Publicar Marketplace', icon: '🏪' },
  { id: 'mp-repost', name: 'Repostear Listings', icon: '🔄' },
  { id: 'like', name: 'Like en Posts', icon: '👍' },
  { id: 'comment', name: 'Comentar', icon: '💬' },
  { id: 'add-friend', name: 'Agregar Amigos', icon: '➕' },
  { id: 'group-join', name: 'Unirse a Grupos', icon: '🚪' },
  { id: 'dm-send', name: 'Enviar DM', icon: '✉️' },
  { id: 'dm-mass', name: 'DM Masivo', icon: '📨' },
  { id: 'post-create', name: 'Crear Post', icon: '📝' },
  { id: 'post-group', name: 'Post en Grupo', icon: '👥' },
  { id: 'warmup', name: 'Warm-up Cuenta', icon: '🔥' },
];

export default function ProfileList({ tier, onUpgrade }) {
  const [profiles, setProfiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editProfile, setEditProfile] = useState(null);
  const [runningIds, setRunningIds] = useState([]);
  const [loading, setLoading] = useState({});
  const [selected, setSelected] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [queuedAutomation, setQueuedAutomation] = useState(null);
  const [batchSize, setBatchSize] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingNote, setEditingNote] = useState(null); // profile id being edited
  const [noteText, setNoteText] = useState('');

  const loadProfiles = async () => {
    const data = await window.api.listProfiles();
    setProfiles(data);
    const status = await window.api.getBrowserStatus();
    setRunningIds(status);
  };

  useEffect(() => {
    loadProfiles();
    const interval = setInterval(async () => {
      const status = await window.api.getBrowserStatus();
      setRunningIds(status);
    }, 3000);

    // Refresh profiles when login fails (account banned, challenge, etc.)
    window.api.onLoginFail?.((data) => {
      loadProfiles();
      setRunningIds((prev) => prev.filter((id) => id !== data.profileId));
    });

    // Refresh when login succeeds
    window.api.onLoginSuccess?.((profileId) => {
      loadProfiles();
    });

    return () => clearInterval(interval);
  }, []);

  const saveNote = async (profileId) => {
    await window.api.updateProfile(profileId, { notes: noteText });
    setEditingNote(null);
    loadProfiles();
  };

  const handleLaunch = async (id) => {
    setLoading((prev) => ({ ...prev, [id]: true }));
    const result = await window.api.launchBrowser(id);
    if (result.success) {
      setRunningIds((prev) => [...prev, id]);
    } else {
      alert('Error: ' + result.error);
    }
    setLoading((prev) => ({ ...prev, [id]: false }));
  };

  const handleClose = async (id) => {
    setLoading((prev) => ({ ...prev, [id]: true }));
    await window.api.closeBrowser(id);
    setRunningIds((prev) => prev.filter((pid) => pid !== id));
    setLoading((prev) => ({ ...prev, [id]: false }));
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar este perfil?')) return;
    if (runningIds.includes(id)) await window.api.closeBrowser(id);
    await window.api.deleteProfile(id);
    loadProfiles();
  };

  const handleSave = async (profile) => {
    let result;
    if (editProfile) {
      result = await window.api.updateProfile(editProfile.id, profile);
    } else {
      result = await window.api.createProfile(profile);
    }
    if (result?.error === 'PROFILE_LIMIT') {
      if (onUpgrade) onUpgrade();
      return;
    }
    setShowForm(false);
    setEditProfile(null);
    loadProfiles();
  };

  const handleBulkSave = async (accounts, timezone) => {
    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      await window.api.createProfile({
        name: `FB @${acc.user}`,
        fb_user: acc.user,
        fb_pass: acc.pass,
        fb_2fa_secret: acc.twofa || '',
        fb_email: acc.email || '',
        fb_email_pass: acc.emailPass || '',
        timezone,
      });
    }
    setShowForm(false);
    loadProfiles();
  };

  // Batch launch: opens profiles in groups of batchSize
  const launchInBatches = async (ids) => {
    const toOpen = ids.filter((id) => !runningIds.includes(id));
    if (toOpen.length === 0) return;

    setBatchRunning(true);
    const totalBatches = Math.ceil(toOpen.length / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const batchIds = toOpen.slice(start, start + batchSize);

      setBatchProgress({ current: start, total: toOpen.length, currentBatch: batch + 1, totalBatches });

      // Launch this batch
      for (const id of batchIds) {
        await handleLaunch(id);
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Wait between batches for browsers to settle (except last batch)
      if (batch < totalBatches - 1) {
        setBatchProgress((prev) => ({ ...prev, waiting: true }));
        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    setBatchRunning(false);
    setBatchProgress(null);
  };

  const handleLaunchAll = async () => {
    await launchInBatches(profiles.map((p) => p.id));
  };

  const handleCloseAll = async () => {
    for (const id of runningIds) {
      await handleClose(id);
    }
  };

  const isRunning = (id) => runningIds.includes(id);
  const [viewMode, setViewMode] = useState('list');

  const toggleSelect = (id) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selected.length === profiles.length) {
      setSelected([]);
    } else {
      setSelected(profiles.map((p) => p.id));
    }
  };

  const handleLaunchSelected = async () => {
    await launchInBatches(selected);
  };

  const handleCloseSelected = async () => {
    const toClose = selected.filter((id) => runningIds.includes(id));
    for (const id of toClose) {
      await handleClose(id);
    }
  };

  // Status counts
  const statusCounts = { all: profiles.length, active: 0, banned: 0, challenge: 0, unknown: 0, running: runningIds.length };
  profiles.forEach(p => {
    if (p.account_status === 'banned' || p.account_status === 'facial_verify') statusCounts.banned++;
    else if (p.account_status === 'challenge' || p.account_status === 'wrong_password' || p.account_status === 'email_verify') statusCounts.challenge++;
    else if (p.account_status === 'active') statusCounts.active++;
    else statusCounts.unknown++;
  });

  // Filtered profiles
  const filteredProfiles = profiles.filter(p => {
    // Status filter
    if (statusFilter === 'active' && p.account_status !== 'active') return false;
    if (statusFilter === 'banned' && p.account_status !== 'banned' && p.account_status !== 'facial_verify') return false;
    if (statusFilter === 'challenge' && p.account_status !== 'challenge' && p.account_status !== 'wrong_password' && p.account_status !== 'email_verify') return false;
    if (statusFilter === 'running' && !runningIds.includes(p.id)) return false;
    if (statusFilter === 'stopped' && runningIds.includes(p.id)) return false;
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!p.name?.toLowerCase().includes(q) && !p.fb_user?.toLowerCase().includes(q) && !p.notes?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleDeleteSelected = async () => {
    if (!confirm(`Eliminar ${selected.length} perfil(es)?`)) return;
    for (const id of selected) {
      if (runningIds.includes(id)) await window.api.closeBrowser(id);
      await window.api.deleteProfile(id);
    }
    setSelected([]);
    loadProfiles();
  };

  // Context menu (right click)
  const handleContextMenu = (e) => {
    e.preventDefault();
    if (selected.length === 0) return;
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Launch selected in batches + run automation after each batch
  const handleLaunchWithAutomation = async (automationId) => {
    closeContextMenu();
    const toOpen = selected.filter((id) => !runningIds.includes(id));
    if (toOpen.length === 0) return;

    setBatchRunning(true);
    const totalBatches = Math.ceil(toOpen.length / batchSize);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * batchSize;
      const batchIds = toOpen.slice(start, start + batchSize);
      setBatchProgress({ current: start, total: toOpen.length, currentBatch: batch + 1, totalBatches });

      // Launch batch
      for (const id of batchIds) {
        await handleLaunch(id);
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Wait for login to complete, then run automation on this batch
      await new Promise((r) => setTimeout(r, 8000));
      if (automationId) {
        for (const id of batchIds) {
          try { await window.api.runAutomation(id, automationId, {}); } catch {}
        }
      }

      // Wait between batches
      if (batch < totalBatches - 1) {
        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    setBatchRunning(false);
    setBatchProgress(null);
  };

  return (
    <div onContextMenu={handleContextMenu} onClick={closeContextMenu}>
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-trust-border rounded-xl shadow-2xl py-2 min-w-[220px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] text-trust-muted font-medium border-b border-trust-border mb-1">
            {selected.length} perfil(es) seleccionado(s)
          </div>
          <button onClick={() => { handleLaunchSelected(); closeContextMenu(); }} className="w-full text-left px-3 py-2 text-sm text-trust-dark hover:bg-trust-surface flex items-center gap-2">
            <span className="text-trust-green">▶</span> Abrir seleccionados
          </button>
          <button onClick={() => { handleCloseSelected(); closeContextMenu(); }} className="w-full text-left px-3 py-2 text-sm text-trust-dark hover:bg-trust-surface flex items-center gap-2">
            <span className="text-red-500">■</span> Cerrar seleccionados
          </button>
          <div className="border-t border-trust-border my-1" />
          <div className="px-3 py-1 text-[10px] text-trust-muted font-medium">Abrir + Ejecutar automatizacion:</div>
          {QUICK_AUTOMATIONS.map((auto) => (
            <button
              key={auto.id}
              onClick={() => handleLaunchWithAutomation(auto.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-trust-dark hover:bg-trust-accent/5 hover:text-trust-accent flex items-center gap-2"
            >
              <span className="w-4 text-center">{auto.icon}</span> {auto.name}
            </button>
          ))}
          <div className="border-t border-trust-border my-1" />
          <button onClick={() => { handleDeleteSelected(); closeContextMenu(); }} className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2">
            <span>🗑</span> Eliminar seleccionados
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-trust-dark">Perfiles de Navegador</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-trust-muted text-sm">
              {profiles.length} perfil{profiles.length !== 1 ? 'es' : ''} &middot;{' '}
              {runningIds.length} activo{runningIds.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1.5 bg-trust-surface border border-trust-border rounded-lg px-2 py-1">
              <span className="text-[10px] text-trust-muted">Batch:</span>
              <select value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="bg-transparent text-xs text-trust-dark font-medium outline-none">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          {/* View toggle */}
          <div className="flex bg-trust-surface border border-trust-border rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('cards')} className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'cards' ? 'bg-trust-accent text-white' : 'text-trust-muted hover:text-trust-dark'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-trust-accent text-white' : 'text-trust-muted hover:text-trust-dark'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            </button>
          </div>
          {selected.length > 0 && (
            <>
              <button onClick={handleLaunchSelected} className="px-3 py-2 bg-trust-green text-white rounded-lg text-xs font-medium hover:bg-trust-green/90 shadow-trust">
                Abrir ({selected.filter((id) => !runningIds.includes(id)).length})
              </button>
              <button onClick={handleCloseSelected} className="px-3 py-2 bg-white text-trust-red border border-trust-border rounded-lg text-xs font-medium hover:bg-red-50 shadow-trust">
                Cerrar ({selected.filter((id) => runningIds.includes(id)).length})
              </button>
              <button onClick={handleDeleteSelected} className="px-3 py-2 bg-white text-trust-muted border border-trust-border rounded-lg text-xs font-medium hover:text-trust-red hover:bg-red-50">
                Eliminar ({selected.length})
              </button>
            </>
          )}
          {profiles.length > 0 && selected.length === 0 && (
            <>
              <button
                onClick={handleLaunchAll}
                className="px-3 py-2 bg-trust-green text-white rounded-lg text-xs font-medium hover:bg-trust-green/90 shadow-trust"
              >
                Abrir Todos
              </button>
              <button
                onClick={handleCloseAll}
                className="px-3 py-2 bg-white text-trust-red border border-trust-border rounded-lg text-xs font-medium hover:bg-red-50 shadow-trust"
              >
                Cerrar Todos
              </button>
            </>
          )}
          <button
            onClick={() => {
              setEditProfile(null);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors shadow-trust"
          >
            + Nuevo Perfil
          </button>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <ProfileForm
          profile={editProfile}
          onSave={handleSave}
          onBulkSave={handleBulkSave}
          onCancel={() => {
            setShowForm(false);
            setEditProfile(null);
          }}
        />
      )}

      {/* Empty State */}
      {profiles.length === 0 && !showForm && (
        <div className="text-center py-20 bg-white rounded-2xl border border-trust-border shadow-trust">
          <svg className="w-16 h-16 mx-auto text-trust-accent/20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-trust-dark text-lg font-medium">No hay perfiles creados</p>
          <p className="text-trust-muted text-sm mt-2">
            Crea tu primer perfil para abrir un navegador con proxy
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-trust-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por usuario o nombre..."
            className="w-full pl-9 pr-3 py-2 bg-trust-surface border border-trust-border rounded-lg text-sm text-trust-dark focus:outline-none focus:border-trust-accent"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {[
            { id: 'all', label: 'Todos', count: statusCounts.all, color: 'text-trust-dark' },
            { id: 'active', label: 'Activas', count: statusCounts.active, color: 'text-trust-green', bg: 'bg-trust-green/10' },
            { id: 'running', label: 'Abiertas', count: statusCounts.running, color: 'text-trust-accent', bg: 'bg-trust-accent/10' },
            { id: 'challenge', label: 'Challenge', count: statusCounts.challenge, color: 'text-orange-500', bg: 'bg-orange-50' },
            { id: 'banned', label: 'Baneadas', count: statusCounts.banned, color: 'text-red-500', bg: 'bg-red-50' },
            { id: 'stopped', label: 'Cerradas', count: profiles.length - runningIds.length, color: 'text-trust-muted', bg: 'bg-gray-50' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                statusFilter === f.id
                  ? 'border-trust-accent bg-trust-accent/5 text-trust-accent'
                  : `border-trust-border ${f.bg || 'bg-white'} ${f.color} hover:border-trust-accent/30`
              }`}
            >
              {f.label}
              <span className={`text-[10px] ${statusFilter === f.id ? 'text-trust-accent/70' : 'text-trust-muted'}`}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Batch Progress */}
      {batchProgress && (
        <div className="mb-4 p-3 bg-trust-accent/5 border border-trust-accent/20 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-trust-dark">
              Abriendo perfiles — Lote {batchProgress.currentBatch}/{batchProgress.totalBatches}
            </span>
            <span className="text-xs text-trust-muted">
              {Math.min(batchProgress.current + batchSize, batchProgress.total)}/{batchProgress.total}
            </span>
          </div>
          <div className="w-full h-2 bg-trust-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-trust-accent rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, ((batchProgress.current + batchSize) / batchProgress.total) * 100)}%` }}
            />
          </div>
          {batchProgress.waiting && (
            <p className="text-[10px] text-trust-muted mt-1 animate-pulse">Esperando antes del siguiente lote...</p>
          )}
        </div>
      )}

      {/* Cards View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProfiles.map((profile) => {
            const running = isRunning(profile.id);
            const isLoading = loading[profile.id];
            return (
              <div key={profile.id} className={`border rounded-xl p-5 transition-all shadow-trust hover:shadow-trust-md ${
                profile.account_status === 'banned' ? 'bg-red-50 border-red-300 ring-1 ring-red-200' :
                profile.account_status === 'facial_verify' ? 'bg-red-50/60 border-red-200' :
                profile.account_status === 'challenge' ? 'bg-orange-50/60 border-orange-200' :
                profile.account_status === 'wrong_password' ? 'bg-yellow-50/60 border-yellow-200' :
                profile.account_status === 'email_verify' ? 'bg-purple-50/60 border-purple-200' :
                running ? 'bg-white border-trust-green/40 ring-1 ring-trust-green/20' : 'bg-white border-trust-border'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${running ? 'bg-trust-green animate-pulse' : 'bg-gray-200'}`} />
                    <h3 className="font-semibold text-trust-dark">{profile.name}</h3>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${running ? 'bg-trust-green/10 text-trust-green' : 'bg-gray-100 text-trust-muted'}`}>
                    {running ? 'Activo' : 'Detenido'}
                  </span>
                </div>
                <div className="space-y-2 mb-4 text-sm">
                  {profile.fb_user && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-trust-dark font-medium">@{profile.fb_user}</span>
                      {profile.fb_2fa_secret && <span className="text-[10px] px-1.5 py-0.5 rounded bg-trust-accent/10 text-trust-accent font-medium">2FA</span>}
                      {profile.account_status === 'banned' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">Inhabilitada</span>
                      ) : profile.account_status === 'facial_verify' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">Verificacion facial</span>
                      ) : profile.account_status === 'challenge' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">Challenge</span>
                      ) : profile.account_status === 'wrong_password' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-600 font-medium">Password incorrecta</span>
                      ) : profile.account_status === 'email_verify' ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 font-medium">Verificacion email</span>
                      ) : profile.fb_logged_in ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-trust-green/10 text-trust-green font-medium">Sesion activa</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-trust-yellow/10 text-trust-yellow font-medium">Pendiente</span>
                      )}
                    </div>
                  )}
                  {profile.account_status_msg && (profile.account_status === 'banned' || profile.account_status === 'facial_verify' || profile.account_status === 'challenge' || profile.account_status === 'email_verify') && (
                    <p className="text-[10px] text-red-500 truncate">{profile.account_status_msg}</p>
                  )}
                  <div className="text-trust-muted text-xs">
                    {profile.proxy_host ? `${profile.proxy_type}://${profile.proxy_host}:${profile.proxy_port}` : 'Sin proxy'} · {profile.timezone}
                  </div>
                  {/* Notes */}
                  {editingNote === profile.id ? (
                    <div className="flex gap-1.5 items-start">
                      <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveNote(profile.id); } if (e.key === 'Escape') setEditingNote(null); }}
                        placeholder="Escribe una nota..."
                        className="flex-1 text-xs bg-trust-surface border border-trust-border rounded-lg px-2 py-1.5 text-trust-dark focus:outline-none focus:border-blue-500 resize-none" />
                      <button onClick={() => saveNote(profile.id)} className="px-2 py-1.5 bg-trust-accent text-white rounded-lg text-[10px] font-medium hover:bg-trust-accent-hover">OK</button>
                      <button onClick={() => setEditingNote(null)} className="px-2 py-1.5 text-trust-muted text-[10px] hover:text-trust-dark">X</button>
                    </div>
                  ) : (
                    <div className="cursor-pointer group" onClick={() => { setEditingNote(profile.id); setNoteText(profile.notes || ''); }}>
                      {profile.notes ? (
                        <p className="text-xs text-trust-muted bg-trust-surface/60 rounded px-2 py-1 group-hover:bg-trust-surface">{profile.notes}</p>
                      ) : (
                        <p className="text-[10px] text-trust-muted/50 group-hover:text-trust-muted">+ Agregar nota</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {running ? (
                    <button onClick={() => handleClose(profile.id)} disabled={isLoading} className="flex-1 px-3 py-2 bg-white text-trust-red border border-trust-red/30 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50">{isLoading ? 'Cerrando...' : 'Cerrar'}</button>
                  ) : (
                    <button onClick={() => handleLaunch(profile.id)} disabled={isLoading} className="flex-1 px-3 py-2 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover disabled:opacity-50">{isLoading ? 'Abriendo...' : 'Abrir'}</button>
                  )}
                  <button onClick={() => { setEditProfile(profile); setShowForm(true); }} className="px-3 py-2 bg-gray-50 text-trust-muted border border-trust-border rounded-lg text-sm hover:text-trust-dark hover:bg-gray-100">Editar</button>
                  <button onClick={() => handleDelete(profile.id)} className="px-3 py-2 bg-gray-50 text-trust-muted border border-trust-border rounded-lg text-sm hover:text-trust-red hover:bg-red-50">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-white border border-trust-border rounded-xl shadow-trust overflow-hidden">
          <table className="w-full">
            <thead className="bg-trust-surface border-b border-trust-border">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input type="checkbox" checked={selected.length === profiles.length && profiles.length > 0} onChange={toggleSelectAll} className="accent-trust-accent w-3.5 h-3.5" />
                </th>
                <th className="px-2 py-2 w-6"></th>
                <th className="text-left text-[11px] font-semibold text-trust-muted px-2 py-2">Cuenta</th>
                <th className="text-left text-[11px] font-semibold text-trust-muted px-2 py-2">Proxy</th>
                <th className="text-left text-[11px] font-semibold text-trust-muted px-2 py-2">Estado</th>
                <th className="text-right text-[11px] font-semibold text-trust-muted px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-trust-border">
              {filteredProfiles.map((profile) => {
                const running = isRunning(profile.id);
                const isLoading = loading[profile.id];
                return (
                  <tr key={profile.id} className={`hover:bg-trust-surface transition-colors ${
                    profile.account_status === 'banned' ? 'bg-red-50/80 hover:bg-red-100/60' :
                    profile.account_status === 'facial_verify' ? 'bg-red-50/50 hover:bg-red-100/40' :
                    profile.account_status === 'challenge' ? 'bg-orange-50/50 hover:bg-orange-100/40' :
                    profile.account_status === 'wrong_password' ? 'bg-yellow-50/50 hover:bg-yellow-100/40' :
                    profile.account_status === 'email_verify' ? 'bg-purple-50/50 hover:bg-purple-100/40' :
                    running ? 'bg-trust-green/[0.02]' : ''
                  } ${selected.includes(profile.id) ? 'bg-trust-accent/[0.03]' : ''}`}>
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={selected.includes(profile.id)} onChange={() => toggleSelect(profile.id)} className="accent-trust-accent w-3.5 h-3.5" />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className={`w-2 h-2 rounded-full ${running ? 'bg-trust-green animate-pulse' : 'bg-gray-200'}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-trust-dark">@{profile.fb_user || profile.name}</span>
                        {profile.fb_2fa_secret && <span className="text-[9px] px-1 rounded bg-trust-accent/10 text-trust-accent font-medium">2FA</span>}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-trust-muted font-mono">
                      {profile.proxy_host ? `${profile.proxy_host}:${profile.proxy_port}` : 'Directa'}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1.5 rounded-full font-medium ${running ? 'bg-trust-green/10 text-trust-green' : 'bg-gray-100 text-trust-muted'}`}>
                          {running ? 'Abierto' : 'Cerrado'}
                        </span>
                        {profile.account_status && profile.account_status !== 'unknown' && (
                          <span className={`text-[10px] px-1.5 rounded-full font-medium ${
                            profile.account_status === 'active' ? 'bg-trust-green/10 text-trust-green' :
                            profile.account_status === 'banned' ? 'bg-trust-red/10 text-trust-red' :
                            profile.account_status === 'facial_verify' ? 'bg-red-100 text-red-600' :
                            profile.account_status === 'challenge' ? 'bg-orange-100 text-orange-600' :
                            profile.account_status === 'wrong_password' ? 'bg-trust-yellow/10 text-trust-yellow' :
                            profile.account_status === 'email_verify' ? 'bg-purple-100 text-purple-600' :
                            'bg-gray-100 text-trust-muted'
                          }`}>
                            {profile.account_status === 'active' ? 'Activa' :
                             profile.account_status === 'banned' ? 'Baneada' :
                             profile.account_status === 'facial_verify' ? 'Facial' :
                             profile.account_status === 'challenge' ? 'Challenge' :
                             profile.account_status === 'wrong_password' ? 'Password' :
                             profile.account_status === 'email_verify' ? 'Email' :
                             profile.account_status === 'error' ? 'Error' :
                             profile.account_status}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1 justify-end">
                        {running ? (
                          <button onClick={() => handleClose(profile.id)} disabled={isLoading} className="px-2 py-1 bg-white text-trust-red border border-trust-red/30 rounded text-[11px] font-medium hover:bg-red-50 disabled:opacity-50">{isLoading ? '...' : 'Cerrar'}</button>
                        ) : (
                          <button onClick={() => handleLaunch(profile.id)} disabled={isLoading} className="px-2 py-1 bg-trust-accent text-white rounded text-[11px] font-medium hover:bg-trust-accent-hover disabled:opacity-50">{isLoading ? '...' : 'Abrir'}</button>
                        )}
                        <button onClick={() => { setEditProfile(profile); setShowForm(true); }} className="px-1.5 py-1 bg-gray-50 text-trust-muted border border-trust-border rounded text-[11px] hover:text-trust-dark">Editar</button>
                        <button onClick={() => handleDelete(profile.id)} className="px-1.5 py-1 bg-gray-50 text-trust-muted border border-trust-border rounded text-[11px] hover:text-trust-red">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
