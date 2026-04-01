import React, { useState, useEffect } from 'react';

const STAT_CARDS = [
  { key: 'likes', label: 'Likes Dados', icon: '\u2665', color: 'text-red-500', bg: 'bg-red-50' },
  { key: 'follows', label: 'Follows', icon: '+', color: 'text-trust-accent', bg: 'bg-blue-50' },
  { key: 'unfollows', label: 'Unfollows', icon: '\u2212', color: 'text-orange-500', bg: 'bg-orange-50' },
  { key: 'stories', label: 'Stories Vistas', icon: '\u25CE', color: 'text-pink-500', bg: 'bg-pink-50' },
  { key: 'comments', label: 'Comentarios', icon: '\u2606', color: 'text-trust-yellow', bg: 'bg-yellow-50' },
  { key: 'dms', label: 'DMs Enviados', icon: '\u2709', color: 'text-green-500', bg: 'bg-green-50' },
  { key: 'visits', label: 'Visitas', icon: '\u25C9', color: 'text-cyan-600', bg: 'bg-cyan-50' },
];

const DAY_LABELS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Hace un momento';
  if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
}

function activityTypeLabel(type) {
  const map = {
    like: 'Like', follow: 'Follow', unfollow: 'Unfollow',
    story: 'Story', comment: 'Comentario', dm: 'DM',
    visit: 'Visita', extract: 'Extraccion', reels: 'Reels',
  };
  return map[type] || type;
}

export default function Dashboard() {
  const [stats, setStats] = useState({ likes: 0, follows: 0, unfollows: 0, stories: 0, comments: 0, dms: 0, visits: 0 });
  const [profiles, setProfiles] = useState([]);
  const [runningIds, setRunningIds] = useState([]);
  const [activity, setActivity] = useState([]);
  const [dailyStats, setDailyStats] = useState([]);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadAll = async () => {
    try {
      const [p, running, s, act, daily, tgt] = await Promise.all([
        window.api.listProfiles(),
        window.api.getBrowserStatus(),
        window.api.getActionStats(),
        window.api.getRecentActivity(20),
        window.api.getDailyStats(7),
        window.api.listFollowerTargets(),
      ]);
      setProfiles(p || []);
      setRunningIds(running || []);
      setStats(s || { likes: 0, follows: 0, unfollows: 0, stories: 0, comments: 0, dms: 0, visits: 0 });
      setActivity(act || []);
      setDailyStats(daily || []);
      setTargets(tgt || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalProfiles = profiles.length;
  const activeCount = runningIds.length;
  const totalExtracted = targets.reduce((sum, t) => sum + (t.count || 0), 0);
  const maxDaily = Math.max(...dailyStats.map((d) => d.actions || 0), 1);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-trust-muted text-sm">Cargando estadisticas...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-trust-bg">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-trust-dark">Panel de Control</h2>
          <p className="text-trust-muted text-sm mt-1">Resumen general de actividad</p>
        </div>

        {/* Profile summary cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-trust-accent/10 flex items-center justify-center text-trust-accent font-bold text-lg">
                #
              </div>
              <div>
                <div className="text-2xl font-bold text-trust-dark">{totalProfiles}</div>
                <div className="text-xs text-trust-muted">Perfiles Totales</div>
              </div>
            </div>
          </div>
          <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-trust-green/10 flex items-center justify-center text-trust-green font-bold text-lg">
                {'\u25B6'}
              </div>
              <div>
                <div className="text-2xl font-bold text-trust-dark">{activeCount}</div>
                <div className="text-xs text-trust-muted">Activos Ahora</div>
              </div>
            </div>
          </div>
          <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-lg">
                {'\u2193'}
              </div>
              <div>
                <div className="text-2xl font-bold text-trust-dark">{totalExtracted.toLocaleString()}</div>
                <div className="text-xs text-trust-muted">Seguidores Extraidos</div>
              </div>
            </div>
            <div className="text-[11px] text-trust-muted mt-2">{targets.length} objetivo{targets.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* Action stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {STAT_CARDS.map((card) => (
            <div key={card.key} className="bg-white border border-trust-border rounded-xl p-4 shadow-trust">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center ${card.color} font-bold text-base`}>
                  {card.icon}
                </div>
                <div>
                  <div className="text-xl font-bold text-trust-dark">{(stats[card.key] || 0).toLocaleString()}</div>
                  <div className="text-[11px] text-trust-muted">{card.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom row: chart + activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar chart */}
          <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust">
            <h3 className="text-sm font-semibold text-trust-dark mb-4">Actividad - Ultimos 7 dias</h3>
            <div className="flex items-end gap-2 h-40">
              {dailyStats.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-trust-muted text-xs">Sin datos</div>
              ) : (
                dailyStats.map((day, i) => {
                  const height = Math.max((day.actions / maxDaily) * 100, 4);
                  const dateObj = new Date(day.date);
                  const dayLabel = DAY_LABELS[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1] || '';
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-trust-muted font-medium">{day.actions}</span>
                      <div className="w-full flex justify-center">
                        <div
                          className="w-8 bg-trust-accent rounded-t-md transition-all"
                          style={{ height: `${height}%`, minHeight: '4px' }}
                        />
                      </div>
                      <span className="text-[10px] text-trust-muted">{dayLabel}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Activity log */}
          <div className="bg-white border border-trust-border rounded-xl p-5 shadow-trust">
            <h3 className="text-sm font-semibold text-trust-dark mb-4">Actividad Reciente</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {activity.length === 0 ? (
                <div className="text-trust-muted text-xs text-center py-6">Sin actividad reciente</div>
              ) : (
                activity.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-trust-surface transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium text-trust-accent shrink-0">
                        {activityTypeLabel(item.type)}
                      </span>
                      {item.target && (
                        <span className="text-xs text-trust-dark truncate">@{item.target}</span>
                      )}
                      {item.count > 0 && (
                        <span className="text-[10px] text-trust-muted">x{item.count}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-trust-muted shrink-0 ml-2">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
