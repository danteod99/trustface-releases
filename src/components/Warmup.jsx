import React, { useState, useEffect, useRef } from 'react';
import UpgradePrompt from './shared/UpgradePrompt';

const WARMUP_PLAN = [
  { days: [1, 2], likes: 5, friends: 2, posts: 0, groups: 0 },
  { days: [3, 4], likes: 10, friends: 5, posts: 1, groups: 1 },
  { days: [5, 6, 7], likes: 20, friends: 10, posts: 2, groups: 2 },
  { days: [8, 9, 10], likes: 30, friends: 15, posts: 3, groups: 2 },
  { days: [11, 12, 13, 14], likes: 50, friends: 20, posts: 4, groups: 3 },
];

function getLimitsForDay(day) {
  for (const tier of WARMUP_PLAN) {
    if (tier.days.includes(day)) {
      return { likes: tier.likes, friends: tier.friends, posts: tier.posts, groups: tier.groups };
    }
  }
  return { likes: 50, friends: 20, posts: 4, groups: 3 };
}

function getStatusBadge(status) {
  if (!status || !status.started) {
    return { label: 'Inactivo', classes: 'bg-gray-100 text-gray-500' };
  }
  if (status.day > 14 || status.completed) {
    return { label: 'Completado', classes: 'bg-trust-accent/10 text-trust-accent' };
  }
  if (status.active) {
    return { label: 'En warm-up', classes: 'bg-trust-green/10 text-trust-green', pulse: true };
  }
  return { label: 'Inactivo', classes: 'bg-gray-100 text-gray-500' };
}

export default function Warmup({ tier, onUpgrade }) {
  const [profiles, setProfiles] = useState([]);
  const [runningIds, setRunningIds] = useState([]);
  const [warmupStatus, setWarmupStatus] = useState({});
  const [loading, setLoading] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'cards'
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);

  const addLog = (msg, type = 'info') => {
    setLogs(prev => [...prev.slice(-150), { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Listen for warmup automation events
  useEffect(() => {
    if (!window.api?.onAutomationEvent) return;
    const handler = (data) => {
      if (data?.data?.source !== 'warmup-auto') return;
      const profileName = profiles.find(p => p.id === data.profileId)?.name || data.profileId;
      const ev = data.event;
      const d = data.data || {};
      if (ev === 'start') {
        addLog(`${profileName}: Dia ${d.day} — iniciando sesion`, 'info');
      } else if (ev === 'progress') {
        addLog(`${profileName}: ${d.action} +${d.done} (dia ${d.day})`, 'done');
      } else if (ev === 'done' && d.type === 'warmup-batch') {
        addLog(`${profileName}: ${d.message}`, 'done');
      } else if (ev === 'done' && d.type === 'warmup') {
        addLog(`${profileName}: Warm-up de 14 dias completado`, 'done');
      } else if (ev === 'error') {
        addLog(`${profileName}: Error — ${d.error}`, 'error');
      }
    };
    window.api.onAutomationEvent(handler);
  }, [profiles]);

  const loadData = async () => {
    try {
      const data = await window.api.listProfiles();
      setProfiles(data);
      const status = await window.api.getBrowserStatus();
      setRunningIds(status);
      const allWarmup = await window.api.getAllWarmupStatus();
      setWarmupStatus(allWarmup || {});
    } catch (err) {
      // silently retry on next interval
    }
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectAll = () => setSelectedIds(profiles.map(p => p.id));
  const selectNone = () => setSelectedIds([]);

  const handleStart = async (profileId) => {
    const name = profiles.find(p => p.id === profileId)?.name || profileId;
    setLoading((prev) => ({ ...prev, [profileId]: true }));
    try {
      const result = await window.api.startWarmup(profileId);
      if (result?.error) addLog(`${name}: Error — ${result.error}`, 'error');
      else addLog(`${name}: Warm-up iniciado`, 'info');
      await loadData();
    } finally {
      setLoading((prev) => ({ ...prev, [profileId]: false }));
    }
  };

  const handleStop = async (profileId) => {
    const name = profiles.find(p => p.id === profileId)?.name || profileId;
    setLoading((prev) => ({ ...prev, [profileId]: true }));
    try {
      await window.api.stopWarmup(profileId);
      addLog(`${name}: Warm-up detenido`, 'warning');
      await loadData();
    } finally {
      setLoading((prev) => ({ ...prev, [profileId]: false }));
    }
  };

  const handleStartSelected = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const toStart = selectedIds.filter(id => {
        const ws = warmupStatus[id];
        return !ws || !ws.active;
      });
      const BATCH_SIZE = 5;
      for (let i = 0; i < toStart.length; i += BATCH_SIZE) {
        const batch = toStart.slice(i, i + BATCH_SIZE);
        for (const id of batch) {
          await window.api.startWarmup(id);
          await new Promise((r) => setTimeout(r, 8000));
        }
        await loadData();
        if (i + BATCH_SIZE < toStart.length) {
          await new Promise((r) => setTimeout(r, 30000));
        }
      }
      await loadData();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleStopSelected = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      for (const id of selectedIds) {
        const ws = warmupStatus[id];
        if (ws?.active) {
          await window.api.stopWarmup(id);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      await loadData();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleStartAll = async () => {
    setBulkLoading(true);
    try {
      const inactive = profiles.filter((p) => {
        const ws = warmupStatus[p.id];
        return !ws || !ws.active;
      });
      const BATCH_SIZE = 5;
      for (let i = 0; i < inactive.length; i += BATCH_SIZE) {
        const batch = inactive.slice(i, i + BATCH_SIZE);
        for (const p of batch) {
          await window.api.startWarmup(p.id);
          await new Promise((r) => setTimeout(r, 8000));
        }
        await loadData();
        if (i + BATCH_SIZE < inactive.length) {
          await new Promise((r) => setTimeout(r, 30000));
        }
      }
      await loadData();
    } finally {
      setBulkLoading(false);
    }
  };

  // Stats
  const activeCount = profiles.filter(p => warmupStatus[p.id]?.active).length;
  const completedCount = profiles.filter(p => {
    const ws = warmupStatus[p.id];
    return ws && (ws.day > 14 || ws.completed);
  }).length;
  const selectedActiveCount = selectedIds.filter(id => warmupStatus[id]?.active).length;
  const selectedInactiveCount = selectedIds.filter(id => {
    const ws = warmupStatus[id];
    return !ws || (!ws.active && !(ws.day > 14 || ws.completed));
  }).length;

  return (
    <div className="flex flex-col h-full relative overflow-y-auto">
      {tier !== 'pro' && <UpgradePrompt feature="warmup" onUpgrade={onUpgrade} onClose={() => {}} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold text-trust-dark">Warm-up de Cuentas</h2>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-trust-surface rounded-lg p-0.5">
            <button onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-white text-trust-dark shadow-sm' : 'text-trust-muted hover:text-trust-dark'}`}>
              Lista
            </button>
            <button onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'cards' ? 'bg-white text-trust-dark shadow-sm' : 'text-trust-muted hover:text-trust-dark'}`}>
              Cards
            </button>
          </div>
          <button onClick={handleStartAll} disabled={bulkLoading}
            className="px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-trust">
            {bulkLoading ? 'Procesando...' : 'Iniciar Todas'}
          </button>
        </div>
      </div>
      <p className="text-trust-muted text-sm mb-3">
        Calentamiento progresivo de 14 dias para cuentas nuevas de Facebook
      </p>

      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <span className="text-trust-muted">{profiles.length} perfiles</span>
        <span className="text-trust-green font-medium">{activeCount} activos</span>
        <span className="text-trust-accent font-medium">{completedCount} completados</span>
        {selectedIds.length > 0 && (
          <span className="text-blue-600 font-medium">{selectedIds.length} seleccionados</span>
        )}
      </div>

      {/* Bulk actions for selected */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <span className="text-xs text-blue-700 font-medium">{selectedIds.length} seleccionado(s)</span>
          <div className="flex-1" />
          {selectedInactiveCount > 0 && (
            <button onClick={handleStartSelected} disabled={bulkLoading}
              className="px-3 py-1.5 bg-trust-accent text-white rounded-lg text-xs font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-40">
              {bulkLoading ? 'Procesando...' : `Iniciar ${selectedInactiveCount}`}
            </button>
          )}
          {selectedActiveCount > 0 && (
            <button onClick={handleStopSelected} disabled={bulkLoading}
              className="px-3 py-1.5 bg-trust-red text-white rounded-lg text-xs font-bold hover:bg-trust-red/90 transition-colors disabled:opacity-40">
              {bulkLoading ? 'Procesando...' : `Detener ${selectedActiveCount}`}
            </button>
          )}
          <button onClick={selectNone} className="px-3 py-1.5 text-xs text-trust-muted hover:text-trust-dark">
            Deseleccionar
          </button>
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="bg-white border border-trust-border rounded-xl p-8 shadow-trust text-center">
          <p className="text-trust-muted text-sm">No hay perfiles creados. Agrega perfiles primero.</p>
        </div>
      ) : viewMode === 'list' ? (
        /* ── LIST VIEW ── */
        <div className="bg-white border border-trust-border rounded-xl shadow-trust overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-trust-surface z-10">
                <tr className="text-trust-muted text-xs border-b border-trust-border">
                  <th className="text-left py-2.5 pl-4 pr-2 w-8">
                    <input type="checkbox"
                      checked={selectedIds.length === profiles.length && profiles.length > 0}
                      onChange={() => selectedIds.length === profiles.length ? selectNone() : selectAll()}
                      className="accent-blue-600 w-3.5 h-3.5 cursor-pointer" />
                  </th>
                  <th className="text-left py-2.5 px-2 font-semibold">Perfil</th>
                  <th className="text-center py-2.5 px-2 font-semibold">Estado</th>
                  <th className="text-center py-2.5 px-2 font-semibold">Dia</th>
                  <th className="text-center py-2.5 px-2 font-semibold">Progreso</th>
                  <th className="text-center py-2.5 px-2 font-semibold">Likes</th>
                  <th className="text-center py-2.5 px-2 font-semibold">Amigos</th>
                  <th className="text-center py-2.5 px-2 font-semibold">Posts</th>
                  <th className="text-center py-2.5 px-2 font-semibold">Grupos</th>
                  <th className="text-center py-2.5 px-2 pr-4 font-semibold">Accion</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const ws = warmupStatus[profile.id] || {};
                  const day = ws.day || 0;
                  const isActive = ws.active || false;
                  const isStarted = ws.started || false;
                  const isCompleted = day > 14 || ws.completed;
                  const limits = day > 0 ? getLimitsForDay(Math.min(day, 14)) : getLimitsForDay(1);
                  const todayActions = ws.todayActions || { likes: 0, friends: 0, posts: 0, groups: 0 };
                  const badge = getStatusBadge(ws);
                  const progressPct = day > 0 ? Math.min((day / 14) * 100, 100) : 0;
                  const isLoading = loading[profile.id] || false;
                  const isSelected = selectedIds.includes(profile.id);

                  return (
                    <tr key={profile.id}
                      className={`border-b border-trust-border/50 hover:bg-trust-surface/50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}>
                      <td className="py-2.5 pl-4 pr-2">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(profile.id)}
                          className="accent-blue-600 w-3.5 h-3.5 cursor-pointer" />
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-trust-dark text-xs">{profile.name}</div>
                        {profile.fb_user && <div className="text-[10px] text-trust-muted">{profile.fb_user}</div>}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.classes}`}>
                          {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-trust-green animate-pulse" />}
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-trust-dark font-medium">
                        {isStarted ? `${Math.min(day, 14)}/14` : '-'}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-trust-surface rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-trust-accent' : isActive ? 'bg-trust-green' : 'bg-trust-border'}`}
                              style={{ width: `${progressPct}%` }} />
                          </div>
                          <span className="text-[10px] text-trust-muted w-7 text-right">{Math.round(progressPct)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-trust-dark">
                        {isStarted ? `${todayActions.likes}/${limits.likes}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-trust-dark">
                        {isStarted ? `${todayActions.friends}/${limits.friends}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-trust-dark">
                        {isStarted ? `${todayActions.posts}/${limits.posts}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-trust-dark">
                        {isStarted ? `${todayActions.groups}/${limits.groups}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 pr-4 text-center">
                        {isCompleted ? (
                          <span className="text-[10px] text-trust-accent font-semibold">Completado</span>
                        ) : isActive ? (
                          <button onClick={() => handleStop(profile.id)} disabled={isLoading || bulkLoading}
                            className="px-2.5 py-1 bg-trust-red text-white rounded-md text-[10px] font-bold hover:bg-trust-red/90 transition-colors disabled:opacity-40">
                            {isLoading ? '...' : 'Detener'}
                          </button>
                        ) : (
                          <button onClick={() => handleStart(profile.id)} disabled={isLoading || bulkLoading}
                            className="px-2.5 py-1 bg-trust-accent text-white rounded-md text-[10px] font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-40">
                            {isLoading ? '...' : 'Iniciar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── CARDS VIEW (original) ── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {profiles.map((profile) => {
            const ws = warmupStatus[profile.id] || {};
            const day = ws.day || 0;
            const isActive = ws.active || false;
            const isStarted = ws.started || false;
            const isCompleted = day > 14 || ws.completed;
            const limits = day > 0 ? getLimitsForDay(Math.min(day, 14)) : getLimitsForDay(1);
            const todayActions = ws.todayActions || { likes: 0, friends: 0, posts: 0, groups: 0 };
            const badge = getStatusBadge(ws);
            const progressPct = day > 0 ? Math.min((day / 14) * 100, 100) : 0;
            const isLoading = loading[profile.id] || false;
            const isSelected = selectedIds.includes(profile.id);

            return (
              <div key={profile.id}
                className={`bg-white border rounded-xl p-5 shadow-trust transition-all cursor-pointer ${
                  isActive ? 'border-trust-green/40' : isSelected ? 'border-blue-400' : 'border-trust-border'
                } ${isSelected ? 'ring-2 ring-blue-200' : ''}`}
                onClick={() => toggleSelect(profile.id)}>

                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(profile.id)}
                      onClick={e => e.stopPropagation()}
                      className="accent-blue-600 w-3.5 h-3.5 cursor-pointer shrink-0" />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-trust-dark truncate">{profile.name}</h3>
                      {profile.fb_user && <p className="text-xs text-trust-muted">{profile.fb_user}</p>}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${badge.classes}`}>
                    {badge.pulse && <span className="w-1.5 h-1.5 rounded-full bg-trust-green animate-pulse" />}
                    {badge.label}
                  </span>
                </div>

                {/* Day progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-trust-dark">
                      {isStarted ? `Dia ${Math.min(day, 14)} de 14` : 'Sin iniciar'}
                    </span>
                    <span className="text-xs text-trust-muted">{Math.round(progressPct)}%</span>
                  </div>
                  <div className="w-full h-2 bg-trust-surface rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-trust-accent' : isActive ? 'bg-trust-green' : 'bg-trust-border'}`}
                      style={{ width: `${progressPct}%` }} />
                  </div>
                </div>

                {/* Daily limits */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-trust-surface rounded-lg px-3 py-2">
                    <div className="text-xs text-trust-muted">Likes</div>
                    <div className="text-sm font-bold text-trust-dark">
                      {isStarted ? `${todayActions.likes}/${limits.likes}` : `0/${limits.likes}`}
                    </div>
                  </div>
                  <div className="bg-trust-surface rounded-lg px-3 py-2">
                    <div className="text-xs text-trust-muted">Amigos</div>
                    <div className="text-sm font-bold text-trust-dark">
                      {isStarted ? `${todayActions.friends}/${limits.friends}` : `0/${limits.friends}`}
                    </div>
                  </div>
                  <div className="bg-trust-surface rounded-lg px-3 py-2">
                    <div className="text-xs text-trust-muted">Posts</div>
                    <div className="text-sm font-bold text-trust-dark">
                      {isStarted ? `${todayActions.posts}/${limits.posts}` : `0/${limits.posts}`}
                    </div>
                  </div>
                  <div className="bg-trust-surface rounded-lg px-3 py-2">
                    <div className="text-xs text-trust-muted">Grupos</div>
                    <div className="text-sm font-bold text-trust-dark">
                      {isStarted ? `${todayActions.groups}/${limits.groups}` : `0/${limits.groups}`}
                    </div>
                  </div>
                </div>

                {/* Action button */}
                {isCompleted ? (
                  <div className="text-xs text-trust-accent text-center py-2 bg-trust-accent/5 rounded-lg font-semibold">
                    Warm-up completado
                  </div>
                ) : isActive ? (
                  <button onClick={(e) => { e.stopPropagation(); handleStop(profile.id); }} disabled={isLoading}
                    className="w-full px-4 py-2.5 bg-trust-red text-white rounded-lg text-sm font-bold hover:bg-trust-red/90 transition-colors disabled:opacity-40">
                    {isLoading ? 'Deteniendo...' : 'Detener Warm-up'}
                  </button>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); handleStart(profile.id); }} disabled={isLoading}
                    className="w-full px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-40">
                    {isLoading ? 'Iniciando...' : 'Iniciar Warm-up'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Logs */}
      <div className="bg-white border border-trust-border rounded-xl shadow-trust mt-4 shrink-0">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-trust-border">
          <h3 className="text-xs font-bold text-trust-dark">Logs de Warm-up</h3>
          {logs.length > 0 && (
            <button onClick={() => setLogs([])} className="text-[10px] text-trust-muted hover:text-trust-dark">Limpiar</button>
          )}
        </div>
        <div ref={logRef} className="h-28 overflow-y-auto px-4 py-2 font-mono text-[11px] space-y-0.5">
          {logs.length === 0 ? (
            <p className="text-trust-muted text-xs py-4 text-center">Sin actividad aun — los logs apareceran cuando el warm-up se ejecute</p>
          ) : logs.map((log, i) => (
            <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-500' : log.type === 'done' ? 'text-trust-green' : log.type === 'warning' ? 'text-amber-500' : 'text-trust-muted'}`}>
              <span className="text-trust-muted/60 shrink-0">{log.time}</span>
              <span>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Warm-up plan reference */}
      <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust mt-6 shrink-0">
        <h3 className="text-sm font-bold text-trust-dark mb-3">Plan de Warm-up Progresivo</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-trust-muted border-b border-trust-border">
                <th className="text-left py-2 pr-4 font-semibold">Dias</th>
                <th className="text-center py-2 px-3 font-semibold">Likes</th>
                <th className="text-center py-2 px-3 font-semibold">Amigos</th>
                <th className="text-center py-2 px-3 font-semibold">Posts</th>
                <th className="text-center py-2 px-3 font-semibold">Grupos</th>
              </tr>
            </thead>
            <tbody>
              {WARMUP_PLAN.map((tier, i) => (
                <tr key={i} className="border-b border-trust-border/50 text-trust-dark">
                  <td className="py-2 pr-4 font-medium">
                    Dia {tier.days[0]}{tier.days.length > 1 ? `-${tier.days[tier.days.length - 1]}` : ''}
                  </td>
                  <td className="text-center py-2 px-3">{tier.likes}</td>
                  <td className="text-center py-2 px-3">{tier.friends}</td>
                  <td className="text-center py-2 px-3">{tier.posts}</td>
                  <td className="text-center py-2 px-3">{tier.groups}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
