import React, { useState, useEffect, useCallback, useMemo } from 'react';

const BTN = 'px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-40';
const BTN_PRIMARY = `${BTN} bg-trust-accent text-white hover:bg-trust-accent-hover`;
const BTN_SOFT = `${BTN} text-trust-accent bg-trust-accent/5 border border-trust-accent/20 hover:bg-trust-accent/10`;
const SELECT = 'bg-trust-surface border border-trust-border rounded-lg px-3 py-2 text-trust-dark text-xs focus:outline-none focus:border-blue-500';
const CARD = 'bg-white border border-trust-border rounded-xl shadow-trust';

const STATUS_STYLE = {
  active: 'bg-trust-green/10 text-trust-green border-trust-green/20',
  restricted: 'bg-trust-yellow/10 text-trust-yellow border-trust-yellow/20',
  disabled: 'bg-trust-red/10 text-trust-red border-trust-red/20',
  unknown: 'bg-gray-100 text-trust-muted border-gray-200',
};
const RANGES = [['today', 'Hoy'], ['yesterday', 'Ayer'], ['last_7d', '7 días'], ['last_30d', '30 días']];
const KIND_LABEL = { ad_account: 'Cuentas de anuncios', page: 'Páginas', person: 'Personas' };

const money = (v, cur) => (v === null || v === undefined ? '—' : `${cur ? cur + ' ' : ''}${Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const num = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-PE', { maximumFractionDigits: d }));
const when = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export default function AdsManager({ tier, onUpgrade }) {
  const [tab, setTab] = useState('accounts');
  const [profiles, setProfiles] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [daily, setDaily] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [logRows, setLogRows] = useState([]);
  const [range, setRange] = useState('today');
  const [level, setLevel] = useState('campaign');
  const [busy, setBusy] = useState(null); // { task, profileId }
  const [progress, setProgress] = useState(null);
  const [messages, setMessages] = useState([]);
  const [confirm, setConfirm] = useState(null); // { token, summary }
  const [settings, setSettings] = useState({ concurrency: 1 });
  const isPro = tier === 'pro';

  const say = (msg, type = 'info') => setMessages((p) => [...p.slice(-30), { msg, type, time: new Date().toLocaleTimeString() }]);
  const profileName = (id) => profiles.find((p) => p.id === id)?.name || id;

  const reload = useCallback(async () => {
    if (!isPro) return;
    const [a, m, d, b, l] = await Promise.all([
      window.api.adsListAccounts(), window.api.adsListMetrics(range, level), window.api.adsDailySummary(30),
      window.api.adsListBusinesses(), window.api.adsLog(50),
    ]);
    if (Array.isArray(a)) setAccounts(a);
    if (Array.isArray(m)) setMetrics(m);
    if (Array.isArray(d)) setDaily(d);
    if (Array.isArray(b)) setBusinesses(b);
    if (Array.isArray(l)) setLogRows(l);
  }, [isPro, range, level]);

  useEffect(() => { window.api.listProfiles().then((p) => setProfiles(p || [])); }, []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (isPro) window.api.adsGetSettings().then((s) => { if (s && !s.error) setSettings(s); }); }, [isPro]);
  useEffect(() => {
    if (!window.api.onAdsEvent) return undefined;
    return window.api.onAdsEvent((ev) => {
      if (ev.type === 'profile-start') setProgress({ ...ev, text: `Leyendo ${profileName(ev.profileId)} (${ev.done + 1}/${ev.total})...` });
      if (ev.type === 'profile-done') {
        const r = ev.result || {};
        say(`${profileName(ev.profileId)}: ${r.ok ? 'listo' : r.error}`, r.ok ? 'success' : 'error');
        (r.warnings || []).forEach((w) => say(`  aviso: ${w}`, 'warn'));
        reload();
      }
    });
  });

  const run = async (task, fn, label) => {
    if (busy) return;
    setBusy({ task }); say(`${label}...`);
    try {
      const res = await fn();
      if (res?.error) say(res.error === 'PRO_REQUIRED' ? 'Esta función requiere el plan Pro.' : res.error, 'error');
      else if (Array.isArray(res)) {
        const ok = res.filter((r) => r.ok).length; const bad = res.filter((r) => !r.ok);
        say(`${label}: ${ok} perfil(es) OK${bad.length ? `, ${bad.length} con problema` : ''}`, bad.length ? 'warn' : 'success');
      }
    } catch (e) { say(`Error: ${e.message}`, 'error'); }
    setBusy(null); setProgress(null); reload();
  };

  const refreshAccounts = (ids) => run('accounts', () => window.api.adsRefreshAccounts(ids), 'Actualizando cuentas de anuncios');
  const refreshMetrics = (ids) => run('metrics', () => window.api.adsRefreshMetrics(ids, [range]), `Leyendo métricas (${RANGES.find((r) => r[0] === range)[1]})`);
  const refreshBm = (ids) => run('bm', () => window.api.adsRefreshBusinesses(ids), 'Leyendo Business Manager');
  const exportCsv = async (kind) => {
    const r = await window.api.adsExportCsv(kind, { rangeKey: range, level, days: 30 });
    if (r?.error) say(r.error, 'error'); else if (r?.path) say(`CSV guardado: ${r.path} (${r.rows} filas)`, 'success');
  };
  const saveConcurrency = async (v) => { const s = await window.api.adsSetSettings({ concurrency: Number(v) }); if (s && !s.error) setSettings(s); };

  const accountsByProfile = useMemo(() => {
    const g = {};
    for (const a of accounts) (g[a.profile_id] = g[a.profile_id] || []).push(a);
    return g;
  }, [accounts]);

  const totals = useMemo(() => {
    const t = {};
    for (const m of metrics.filter((x) => x.level === 'account')) {
      const k = m.currency || '—';
      t[k] = t[k] || { spend: 0, results: 0, revenue: 0 };
      t[k].spend += m.spend || 0; t[k].results += m.results || 0; t[k].revenue += m.revenue || 0;
    }
    return t;
  }, [metrics]);

  // ── Gate Pro ──
  if (!isPro) {
    return (
      <div className="p-8"><div className={`${CARD} p-12 text-center max-w-xl mx-auto`}>
        <h2 className="text-xl font-bold text-trust-dark mb-2">Anuncios</h2>
        <p className="text-trust-muted text-sm mb-4">Administra tus cuentas de anuncios, métricas y Business Managers desde tus perfiles. Disponible en el plan Pro.</p>
        <button className={BTN_PRIMARY} onClick={onUpgrade}>Actualizar a Pro</button>
      </div></div>
    );
  }

  const askAssign = async (req) => {
    const r = await window.api.adsAssignPrepare(req);
    if (r?.error) { say(r.error, 'error'); return; }
    setConfirm({ ...r, req });
  };
  const doAssign = async () => {
    const token = confirm.token; setConfirm(null);
    await run('assign', async () => {
      const r = await window.api.adsAssignExecute(token);
      if (r?.ok) say(`Acceso asignado${r.verified ? ' y verificado' : ' (no se pudo verificar en pantalla; revísalo en Facebook)'}.`, r.verified ? 'success' : 'warn');
      else say(r?.error || 'No se pudo asignar', 'error');
      return null;
    }, 'Asignando acceso');
  };

  const tabs = [['accounts', 'Cuentas'], ['metrics', 'Métricas'], ['bm', 'Business Manager'], ['log', 'Registro']];

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-trust-dark">Anuncios</h2>
          <p className="text-trust-muted text-xs mt-1">Lee Ads Manager y Business Manager desde cada perfil. Solo lectura; los cambios de acceso piden confirmación.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-trust-muted">Perfiles a la vez</label>
          <select className={SELECT} value={settings.concurrency} onChange={(e) => saveConcurrency(e.target.value)}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {busy && <button className={BTN_SOFT} onClick={() => window.api.adsCancel()}>Cancelar</button>}
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-trust-border">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px ${tab === k ? 'border-trust-accent text-trust-accent' : 'border-transparent text-trust-muted hover:text-trust-dark'}`}>{l}</button>
        ))}
      </div>

      {busy && progress && <div className="mb-3 text-xs text-trust-accent bg-trust-accent/5 border border-trust-accent/20 rounded-lg px-3 py-2">{progress.text}</div>}

      {tab === 'accounts' && (
        <div>
          <div className="flex gap-2 mb-3">
            <button className={BTN_PRIMARY} disabled={!!busy || !profiles.length} onClick={() => refreshAccounts(null)}>Actualizar todos</button>
            <button className={BTN_SOFT} onClick={() => exportCsv('accounts')}>Exportar CSV</button>
          </div>
          {profiles.length === 0 && <div className={`${CARD} p-8 text-center text-trust-muted text-sm`}>Sin perfiles. Crea uno en Perfiles.</div>}
          {profiles.map((p) => (
            <div key={p.id} className={`${CARD} mb-3 overflow-hidden`}>
              <div className="flex items-center justify-between px-4 py-2.5 bg-trust-surface border-b border-trust-border">
                <div className="text-sm font-medium text-trust-dark">{p.name} <span className="text-[10px] text-trust-muted">{p.fb_user}</span></div>
                <button className={BTN_SOFT} disabled={!!busy} onClick={() => refreshAccounts([p.id])}>Actualizar</button>
              </div>
              {(accountsByProfile[p.id] || []).length === 0 ? (
                <div className="px-4 py-3 text-xs text-trust-muted">Sin cuentas leídas todavía.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="text-trust-muted text-left">
                    {['Cuenta', 'Estado', 'Gastado', 'Límite', 'Pago', 'Business Manager', 'Lectura'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-trust-border">
                    {accountsByProfile[p.id].map((a) => (
                      <tr key={a.account_id}>
                        <td className="px-4 py-2"><div className="text-trust-dark font-medium">{a.name || '(sin nombre)'}</div><div className="text-[10px] text-trust-muted">{a.account_id}</div></td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] ${STATUS_STYLE[a.status] || STATUS_STYLE.unknown}`} title={a.disable_reason || ''}>{a.status_label}</span>
                        </td>
                        <td className="px-4 py-2">{money(a.amount_spent, a.currency)}</td>
                        <td className="px-4 py-2">{a.spend_cap ? money(a.spend_cap, a.currency) : '—'}</td>
                        <td className="px-4 py-2">{a.payment_method || <span className="text-trust-muted">no visible</span>}</td>
                        <td className="px-4 py-2">{a.business_name || a.business_id || '—'}</td>
                        <td className="px-4 py-2 text-trust-muted">{when(a.last_read_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'metrics' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select className={SELECT} value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select className={SELECT} value={level} onChange={(e) => setLevel(e.target.value)}><option value="campaign">Por campaña</option><option value="account">Por cuenta</option></select>
            <button className={BTN_PRIMARY} disabled={!!busy} onClick={() => refreshMetrics(null)}>Leer todos</button>
            <button className={BTN_SOFT} onClick={() => exportCsv('metrics')}>Exportar métricas CSV</button>
            <button className={BTN_SOFT} onClick={() => exportCsv('daily')}>Exportar resumen diario CSV</button>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {Object.entries(totals).map(([cur, t]) => (
              <span key={cur} className="text-xs px-3 py-1.5 rounded-full bg-trust-accent/5 border border-trust-accent/20 text-trust-dark">
                {cur}: gasto {money(t.spend)} · resultados {num(t.results, 0)} · CPA {t.results > 0 ? money(t.spend / t.results) : '—'} · ROAS {t.revenue > 0 && t.spend > 0 ? num(t.revenue / t.spend) : '—'}
              </span>
            ))}
          </div>
          <div className={`${CARD} overflow-hidden mb-5`}>
            {metrics.length === 0 ? <div className="p-6 text-xs text-trust-muted text-center">Sin datos para este rango. Pulsa "Leer todos" (primero actualiza las cuentas).</div> : (
              <table className="w-full text-xs">
                <thead><tr className="bg-trust-surface text-trust-muted text-left">
                  {['Perfil', 'Cuenta', 'Nombre', 'Gasto', 'Resultados', 'CPA', 'ROAS', 'Leído'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-trust-border">
                  {metrics.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2">{m.profile_name}</td><td className="px-3 py-2 text-trust-muted">{m.account_id}</td>
                      <td className="px-3 py-2 text-trust-dark">{m.entity_name || m.entity_id}{!m.range_verified && <span className="ml-1 text-trust-yellow" title="No se pudo confirmar que el rango leído sea el pedido">⚠</span>}</td>
                      <td className="px-3 py-2">{money(m.spend, m.currency)}</td><td className="px-3 py-2">{num(m.results, 0)}</td>
                      <td className="px-3 py-2">{m.cpa === null ? '—' : money(m.cpa)}</td><td className="px-3 py-2">{num(m.roas)}</td>
                      <td className="px-3 py-2 text-trust-muted">{when(m.read_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <h3 className="text-sm font-semibold text-trust-dark mb-2">Resumen diario (acumulado de lecturas de "Hoy" y "Ayer")</h3>
          <div className={`${CARD} overflow-hidden`}>
            {daily.length === 0 ? <div className="p-6 text-xs text-trust-muted text-center">Aún no hay días guardados.</div> : (
              <table className="w-full text-xs">
                <thead><tr className="bg-trust-surface text-trust-muted text-left">{['Fecha', 'Perfil', 'Cuenta', 'Gasto', 'Resultados', 'CPA', 'ROAS'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-trust-border">
                  {daily.map((d) => (
                    <tr key={`${d.profile_id}-${d.account_id}-${d.date}`}>
                      <td className="px-3 py-2">{d.date}</td><td className="px-3 py-2">{d.profile_name}</td><td className="px-3 py-2 text-trust-muted">{d.account_id}</td>
                      <td className="px-3 py-2">{money(d.spend, d.currency)}</td><td className="px-3 py-2">{num(d.results, 0)}</td>
                      <td className="px-3 py-2">{d.cpa === null ? '—' : money(d.cpa)}</td><td className="px-3 py-2">{num(d.roas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'bm' && (
        <BmTab profiles={profiles} businesses={businesses} busy={!!busy} onRefresh={refreshBm} onAssign={askAssign} />
      )}

      {tab === 'log' && (
        <div className={`${CARD} overflow-hidden`}>
          {logRows.length === 0 ? <div className="p-6 text-xs text-trust-muted text-center">Sin acciones de escritura registradas.</div> : (
            <table className="w-full text-xs">
              <thead><tr className="bg-trust-surface text-trust-muted text-left">{['Fecha', 'Perfil', 'Acción', 'Detalle', 'Resultado'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-trust-border">
                {logRows.map((r) => (
                  <tr key={r.id}><td className="px-3 py-2">{when(r.created_at)}</td><td className="px-3 py-2">{r.profile_name}</td><td className="px-3 py-2">{r.action_type}</td>
                    <td className="px-3 py-2 text-trust-muted">{r.target}</td><td className="px-3 py-2">{r.count > 0 ? 'OK' : 'Fallido'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-4 bg-trust-dark rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-[11px]">
          {messages.map((m, i) => (
            <div key={i} className={m.type === 'error' ? 'text-red-400' : m.type === 'success' ? 'text-green-400' : m.type === 'warn' ? 'text-yellow-300' : 'text-white/60'}>[{m.time}] {m.msg}</div>
          ))}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md shadow-trust-lg">
            <h3 className="text-trust-dark font-bold mb-2">Confirmar cambio en Facebook</h3>
            <p className="text-sm text-trust-dark mb-3">{confirm.summary}</p>
            <p className="text-[11px] text-trust-muted mb-4">Solo se administran accesos: esta acción no crea anuncios ni gasta dinero. Quedará registrada en el Registro.</p>
            <div className="flex justify-end gap-2">
              <button className={BTN_SOFT} onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={BTN_PRIMARY} onClick={doAssign}>Sí, asignar acceso</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BmTab({ profiles, businesses, busy, onRefresh, onAssign }) {
  const [form, setForm] = useState(null); // { profileId, businessId, kind, item }
  const [person, setPerson] = useState('');
  const [access, setAccess] = useState('view');

  const peopleOf = (b) => b.items.filter((i) => i.kind === 'person');
  const otherProfiles = form ? profiles.filter((p) => p.id !== form.profileId) : [];

  const submit = () => {
    if (!form || !person.trim()) return;
    onAssign({ profileId: form.profileId, businessId: form.businessId, kind: form.kind, assetId: form.item.item_id, assetName: form.item.name, personName: person.trim(), access });
    setForm(null); setPerson('');
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button className={BTN_PRIMARY} disabled={busy || !profiles.length} onClick={() => onRefresh(null)}>Leer todos</button>
      </div>
      {businesses.length === 0 && <div className={`${CARD} p-8 text-center text-trust-muted text-sm`}>Sin Business Managers leídos. Pulsa "Leer todos" o lee un perfil concreto.</div>}
      <div className="mb-3 flex flex-wrap gap-2">
        {profiles.map((p) => <button key={p.id} className={BTN_SOFT} disabled={busy} onClick={() => onRefresh([p.id])}>Leer {p.name}</button>)}
      </div>
      {businesses.map((b) => (
        <div key={`${b.profile_id}-${b.business_id}`} className={`${CARD} mb-3 overflow-hidden`}>
          <div className="px-4 py-2.5 bg-trust-surface border-b border-trust-border text-sm font-medium text-trust-dark">
            {b.name || 'Business Manager'} <span className="text-[10px] text-trust-muted">ID {b.business_id} · perfil {b.profile_name} · {when(b.last_read_at)}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 p-4">
            {['ad_account', 'page', 'person'].map((kind) => (
              <div key={kind}>
                <div className="text-xs font-semibold text-trust-dark mb-1">{KIND_LABEL[kind]} ({b.items.filter((i) => i.kind === kind).length})</div>
                <ul className="space-y-1">
                  {b.items.filter((i) => i.kind === kind).map((i) => (
                    <li key={i.item_id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate" title={i.item_id}>{i.name || i.item_id}{i.extra?.role ? <span className="text-trust-muted"> · {i.extra.role}</span> : null}</span>
                      {kind !== 'person' && (
                        <button className="text-trust-accent hover:underline shrink-0" disabled={busy}
                          onClick={() => { setForm({ profileId: b.profile_id, businessId: b.business_id, kind, item: i, people: peopleOf(b) }); setPerson(''); }}>Asignar</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      {form && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-white rounded-xl p-6 w-96 shadow-trust-lg">
            <h3 className="text-trust-dark font-bold mb-1">Asignar {form.kind === 'page' ? 'página' : 'cuenta de anuncios'}</h3>
            <p className="text-xs text-trust-muted mb-3">{form.item.name || form.item.item_id}</p>
            <label className="block text-xs text-trust-muted mb-1">Persona del Business Manager (nombre o correo)</label>
            <input className={`${SELECT} w-full mb-2`} list="ads-people" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Nombre o correo" />
            <datalist id="ads-people">
              {form.people.map((p) => <option key={p.item_id} value={p.name || p.item_id} />)}
              {otherProfiles.map((p) => <option key={p.id} value={p.fb_email || p.fb_user || p.name} label={`Perfil ${p.name}`} />)}
            </datalist>
            <p className="text-[10px] text-trust-muted mb-3">La persona debe existir ya en el Business Manager (pestaña Personas). No se envían invitaciones.</p>
            <label className="block text-xs text-trust-muted mb-1">Nivel de acceso</label>
            <select className={`${SELECT} w-full mb-4`} value={access} onChange={(e) => setAccess(e.target.value)}>
              <option value="view">Solo ver rendimiento</option><option value="manage">Administrar</option>
            </select>
            <div className="flex justify-end gap-2">
              <button className={BTN_SOFT} onClick={() => setForm(null)}>Cancelar</button>
              <button className={BTN_PRIMARY} disabled={!person.trim()} onClick={submit}>Continuar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
