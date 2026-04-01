import React, { useState, useEffect } from 'react';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-3 py-2.5 text-trust-dark text-sm focus:outline-none focus:border-blue-500';
const LABEL_CLASS = 'block text-xs text-trust-muted font-medium mb-1.5';

export default function GroupManager({ tier }) {
  const [profiles, setProfiles] = useState([]);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [activeTab, setActiveTab] = useState('join');
  const [running, setRunning] = useState(false);
  const [groupUrls, setGroupUrls] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [maxMembers, setMaxMembers] = useState('100');
  const [scrapedMembers, setScrapedMembers] = useState([]);
  const [postText, setPostText] = useState('');
  const [postPhotos, setPostPhotos] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => { window.api.listProfiles().then(p => setProfiles(p || [])); }, []);

  const joinGroups = async () => {
    const urls = groupUrls.split('\n').filter(u => u.trim());
    if (urls.length === 0 || selectedProfiles.length === 0) return;
    setRunning(true);
    setLogs([]);
    for (const pid of selectedProfiles) {
      for (const url of urls) {
        try {
          await window.api.fbJoinGroup(pid, url.trim());
          setLogs(prev => [...prev, { msg: `Unido a ${url.trim().split('/').pop()}`, type: 'success' }]);
        } catch (err) {
          setLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
        }
      }
    }
    setRunning(false);
  };

  const scrapeMembers = async () => {
    if (!scrapeUrl || selectedProfiles.length === 0) return;
    setRunning(true);
    setLogs([{ msg: `Extrayendo miembros de ${scrapeUrl}...`, type: 'info' }]);
    try {
      const members = await window.api.fbScrapeGroup(selectedProfiles[0], scrapeUrl, parseInt(maxMembers));
      setScrapedMembers(Array.isArray(members) ? members : []);
      setLogs(prev => [...prev, { msg: `${(members || []).length} miembros extraidos`, type: 'success' }]);
    } catch (err) {
      setLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
    }
    setRunning(false);
  };

  const postToGroups = async () => {
    const urls = groupUrls.split('\n').filter(u => u.trim());
    if (urls.length === 0 || !postText || selectedProfiles.length === 0) return;
    setRunning(true);
    setLogs([]);
    const photos = postPhotos ? postPhotos.split(',').map(p => p.trim()).filter(Boolean) : [];
    for (const pid of selectedProfiles) {
      for (const url of urls) {
        try {
          await window.api.fbPostGroup(pid, url.trim(), { text: postText, photos });
          setLogs(prev => [...prev, { msg: `Publicado en ${url.trim().split('/').pop()}`, type: 'success' }]);
        } catch (err) {
          setLogs(prev => [...prev, { msg: `Error: ${err.message}`, type: 'error' }]);
        }
      }
    }
    setRunning(false);
  };

  const exportCSV = () => {
    if (scrapedMembers.length === 0) return;
    const csv = 'Nombre,Username,URL\n' + scrapedMembers.map(m => `"${m.name}","${m.username}","${m.href}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'group_members.csv'; a.click();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-trust-dark flex items-center gap-2">👥 Grupos</h2>
          <p className="text-xs text-trust-muted mt-1">Unirse, publicar y extraer miembros de grupos de Facebook</p>
        </div>
        <div className="flex gap-1 bg-trust-surface rounded-lg p-0.5">
          {['join', 'post', 'scrape'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${activeTab === t ? 'bg-blue-600 text-white' : 'text-trust-muted'}`}>
              {t === 'join' ? 'Unirse' : t === 'post' ? 'Publicar' : 'Extraer'}
            </button>
          ))}
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
          <div className="bg-white rounded-xl border border-trust-border p-4">
            {activeTab === 'join' && (
              <div className="space-y-3">
                <div><label className={LABEL_CLASS}>URLs de Grupos (uno por linea)</label><textarea value={groupUrls} onChange={e => setGroupUrls(e.target.value)} rows={5} placeholder={"https://facebook.com/groups/grupo1\nhttps://facebook.com/groups/grupo2"} className={INPUT_CLASS + ' resize-none font-mono text-xs'} /></div>
                <button onClick={joinGroups} disabled={running} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">{running ? 'Uniendose...' : `Unirse a ${groupUrls.split('\n').filter(u => u.trim()).length} grupos`}</button>
              </div>
            )}
            {activeTab === 'post' && (
              <div className="space-y-3">
                <div><label className={LABEL_CLASS}>URLs de Grupos (uno por linea)</label><textarea value={groupUrls} onChange={e => setGroupUrls(e.target.value)} rows={3} placeholder={"https://facebook.com/groups/grupo1"} className={INPUT_CLASS + ' resize-none font-mono text-xs'} /></div>
                <div><label className={LABEL_CLASS}>Texto del Post</label><textarea value={postText} onChange={e => setPostText(e.target.value)} rows={3} placeholder="Escribe tu publicacion..." className={INPUT_CLASS + ' resize-none'} /></div>
                <div><label className={LABEL_CLASS}>Fotos (rutas separadas por coma)</label><input type="text" value={postPhotos} onChange={e => setPostPhotos(e.target.value)} placeholder="/ruta/foto.jpg" className={INPUT_CLASS} /></div>
                <button onClick={postToGroups} disabled={running || !postText} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">{running ? 'Publicando...' : 'Publicar en Grupos'}</button>
              </div>
            )}
            {activeTab === 'scrape' && (
              <div className="space-y-3">
                <div><label className={LABEL_CLASS}>URL del Grupo</label><input type="text" value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)} placeholder="https://facebook.com/groups/migrupo" className={INPUT_CLASS} /></div>
                <div><label className={LABEL_CLASS}>Max Miembros</label><input type="number" value={maxMembers} onChange={e => setMaxMembers(e.target.value)} className={INPUT_CLASS + ' w-32'} /></div>
                <div className="flex gap-2">
                  <button onClick={scrapeMembers} disabled={running || !scrapeUrl} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">{running ? 'Extrayendo...' : 'Extraer Miembros'}</button>
                  {scrapedMembers.length > 0 && <button onClick={exportCSV} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">Exportar CSV ({scrapedMembers.length})</button>}
                </div>
                {scrapedMembers.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-0.5 mt-2">
                    {scrapedMembers.slice(0, 50).map((m, i) => (
                      <div key={i} className="flex justify-between px-3 py-1.5 bg-trust-surface rounded text-xs">
                        <span className="text-trust-dark">{m.name}</span>
                        <span className="text-trust-muted">{m.username}</span>
                      </div>
                    ))}
                    {scrapedMembers.length > 50 && <p className="text-[10px] text-trust-muted text-center">...y {scrapedMembers.length - 50} mas</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Logs */}
          <div className="flex-1 bg-trust-dark rounded-xl p-3 overflow-y-auto min-h-[100px]">
            <h3 className="text-xs font-semibold text-white/60 mb-2">Log</h3>
            {logs.map((l, i) => <p key={i} className={`text-[11px] font-mono ${l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-green-400' : 'text-white/50'}`}>{l.msg}</p>)}
          </div>
        </div>
      </div>
    </div>
  );
}
