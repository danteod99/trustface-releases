import React, { useState } from 'react';

const TIMEZONES = [
  'America/Lima',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Bogota',
  'America/Mexico_City',
  'America/Buenos_Aires',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
];

const FB_ICON = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-trust-accent focus:ring-1 focus:ring-trust-accent/20';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

export default function ProfileForm({ profile, onSave, onBulkSave, onCancel }) {
  const isEditing = !!profile;

  const [form, setForm] = useState({
    name: profile?.name || '',
    fb_user: profile?.fb_user || '',
    fb_pass: profile?.fb_pass || '',
    fb_2fa_secret: profile?.fb_2fa_secret || '',
    fb_email: profile?.fb_email || '',
    fb_email_pass: profile?.fb_email_pass || '',
    proxy_type: profile?.proxy_type || 'http',
    proxy_host: profile?.proxy_host || '',
    proxy_port: profile?.proxy_port || '',
    proxy_user: profile?.proxy_user || '',
    proxy_pass: profile?.proxy_pass || '',
    user_agent: profile?.user_agent || '',
    timezone: profile?.timezone || 'America/Lima',
    notes: profile?.notes || '',
  });

  const [bulkText, setBulkText] = useState('');
  const [bulkParsed, setBulkParsed] = useState([]);
  const [bulkTimezone, setBulkTimezone] = useState('America/Lima');
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return alert('El nombre es requerido');
    onSave(form);
  };

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isPhone = (v) => /^\+?\d[\d\s\-()]{6,}$/.test(v);
  const isTOTP = (v) => {
    const clean = v.replace(/\s/g, '');
    return /^[A-Z2-7]{16,}$/i.test(clean);
  };

  // Legacy stub - not used anymore but kept for compat
  const detectFieldType = (value) => {
    if (!value) return 'unknown';
    const v = value.trim();
    // Email: contains @ and a dot after @
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'email';
    // Phone: starts with + or is mostly digits with optional dashes/spaces
    if (/^\+?\d[\d\s\-()]{6,}$/.test(v)) return 'phone';
    // 2FA/TOTP: base32 (uppercase letters + 2-7, usually 16-32 chars)
    if (/^[A-Z2-7]{16,}$/i.test(v)) return 'twofa';
    return 'text'; // could be user or pass
  };

  const parseBulk = () => {
    const lines = bulkText.split('\n').filter((l) => l.trim());
    const accounts = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Pick the best separator
      let parts;
      if (trimmed.includes('|')) parts = trimmed.split('|');
      else if (trimmed.includes(';')) parts = trimmed.split(';');
      else if (trimmed.includes('\t')) parts = trimmed.split('\t');
      else if (trimmed.includes(':')) parts = trimmed.split(':');
      else if (trimmed.includes(',')) parts = trimmed.split(',');
      else continue;
      parts = parts.map(p => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;

      // Simple and reliable: first part = user (login), second = password
      // Then detect emails/totp from remaining parts
      const account = { user: '', pass: '', twofa: '', email: '', emailPass: '' };

      // Always: part[0] = user, part[1] = password (regardless of what they look like)
      account.user = parts[0].replace(/^@/, '');
      account.pass = parts[1];

      // Remaining parts: detect by type
      for (let i = 2; i < parts.length; i++) {
        const p = parts[i];
        if (isTOTP(p) && !account.twofa) account.twofa = p.replace(/\s/g, '');
        else if (isEmail(p) && !account.email) account.email = p;
        else if (!account.emailPass) account.emailPass = p;
      }

      // If user itself is an email, also set it as the account email
      if (isEmail(account.user) && !account.email) account.email = account.user;

      if (account.user && account.pass) accounts.push(account);
    }
    setBulkParsed(accounts);
  };

  const handleBulkImport = async () => {
    if (bulkParsed.length === 0) return;
    setBulkLoading(true);
    await onBulkSave(bulkParsed, bulkTimezone);
    setBulkLoading(false);
  };

  const removeParsed = (index) => {
    setBulkParsed((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Edit mode ────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white border border-trust-border rounded-2xl w-full max-w-lg p-6 shadow-trust-lg max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-trust-dark mb-4">Editar Perfil</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={LABEL_CLASS}>Nombre del perfil</label>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Ej: Cuenta FB Principal" className={INPUT_CLASS} />
            </div>

            <div className="border border-trust-accent/20 rounded-xl p-4 bg-trust-accent/[0.03]">
              <h4 className="text-sm font-semibold text-trust-accent mb-3 flex items-center gap-2">
                {FB_ICON} Cuenta de Facebook
              </h4>
              <div>
                <label className={LABEL_CLASS}>Usuario / Password <span className="text-trust-muted/50">(separado por /)</span></label>
                <input
                  type="text"
                  value={form.fb_user && form.fb_pass ? `${form.fb_user}/${form.fb_pass}` : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const seps = ['/', ',', ':', '|'];
                    for (const sep of seps) {
                      const idx = val.indexOf(sep);
                      if (idx > 0) {
                        update('fb_user', val.substring(0, idx).trim().replace(/^@/, ''));
                        update('fb_pass', val.substring(idx + 1).trim());
                        return;
                      }
                    }
                    update('fb_user', val.replace(/^@/, ''));
                    update('fb_pass', '');
                  }}
                  placeholder="usuario/password"
                  className={INPUT_CLASS + ' font-mono'}
                />
              </div>
              <div className="mt-3">
                <label className={LABEL_CLASS}>2FA Secret (TOTP)</label>
                <input type="text" value={form.fb_2fa_secret || ''} onChange={(e) => update('fb_2fa_secret', e.target.value)} placeholder="5ZKSD3LECYNXTCMZ4EZA4GDC62FZ7SZY" className={INPUT_CLASS + ' font-mono'} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={LABEL_CLASS}>Email de la cuenta</label>
                  <input type="text" value={form.fb_email || ''} onChange={(e) => update('fb_email', e.target.value)} placeholder="user@email.com" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Password del email</label>
                  <input type="password" value={form.fb_email_pass || ''} onChange={(e) => update('fb_email_pass', e.target.value)} placeholder="***" className={INPUT_CLASS} />
                </div>
              </div>
            </div>

            <div className="border border-trust-border rounded-xl p-4">
              <h4 className="text-sm font-semibold text-trust-muted mb-3">Configuracion de Proxy</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL_CLASS}>Tipo</label>
                  <select value={form.proxy_type} onChange={(e) => update('proxy_type', e.target.value)} className={INPUT_CLASS}>
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLASS}>Host / IP</label>
                  <input type="text" value={form.proxy_host} onChange={(e) => update('proxy_host', e.target.value)} placeholder="123.45.67.89" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Puerto</label>
                  <input type="text" value={form.proxy_port} onChange={(e) => update('proxy_port', e.target.value)} placeholder="8080" className={INPUT_CLASS} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={LABEL_CLASS}>Usuario (opcional)</label>
                  <input type="text" value={form.proxy_user} onChange={(e) => update('proxy_user', e.target.value)} placeholder="user123" className={INPUT_CLASS} />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Password (opcional)</label>
                  <input type="password" value={form.proxy_pass} onChange={(e) => update('proxy_pass', e.target.value)} placeholder="***" className={INPUT_CLASS} />
                </div>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Zona horaria</label>
              <select value={form.timezone} onChange={(e) => update('timezone', e.target.value)} className={INPUT_CLASS}>
                {TIMEZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>Notas</label>
              <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Ej: Cuenta de Facebook para likes" rows={2} className={INPUT_CLASS + ' resize-none'} />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex-1 px-4 py-2.5 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors">
                Guardar Cambios
              </button>
              <button type="button" onClick={onCancel} className="px-4 py-2.5 bg-gray-100 text-trust-muted rounded-lg text-sm hover:text-trust-dark transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─── Bulk import mode ─────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border border-trust-border rounded-2xl w-full max-w-2xl p-6 shadow-trust-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-trust-dark mb-1">Agregar Cuentas de Facebook</h3>
        <p className="text-trust-muted text-sm mb-5">
          Cada cuenta crea un navegador independiente con sesion aislada
        </p>

        <div className="border border-trust-accent/20 rounded-xl p-4 bg-trust-accent/[0.03] mb-4">
          <h4 className="text-sm font-semibold text-trust-accent mb-2 flex items-center gap-2">
            {FB_ICON} Pega tus cuentas (una por linea)
          </h4>
          <p className="text-xs text-trust-muted mb-2">
            Formato completo: <code className="bg-trust-accent/10 text-trust-accent px-1.5 py-0.5 rounded font-medium">usuario|password|2FA_secret|email|email_pass</code>
          </p>
          <p className="text-xs text-trust-muted mb-3">
            Formato simple: <code className="bg-gray-100 px-1.5 py-0.5 rounded">usuario/password</code> o <code className="bg-gray-100 px-1.5 py-0.5 rounded">usuario,password</code>
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={`DannyCollins|Lol48ngdp@7AC|5ZKSD3LECYNXTCMZ|danny@outlook.com|pass123\nusuario2|mipass456|ABC123SECRET|email2@gmail.com|emailpass\ncuenta_simple/password123`}
            rows={8}
            className={INPUT_CLASS + ' font-mono resize-none'}
          />
          <div className="flex items-center gap-3 mt-3">
            <button onClick={parseBulk} className="px-4 py-2 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors">
              Detectar Cuentas
            </button>
            <span className="text-xs text-trust-muted">
              {bulkText.split('\n').filter((l) => l.trim()).length} linea(s)
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className={LABEL_CLASS}>Zona horaria (para todas)</label>
          <select value={bulkTimezone} onChange={(e) => setBulkTimezone(e.target.value)} className={INPUT_CLASS}>
            {TIMEZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
          </select>
        </div>

        {bulkParsed.length > 0 && (
          <div className="border border-trust-border rounded-xl overflow-hidden mb-4 shadow-trust">
            <div className="px-4 py-2.5 bg-trust-surface border-b border-trust-border flex items-center justify-between">
              <span className="text-sm font-semibold text-trust-green">
                {bulkParsed.length} cuenta{bulkParsed.length !== 1 ? 's' : ''} detectada{bulkParsed.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-trust-muted">
                = {bulkParsed.length} navegador{bulkParsed.length !== 1 ? 'es' : ''}
              </span>
            </div>
            <div className="max-h-60 overflow-y-auto divide-y divide-trust-border">
              {bulkParsed.map((acc, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-trust-surface transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-trust-muted w-6 text-right font-medium shrink-0">{i + 1}.</span>
                    <span className="text-sm text-trust-accent font-medium shrink-0">@{acc.user}</span>
                    <span className="text-xs text-trust-muted font-mono shrink-0">{'*'.repeat(Math.min(acc.pass.length, 6))}</span>
                    {acc.twofa && <span className="text-[10px] px-1.5 py-0.5 rounded bg-trust-green/10 text-trust-green font-medium shrink-0">2FA</span>}
                    {acc.email && <span className="text-[10px] text-trust-muted truncate max-w-[120px]">{acc.email}</span>}
                  </div>
                  <button onClick={() => removeParsed(i)} className="text-trust-muted hover:text-trust-red transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {bulkParsed.length > 0 && (
            <button
              onClick={handleBulkImport}
              disabled={bulkLoading}
              className="flex-1 px-4 py-2.5 bg-trust-green text-white rounded-lg text-sm font-medium hover:bg-trust-green/90 transition-colors disabled:opacity-50"
            >
              {bulkLoading ? `Creando ${bulkParsed.length} perfiles...` : `Crear ${bulkParsed.length} Perfil${bulkParsed.length !== 1 ? 'es' : ''}`}
            </button>
          )}
          <button onClick={onCancel} className="px-4 py-2.5 bg-gray-100 text-trust-muted rounded-lg text-sm hover:text-trust-dark transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
