import React, { useState, useEffect } from 'react';
import UpgradePrompt from './shared/UpgradePrompt';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-trust-accent focus:ring-1 focus:ring-trust-accent/20';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

const ACTION_OPTIONS = [
  { value: 'auto:like', label: 'Auto Like' },
  { value: 'auto:like-hashtag', label: 'Like x Hashtag' },
  { value: 'auto:like-feed', label: 'Like en Feed' },
  { value: 'auto:like-explore', label: 'Like en Explorar' },
  { value: 'auto:follow', label: 'Auto Follow' },
  { value: 'auto:follow-hashtag', label: 'Follow x Hashtag' },
  { value: 'auto:unfollow', label: 'Auto Unfollow' },
  { value: 'auto:watch-reels', label: 'Ver Reels' },
  { value: 'auto:stories', label: 'Ver Stories' },
  { value: 'auto:visit', label: 'Visitar Perfiles' },
  { value: 'auto:comment', label: 'Auto Comment' },
  { value: 'auto:send-dm', label: 'Enviar DM' },
  { value: 'auto:extract-followers', label: 'Extraer Seguidores' },
];

const DAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mie' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sab' },
];

function formatSchedule(task) {
  if (!task) return '';
  let days = task.schedule_days || [];
  if (typeof days === 'string') {
    try { days = JSON.parse(days); } catch { days = []; }
  }
  const dayNames = (days)
    .sort((a, b) => a - b)
    .map((d) => DAYS.find((day) => day.value === d)?.label || '')
    .filter(Boolean);
  const time = task.schedule_time || '00:00';
  if (dayNames.length === 7) return `Todos los dias a las ${time}`;
  if (dayNames.length === 0) return `Sin dias - ${time}`;
  return `${dayNames.join(', ')} a las ${time}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'Nunca';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function Scheduler({ tier, onUpgrade }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', action: ACTION_OPTIONS[0].value, config: '{}', time: '08:00', days: [1, 2, 3, 4, 5] });

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    try {
      const data = await window.api.listScheduledTasks();
      setTasks(data || []);
    } catch (err) {
      console.error('Error loading tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('El nombre es requerido');
    if (form.days.length === 0) return alert('Selecciona al menos un dia');

    let configObj = {};
    try {
      configObj = form.config.trim() ? JSON.parse(form.config) : {};
    } catch {
      return alert('La configuracion JSON no es valida');
    }

    await window.api.createScheduledTask({
      name: form.name,
      action: form.action,
      config: configObj,
      schedule_time: form.time,
      schedule_days: form.days,
    });
    setForm({ name: '', action: ACTION_OPTIONS[0].value, config: '{}', time: '08:00', days: [1, 2, 3, 4, 5] });
    setShowModal(false);
    await loadTasks();
  };

  const handleToggle = async (id) => {
    await window.api.toggleScheduledTask(id);
    await loadTasks();
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar esta tarea programada?')) return;
    await window.api.deleteScheduledTask(id);
    await loadTasks();
  };

  const toggleDay = (dayVal) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(dayVal)
        ? prev.days.filter((d) => d !== dayVal)
        : [...prev.days, dayVal],
    }));
  };

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-trust-muted text-sm">Cargando tareas...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-trust-bg relative">
      {tier !== 'pro' && <UpgradePrompt feature="scheduler" onUpgrade={onUpgrade} onClose={() => {}} />}
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-trust-dark">Programador de Tareas</h2>
            <p className="text-trust-muted text-sm mt-1">{tasks.length} tarea{tasks.length !== 1 ? 's' : ''} programada{tasks.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors flex items-center gap-2"
          >
            <span className="text-base leading-none">+</span> Nueva Tarea
          </button>
        </div>

        {/* Task list */}
        {tasks.length === 0 ? (
          <div className="bg-white border border-trust-border rounded-xl p-12 shadow-trust text-center">
            <div className="text-3xl text-trust-muted mb-3">{'\u23F0'}</div>
            <h3 className="text-trust-dark font-semibold mb-1">Sin tareas programadas</h3>
            <p className="text-trust-muted text-sm">Crea una tarea para automatizar acciones en horarios especificos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="bg-white border border-trust-border rounded-xl p-4 shadow-trust">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(task.id)}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${
                        task.enabled ? 'bg-trust-accent' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${
                          task.enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-trust-dark truncate">{task.name}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          task.enabled
                            ? 'bg-trust-green/10 text-trust-green'
                            : 'bg-gray-100 text-trust-muted'
                        }`}>
                          {task.enabled ? 'Activa' : 'Pausada'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-trust-accent font-medium">{task.action}</span>
                        <span className="text-xs text-trust-muted">{formatSchedule(task)}</span>
                      </div>
                      {task.last_run && (
                        <div className="text-[10px] text-trust-muted mt-0.5">
                          Ultima ejecucion: {formatDate(task.last_run)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-2 text-trust-muted hover:text-trust-red transition-colors shrink-0"
                    title="Eliminar tarea"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white border border-trust-border rounded-2xl w-full max-w-lg p-6 shadow-trust-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-trust-dark mb-4">Nueva Tarea Programada</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>Nombre de la tarea</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="Ej: Likes matutinos"
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Tipo de accion</label>
                <select
                  value={form.action}
                  onChange={(e) => updateForm('action', e.target.value)}
                  className={INPUT_CLASS}
                >
                  {ACTION_OPTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={LABEL_CLASS}>Configuracion (JSON)</label>
                <textarea
                  value={form.config}
                  onChange={(e) => updateForm('config', e.target.value)}
                  placeholder='{"maxLikes": 50, "hashtag": "marketing"}'
                  rows={3}
                  className={INPUT_CLASS + ' font-mono resize-none'}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Hora de ejecucion</label>
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => updateForm('time', e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label className={LABEL_CLASS}>Dias de la semana</label>
                <div className="flex gap-2">
                  {DAYS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors border ${
                        form.days.includes(day.value)
                          ? 'bg-trust-accent text-white border-trust-accent'
                          : 'bg-trust-surface text-trust-muted border-trust-border hover:border-trust-accent/40'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors"
                >
                  Crear Tarea
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 bg-gray-100 text-trust-muted rounded-lg text-sm hover:text-trust-dark transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
