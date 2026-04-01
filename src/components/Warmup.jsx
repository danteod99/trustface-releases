import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const handleStart = async (profileId) => {
    setLoading((prev) => ({ ...prev, [profileId]: true }));
    try {
      await window.api.startWarmup(profileId);
      await loadData();
    } finally {
      setLoading((prev) => ({ ...prev, [profileId]: false }));
    }
  };

  const handleStop = async (profileId) => {
    setLoading((prev) => ({ ...prev, [profileId]: true }));
    try {
      await window.api.stopWarmup(profileId);
      await loadData();
    } finally {
      setLoading((prev) => ({ ...prev, [profileId]: false }));
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

  return (
    <div className="flex flex-col h-full relative">
      {tier !== 'pro' && <UpgradePrompt feature="warmup" onUpgrade={onUpgrade} onClose={() => {}} />}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold text-trust-dark">Warm-up de Cuentas</h2>
        <button
          onClick={handleStartAll}
          disabled={bulkLoading}
          className="px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-trust"
        >
          {bulkLoading ? 'Iniciando...' : 'Iniciar Warm-up en Todas'}
        </button>
      </div>
      <p className="text-trust-muted text-sm mb-5">
        Calentamiento progresivo de 14 dias para cuentas nuevas de Facebook
      </p>

      {profiles.length === 0 ? (
        <div className="bg-white border border-trust-border rounded-xl p-8 shadow-trust text-center">
          <p className="text-trust-muted text-sm">No hay perfiles creados. Agrega perfiles primero.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {profiles.map((profile) => {
            const ws = warmupStatus[profile.id] || {};
            const day = ws.day || 0;
            const isActive = ws.active || false;
            const isStarted = ws.started || false;
            const isCompleted = day > 14 || ws.completed;
            const isBrowserOpen = runningIds.includes(profile.id);
            const limits = day > 0 ? getLimitsForDay(Math.min(day, 14)) : getLimitsForDay(1);
            const todayActions = ws.todayActions || { likes: 0, friends: 0, posts: 0, groups: 0 };
            const badge = getStatusBadge(ws);
            const progressPct = day > 0 ? Math.min((day / 14) * 100, 100) : 0;
            const isLoading = loading[profile.id] || false;

            return (
              <div
                key={profile.id}
                className={`bg-white border rounded-xl p-5 shadow-trust transition-all ${
                  isActive ? 'border-trust-green/40' : 'border-trust-border'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-trust-dark truncate">{profile.name}</h3>
                    {profile.fb_user && (
                      <p className="text-xs text-trust-muted">{profile.fb_user}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${badge.classes}`}>
                    {badge.pulse && (
                      <span className="w-1.5 h-1.5 rounded-full bg-trust-green animate-pulse" />
                    )}
                    {badge.label}
                  </span>
                </div>

                {/* Day progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-trust-dark">
                      {isStarted ? `Dia ${Math.min(day, 14)} de 14` : 'Sin iniciar'}
                    </span>
                    <span className="text-xs text-trust-muted">
                      {Math.round(progressPct)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-trust-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted ? 'bg-trust-accent' : isActive ? 'bg-trust-green' : 'bg-trust-border'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
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
                  <button
                    onClick={() => handleStop(profile.id)}
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 bg-trust-red text-white rounded-lg text-sm font-bold hover:bg-trust-red/90 transition-colors disabled:opacity-40"
                  >
                    {isLoading ? 'Deteniendo...' : 'Detener Warm-up'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleStart(profile.id)}
                    disabled={isLoading}
                    className="w-full px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-bold hover:bg-trust-accent-hover transition-colors disabled:opacity-40"
                  >
                    {isLoading ? 'Iniciando...' : 'Iniciar Warm-up'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Warm-up plan reference */}
      <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust mt-6">
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
