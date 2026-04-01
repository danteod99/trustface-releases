import React, { useState } from 'react';

const INPUT_CLASS = 'w-full bg-trust-surface border border-trust-border rounded-lg px-4 py-3 text-trust-dark text-sm font-mono focus:outline-none focus:border-trust-accent focus:ring-1 focus:ring-trust-accent/20 resize-none';

export default function ProxyImport() {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState([]);
  const [testing, setTesting] = useState({});

  const handleParse = async () => {
    if (!text.trim()) return;
    const result = await window.api.importProxies(text);
    setParsed(result);
  };

  const handleTest = async (index) => {
    const proxy = parsed[index];
    setTesting((prev) => ({ ...prev, [index]: 'testing' }));
    const result = await window.api.testProxy(proxy);
    setTesting((prev) => ({
      ...prev,
      [index]: result.success ? 'ok' : 'fail',
    }));
  };

  const handleTestAll = async () => {
    for (let i = 0; i < parsed.length; i++) {
      await handleTest(i);
    }
  };

  const copyProxy = (proxy) => {
    const str = proxy.user
      ? `${proxy.host}:${proxy.port}:${proxy.user}:${proxy.pass}`
      : `${proxy.host}:${proxy.port}`;
    navigator.clipboard.writeText(str);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-trust-dark mb-2">Importar Proxies</h2>
      <p className="text-trust-muted text-sm mb-6">
        Pega tus proxies en cualquier formato: host:port, host:port:user:pass, o protocol://user:pass@host:port
      </p>

      <div className="bg-white border border-trust-border rounded-xl p-5 mb-6 shadow-trust">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Pega tus proxies aqui, uno por linea:\n\n123.45.67.89:8080\n98.76.54.32:3128:user:pass\nsocks5://user:pass@11.22.33.44:1080`}
          rows={8}
          className={INPUT_CLASS}
        />
        <div className="flex gap-3 mt-3">
          <button onClick={handleParse} className="px-4 py-2 bg-trust-accent text-white rounded-lg text-sm font-medium hover:bg-trust-accent-hover transition-colors">
            Parsear Proxies
          </button>
          {parsed.length > 0 && (
            <button onClick={handleTestAll} className="px-4 py-2 bg-trust-yellow/10 text-trust-yellow border border-trust-yellow/30 rounded-lg text-sm font-medium hover:bg-trust-yellow/20 transition-colors">
              Probar Todos
            </button>
          )}
        </div>
      </div>

      {parsed.length > 0 && (
        <div className="bg-white border border-trust-border rounded-xl overflow-hidden shadow-trust">
          <div className="px-5 py-3 border-b border-trust-border bg-trust-surface">
            <h3 className="text-sm font-semibold text-trust-dark">
              {parsed.length} proxy{parsed.length !== 1 ? 's' : ''} detectado{parsed.length !== 1 ? 's' : ''}
            </h3>
          </div>
          <div className="divide-y divide-trust-border">
            {parsed.map((proxy, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-trust-surface transition-colors">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      testing[i] === 'ok'
                        ? 'bg-trust-green'
                        : testing[i] === 'fail'
                        ? 'bg-trust-red'
                        : testing[i] === 'testing'
                        ? 'bg-trust-yellow animate-pulse'
                        : 'bg-gray-200'
                    }`}
                  />
                  <span className="text-sm font-mono text-trust-dark">
                    <span className="text-trust-accent font-medium">{proxy.type}://</span>
                    {proxy.user && <span className="text-trust-muted">{proxy.user}:***@</span>}
                    {proxy.host}:{proxy.port}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {testing[i] === 'ok' && <span className="text-xs text-trust-green font-medium">Conectado</span>}
                  {testing[i] === 'fail' && <span className="text-xs text-trust-red font-medium">Error</span>}
                  <button onClick={() => handleTest(i)} className="px-3 py-1 bg-gray-50 border border-trust-border text-trust-muted rounded text-xs hover:text-trust-dark hover:bg-gray-100 transition-colors">
                    Test
                  </button>
                  <button onClick={() => copyProxy(proxy)} className="px-3 py-1 bg-gray-50 border border-trust-border text-trust-muted rounded text-xs hover:text-trust-dark hover:bg-gray-100 transition-colors">
                    Copiar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
