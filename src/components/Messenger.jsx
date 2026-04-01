import React, { useState, useEffect, useRef } from 'react';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-blue-500';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

export default function Messenger({ tier, onUpgrade }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [mode, setMode] = useState('single'); // single | mass
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState('');
  const [templates, setTemplates] = useState('');
  const [minDelay, setMinDelay] = useState('30');
  const [maxDelay, setMaxDelay] = useState('120');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [logs, setLogs] = useState([]);
  const logsEnd = useRef(null);

  useEffect(() => { window.api.listProfiles().then(p => setProfiles(p || [])); }, []);
  useEffect(() => { logsEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  const sendSingle = async () => {
    if (!recipient || !message || selectedProfiles.length === 0) return;
    setRunning(true);
    setLogs([]);
    for (const pid of selectedProfiles) {
      setLogs(prev => [...prev, { msg: `Enviando a ${recipient} desde perfil...`, type: 'info' }]);
      try {
        await window.api.fbSendDM(pid, recipient, message);
        setLogs(prev => [...prev, { msg: `Enviado a ${recipient}`, type: 'success' }]);
      } catch (err) {
        setLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
      }
    }
    setRunning(false);
  };

  const sendMass = async () => {
    if (!recipients.trim() || !templates.trim() || selectedProfiles.length === 0) return;
    setRunning(true);
    setLogs([]);
    const recipientList = recipients.split('\n').filter(r => r.trim());
    const templateList = templates.split('\n').filter(t => t.trim());

    setLogs(prev => [...prev, { msg: `Enviando a ${recipientList.length} destinatarios con ${templateList.length} templates`, type: 'info' }]);

    for (const pid of selectedProfiles) {
      try {
        const res = await window.api.fbMassDM(pid, recipientList, templateList, {
          minDelay: parseInt(minDelay) * 1000,
          maxDelay: parseInt(maxDelay) * 1000,
        });
        if (Array.isArray(res)) {
          res.forEach(r => {
            setLogs(prev => [...prev, { msg: `${r.status === 'sent' ? '✓' : '✗'} ${r.recipient}`, type: r.status === 'sent' ? 'success' : 'error' }]);
          });
          setResults(prev => [...prev, ...res]);
        }
      } catch (err) {
        setLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
      }
    }
    setRunning(false);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-trust-dark flex items-center gap-2">💬 Messenger</h2>
          <p className="text-xs text-trust-muted mt-1">Envia DMs individuales o masivos por Facebook Messenger</p>
        </div>
        <div className="flex gap-1 bg-trust-surface rounded-lg p-0.5">
          <button onClick={() => setMode('single')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === 'single' ? 'bg-blue-600 text-white' : 'text-trust-muted'}`}>Individual</button>
          <button onClick={() => setMode('mass')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${mode === 'mass' ? 'bg-blue-600 text-white' : 'text-trust-muted'}`}>Masivo</button>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Profiles */}
        <div className="w-48 flex-shrink-0 bg-white rounded-xl border border-trust-border p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold text-trust-dark mb-2">Perfiles</h3>
          <button onClick={() => setSelectedProfiles(profiles.map(p => p.id))} className="text-[10px] text-blue-600 hover:underline mb-2">Todos</button>
          {profiles.map(p => (
            <button key={p.id} onClick={() => setSelectedProfiles(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs mb-0.5 ${selectedProfiles.includes(p.id) ? 'bg-blue-500/10 text-blue-600 font-medium' : 'text-trust-muted hover:bg-trust-surface'}`}>
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex-1 flex flex-col gap-4">
          {/* Form */}
          <div className="bg-white rounded-xl border border-trust-border p-4">
            {mode === 'single' ? (
              <div className="space-y-3">
                <div><label className={LABEL_CLASS}>Destinatario (nombre o perfil)</label><input type="text" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Juan Perez" className={INPUT_CLASS} /></div>
                <div><label className={LABEL_CLASS}>Mensaje</label><textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Hola! Te escribo porque..." className={INPUT_CLASS + ' resize-none'} /></div>
                <button onClick={sendSingle} disabled={running || !recipient || !message} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">{running ? 'Enviando...' : 'Enviar'}</button>
              </div>
            ) : (
              <div className="space-y-3">
                <div><label className={LABEL_CLASS}>Destinatarios (uno por linea)</label><textarea value={recipients} onChange={e => setRecipients(e.target.value)} rows={4} placeholder={"Juan Perez\nMaria Garcia\nhttps://facebook.com/usuario"} className={INPUT_CLASS + ' resize-none font-mono text-xs'} /></div>
                <div><label className={LABEL_CLASS}>Templates de mensaje (uno por linea, usa {'{nombre}'} para personalizar)</label><textarea value={templates} onChange={e => setTemplates(e.target.value)} rows={3} placeholder={"Hola {nombre}! Vi tu perfil y...\nHola! Te contacto porque..."} className={INPUT_CLASS + ' resize-none'} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL_CLASS}>Delay minimo (seg)</label><input type="number" value={minDelay} onChange={e => setMinDelay(e.target.value)} className={INPUT_CLASS} /></div>
                  <div><label className={LABEL_CLASS}>Delay maximo (seg)</label><input type="number" value={maxDelay} onChange={e => setMaxDelay(e.target.value)} className={INPUT_CLASS} /></div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={sendMass} disabled={running || !recipients.trim() || !templates.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">{running ? 'Enviando...' : `Enviar a ${recipients.split('\n').filter(r => r.trim()).length} personas`}</button>
                  <span className="text-xs text-trust-muted">Delay: {minDelay}-{maxDelay}s entre cada DM</span>
                </div>
              </div>
            )}
          </div>

          {/* Logs */}
          <div className="flex-1 bg-trust-dark rounded-xl p-3 overflow-y-auto min-h-[120px]">
            <h3 className="text-xs font-semibold text-white/60 mb-2">Log</h3>
            {logs.length === 0 ? (
              <p className="text-[10px] text-white/20 text-center py-4">Los mensajes apareceran aqui</p>
            ) : (
              <div className="space-y-0.5">
                {logs.map((l, i) => (
                  <p key={i} className={`text-[11px] font-mono ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-green-400' : 'text-white/50'}`}>{l.msg}</p>
                ))}
                <div ref={logsEnd} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
