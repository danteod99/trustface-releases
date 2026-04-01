import React, { useState, useEffect } from 'react';

export default function Followers() {
  const [targets, setTargets] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [followers, setFollowers] = useState([]);
  const [history, setHistory] = useState([]);
  const [search, setSearch] = useState('');

  const loadTargets = async () => {
    const data = await window.api.listFollowerTargets();
    setTargets(data);
  };

  const loadHistory = async () => {
    const data = await window.api.getFollowerHistory();
    setHistory(data);
  };

  useEffect(() => {
    loadTargets();
    loadHistory();
  }, []);

  const selectTarget = async (targetUser) => {
    setSelectedTarget(targetUser);
    const data = await window.api.getFollowers(targetUser);
    setFollowers(data);
  };

  const handleExport = async (targetUser) => {
    const csv = await window.api.exportFollowersCsv(targetUser);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amigos_${targetUser}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (targetUser) => {
    if (!confirm(`Eliminar todos los amigos extraidos de ${targetUser}?`)) return;
    await window.api.deleteFollowers(targetUser);
    setSelectedTarget(null);
    setFollowers([]);
    loadTargets();
  };

  const handleCopyAll = () => {
    const text = filteredFollowers.map((f) => f.username).join('\n');
    navigator.clipboard.writeText(text);
  };

  const filteredFollowers = followers.filter((f) =>
    f.username.toLowerCase().includes(search.toLowerCase()) ||
    (f.full_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-bold text-trust-dark mb-1">Amigos Extraidos</h2>
      <p className="text-trust-muted text-sm mb-5">
        Visualiza y exporta los amigos extraidos de cuentas de Facebook
      </p>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left: Targets list */}
        <div className="w-80 flex flex-col gap-4 shrink-0">
          <div className="bg-white border border-trust-border rounded-xl shadow-trust flex flex-col flex-1 min-h-0">
            <div className="px-4 py-3 border-b border-trust-border">
              <h3 className="text-sm font-semibold text-trust-dark">Cuentas Extraidas</h3>
              <p className="text-xs text-trust-muted mt-0.5">{targets.length} cuenta{targets.length !== 1 ? 's' : ''}</p>
            </div>
            {targets.length === 0 ? (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center">
                  <div className="text-3xl mb-2 opacity-20">{'\u{1F4E5}'}</div>
                  <p className="text-sm text-trust-muted">No hay extracciones aun</p>
                  <p className="text-xs text-trust-muted mt-1">Ve a Scraper para extraer amigos</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-trust-border">
                {targets.map((t) => (
                  <button
                    key={t.target_user}
                    onClick={() => selectTarget(t.target_user)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-trust-surface ${
                      selectedTarget === t.target_user ? 'bg-trust-accent/5 border-l-2 border-l-trust-accent' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-trust-dark">{t.target_user}</span>
                      <span className="text-xs font-bold text-trust-accent bg-trust-accent/10 px-2 py-0.5 rounded-full">
                        {t.count.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-trust-muted mt-0.5">
                      {new Date(t.last_extracted + 'Z').toLocaleDateString('es-PE', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-white border border-trust-border rounded-xl shadow-trust">
              <div className="px-4 py-3 border-b border-trust-border">
                <h3 className="text-sm font-semibold text-trust-dark">Historial</h3>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-trust-border">
                {history.slice(0, 10).map((h, i) => (
                  <div key={i} className="px-4 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-trust-dark font-medium">{h.target_user}</span>
                      <span className="text-trust-green font-medium">+{h.count}</span>
                    </div>
                    <div className="text-trust-muted">
                      {h.extracted_by && `por ${h.extracted_by} · `}
                      {new Date(h.extracted_at + 'Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Followers list */}
        <div className="flex-1 flex flex-col min-w-0">
          {!selectedTarget ? (
            <div className="flex-1 bg-white border border-trust-border rounded-xl shadow-trust flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3 opacity-15">{'\u{1F464}'}</div>
                <p className="text-trust-muted">Selecciona una cuenta para ver sus amigos</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white border border-trust-border rounded-xl shadow-trust flex flex-col min-h-0">
              {/* Header */}
              <div className="px-5 py-4 border-b border-trust-border">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-trust-dark">
                      Amigos de {selectedTarget}
                    </h3>
                    <p className="text-sm text-trust-muted">{filteredFollowers.length.toLocaleString()} amigos</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyAll}
                      className="px-3 py-1.5 bg-trust-surface border border-trust-border text-trust-muted rounded-lg text-xs font-medium hover:text-trust-dark hover:bg-gray-100 transition-colors"
                    >
                      Copiar todos
                    </button>
                    <button
                      onClick={() => handleExport(selectedTarget)}
                      className="px-3 py-1.5 bg-trust-accent text-white rounded-lg text-xs font-medium hover:bg-trust-accent-hover transition-colors"
                    >
                      Exportar CSV
                    </button>
                    <button
                      onClick={() => handleDelete(selectedTarget)}
                      className="px-3 py-1.5 bg-white text-trust-red border border-trust-red/30 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
                {/* Search */}
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar usuario..."
                  className="w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2 text-trust-dark text-sm focus:outline-none focus:border-trust-accent focus:ring-1 focus:ring-trust-accent/20"
                />
              </div>

              {/* Followers table */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-trust-surface border-b border-trust-border">
                    <tr>
                      <th className="text-left text-xs font-semibold text-trust-muted px-5 py-2.5 w-12">#</th>
                      <th className="text-left text-xs font-semibold text-trust-muted px-3 py-2.5">Usuario</th>
                      <th className="text-left text-xs font-semibold text-trust-muted px-3 py-2.5">Nombre</th>
                      <th className="text-left text-xs font-semibold text-trust-muted px-3 py-2.5">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-trust-border">
                    {filteredFollowers.map((f, i) => (
                      <tr key={f.id || i} className="hover:bg-trust-surface transition-colors">
                        <td className="px-5 py-2 text-xs text-trust-muted">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="text-sm font-medium text-trust-accent">{f.username}</span>
                        </td>
                        <td className="px-3 py-2 text-sm text-trust-muted">{f.full_name || '-'}</td>
                        <td className="px-3 py-2 text-xs text-trust-muted">
                          {new Date(f.extracted_at + 'Z').toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
