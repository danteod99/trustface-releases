import React, { useState, useEffect } from 'react';

const STATUS_CONFIG = {
  ok: { label: 'Activa', bg: 'bg-trust-green/10', text: 'text-trust-green', border: 'border-trust-green/20' },
  error: { label: 'Error', bg: 'bg-trust-red/10', text: 'text-trust-red', border: 'border-trust-red/20' },
  banned: { label: 'Baneada', bg: 'bg-trust-red/10', text: 'text-trust-red', border: 'border-trust-red/20' },
  action_blocked: { label: 'Bloqueada', bg: 'bg-trust-yellow/10', text: 'text-trust-yellow', border: 'border-trust-yellow/20' },
  challenge: { label: 'Checkpoint', classes: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' },
  unchecked: { label: 'Sin verificar', bg: 'bg-gray-100', text: 'text-trust-muted', border: 'border-gray-200' },
};

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.unchecked;
}

export default function AccountChecker() {
  const [profiles, setProfiles] = useState([]);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const data = await window.api.listProfiles();
      setProfiles(data || []);
    } catch (err) {
      console.error('Error loading profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkSingle = async (profileId) => {
    setCheckingId(profileId);
    try {
      const result = await window.api.checkAccountHealth(profileId);
      setResults((prev) => ({
        ...prev,
        [profileId]: { status: result.status, message: result.message, checkedAt: new Date().toISOString() },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [profileId]: { status: 'error', message: err.message || 'Error desconocido', checkedAt: new Date().toISOString() },
      }));
    } finally {
      setCheckingId(null);
    }
  };

  const checkAll = async () => {
    setCheckingAll(true);
    try {
      const allResults = await window.api.checkAllAccounts();
      const newResults = {};
      for (const r of (allResults || [])) {
        newResults[r.profileId] = { status: r.status, message: r.message, checkedAt: new Date().toISOString() };
      }
      setResults((prev) => ({ ...prev, ...newResults }));
    } catch (err) {
      console.error('Error checking all accounts:', err);
    } finally {
      setCheckingAll(false);
    }
  };

  const getResult = (profileId) => results[profileId] || { status: 'unchecked', message: '', checkedAt: null };

  // Summary counts
  const statusCounts = {};
  profiles.forEach((p) => {
    const s = getResult(p.id).status;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-trust-muted text-sm">Cargando perfiles...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-trust-bg">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-trust-dark">Verificador de Cuentas</h2>
            <p className="text-trust-muted text-sm mt-1">{profiles.length} perfil{profiles.length !== 1 ? 'es' : ''} registrado{profiles.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={checkAll}
            disabled={checkingAll || profiles.length === 0}
            className="px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {checkingAll ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Verificando...
              </>
            ) : (
              'Verificar Todas'
            )}
          </button>
        </div>

        {/* Summary badges */}
        {Object.keys(results).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(statusCounts).map(([status, count]) => {
              const cfg = getStatusConfig(status);
              return (
                <span key={status} className={`text-xs px-3 py-1.5 rounded-full font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                  {cfg.label}: {count}
                </span>
              );
            })}
          </div>
        )}

        {/* Profiles table */}
        {profiles.length === 0 ? (
          <div className="bg-white border border-trust-border rounded-xl p-12 shadow-trust text-center">
            <h3 className="text-trust-dark font-semibold mb-1">Sin perfiles</h3>
            <p className="text-trust-muted text-sm">Agrega perfiles primero para verificar su estado</p>
          </div>
        ) : (
          <div className="bg-white border border-trust-border rounded-xl shadow-trust overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-trust-surface border-b border-trust-border text-xs text-trust-muted font-medium">
              <div className="col-span-3">Usuario</div>
              <div className="col-span-2">Estado</div>
              <div className="col-span-4">Mensaje</div>
              <div className="col-span-2">Verificado</div>
              <div className="col-span-1"></div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-trust-border">
              {profiles.map((profile) => {
                const result = getResult(profile.id);
                const cfg = getStatusConfig(result.status);
                const isChecking = checkingId === profile.id;

                return (
                  <div key={profile.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-trust-surface/50 transition-colors">
                    {/* Username */}
                    <div className="col-span-3 flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-trust-accent/10 flex items-center justify-center text-trust-accent text-xs font-bold shrink-0">
                        {(profile.fb_user || profile.name || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-trust-dark truncate">
                          {profile.fb_user || profile.name}
                        </div>
                        {profile.fb_user && profile.name && (
                          <div className="text-[10px] text-trust-muted truncate">{profile.name}</div>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="col-span-2">
                      <span className={`inline-flex text-[11px] px-2.5 py-1 rounded-full font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Message */}
                    <div className="col-span-4">
                      <span className="text-xs text-trust-muted truncate block">
                        {result.message || '\u2014'}
                      </span>
                    </div>

                    {/* Last checked */}
                    <div className="col-span-2">
                      <span className="text-[11px] text-trust-muted">
                        {result.checkedAt
                          ? new Date(result.checkedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
                          : '\u2014'}
                      </span>
                    </div>

                    {/* Check button */}
                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() => checkSingle(profile.id)}
                        disabled={isChecking || checkingAll}
                        className="px-2.5 py-1.5 text-xs font-medium text-trust-accent bg-trust-accent/5 border border-trust-accent/20 rounded-lg hover:bg-trust-accent/10 transition-colors disabled:opacity-40"
                        title="Verificar cuenta"
                      >
                        {isChecking ? (
                          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          'Verificar'
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
