import React, { useState, useEffect, useRef } from 'react';

const plans = [
  { id: 'face-monthly', name: 'TrustFace Pro', price: 29, period: '/mes', savings: null, product: 'trustface', badge: 'Facebook' },
  { id: 'face-quarterly', name: 'TrustFace Pro', price: 69, period: '/3 meses', savings: 'Ahorra 21%', product: 'trustface', badge: 'Facebook' },
  { id: 'face-yearly', name: 'TrustFace Pro', price: 199, period: '/ano', savings: 'Ahorra 43%', product: 'trustface', badge: 'Facebook' },
  { id: 'bundle-monthly', name: 'Trust Bundle', price: 49, period: '/mes', savings: 'Insta + Face', product: 'bundle', badge: 'Todo incluido', highlight: true },
  { id: 'bundle-quarterly', name: 'Trust Bundle', price: 119, period: '/3 meses', savings: 'Ahorra 19%', product: 'bundle', badge: 'Todo incluido', highlight: true },
  { id: 'bundle-yearly', name: 'Trust Bundle', price: 349, period: '/ano', savings: 'Ahorra 41%', product: 'bundle', badge: 'Todo incluido', highlight: true },
];

const networks = [
  { id: 'erc20', name: 'Ethereum', token: 'USDT / USDC', icon: 'ETH' },
  { id: 'bsc', name: 'BSC', token: 'USDT / USDC', icon: 'BSC' },
  { id: 'trc20', name: 'Tron', token: 'USDT / USDC', icon: 'TRX' },
  { id: 'sol', name: 'Solana', token: 'USDT / USDC', icon: 'SOL' },
];

export default function PaymentModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [duration, setDuration] = useState('monthly');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [status, setStatus] = useState('waiting'); // waiting | confirming | confirmed | error
  const [countdown, setCountdown] = useState(1800); // 30 min
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const intervalRef = useRef(null);
  const pollRef = useRef(null);

  // Countdown timer
  useEffect(() => {
    if (step === 3 && countdown > 0 && status === 'waiting') {
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(intervalRef.current);
    }
  }, [step, status]);

  // Poll payment status
  useEffect(() => {
    if (step === 3 && paymentData?.paymentId && status === 'waiting') {
      pollRef.current = setInterval(async () => {
        try {
          const result = await window.api.checkPaymentStatus(paymentData.paymentId);
          if (result.status === 'confirming') {
            setStatus('confirming');
          } else if (result.status === 'confirmed' || result.status === 'finished') {
            setStatus('confirmed');
            clearInterval(pollRef.current);
            clearInterval(intervalRef.current);
            setShowConfetti(true);
            setTimeout(() => {
              onSuccess('pro');
            }, 3000);
          }
        } catch (err) {
          // silently retry
        }
      }, 15000);
      return () => clearInterval(pollRef.current);
    }
  }, [step, paymentData, status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(pollRef.current);
    };
  }, []);

  const handleCreateOrder = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await window.api.createPaymentOrder({
        duration: selectedPlan.id,
        network: selectedNetwork.id,
      });
      if (result.error) {
        setErrorMsg(result.error === 'No autenticado' ? 'Debes iniciar sesion primero.' :
          result.error.includes('API') ? 'Servicio de pagos no disponible. Intenta mas tarde.' :
          result.error);
      } else {
        setPaymentData(result);
        setStep(3);
      }
    } catch (err) {
      setErrorMsg('Error de conexion. Verifica tu internet.');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Confetti */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-${Math.random() * 20}%`,
                backgroundColor: ['#002bb2', '#22c55e', '#f59e0b', '#4d7cff', '#ef4444'][i % 5],
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${1 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-[#2a2830] rounded-2xl shadow-trust-lg border border-[#3a3840] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3840]">
          <h2 className="text-lg font-semibold text-white">
            {step === 1 && 'Selecciona tu plan'}
            {step === 2 && 'Selecciona la red'}
            {step === 3 && status === 'confirmed' && 'Pago confirmado'}
            {step === 3 && status !== 'confirmed' && 'Realiza el pago'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Step 1: Select Plan */}
          {step === 1 && (
            <div className="space-y-3">
              {/* Duration selector */}
              <div className="flex gap-2 mb-2">
                {['monthly', 'quarterly', 'yearly'].map((dur) => (
                  <button
                    key={dur}
                    onClick={() => setDuration(dur)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      duration === dur ? 'border-trust-accent bg-trust-accent/10 text-trust-accent' : 'border-[#3a3840] text-gray-400'
                    }`}
                  >
                    {dur === 'monthly' ? 'Mensual' : dur === 'quarterly' ? 'Trimestral' : 'Anual'}
                  </button>
                ))}
              </div>

              {plans.filter(p => p.id.includes(duration)).map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                    plan.highlight ? 'ring-1 ring-trust-yellow/30' : ''
                  } ${
                    selectedPlan?.id === plan.id
                      ? 'border-trust-accent bg-trust-accent/10'
                      : 'border-[#3a3840] hover:border-gray-600'
                  }`}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{plan.name}</span>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        plan.highlight ? 'bg-trust-yellow/20 text-trust-yellow' : 'bg-trust-accent/20 text-trust-accent'
                      }`}>
                        {plan.badge}
                      </span>
                      {plan.savings && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-trust-green/20 text-trust-green">
                          {plan.savings}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500 text-sm">{plan.period}</span>
                  </div>
                  <span className="text-xl font-bold text-white">${plan.price}</span>
                </button>
              ))}

              <button
                onClick={() => selectedPlan && setStep(2)}
                disabled={!selectedPlan}
                className="w-full mt-4 py-2.5 px-4 rounded-lg bg-trust-accent hover:bg-trust-accent-hover text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continuar
              </button>
            </div>
          )}

          {/* Step 2: Select Network */}
          {step === 2 && (
            <div className="space-y-3">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-trust-red/10 border border-trust-red/30 text-trust-red text-sm">
                  {errorMsg}
                </div>
              )}
              {networks.map((net) => (
                <button
                  key={net.id}
                  onClick={() => setSelectedNetwork(net)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    selectedNetwork?.id === net.id
                      ? 'border-trust-accent bg-trust-accent/10'
                      : 'border-[#3a3840] hover:border-gray-600'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#1f1d24] flex items-center justify-center text-xs font-bold text-trust-accent-light">
                    {net.icon}
                  </div>
                  <div className="text-left">
                    <span className="text-white font-medium block">{net.name}</span>
                    <span className="text-gray-500 text-sm">{net.token}</span>
                  </div>
                </button>
              ))}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-2.5 px-4 rounded-lg border border-[#3a3840] text-gray-300 hover:text-white hover:border-gray-500 font-medium transition-colors"
                >
                  Atras
                </button>
                <button
                  onClick={handleCreateOrder}
                  disabled={!selectedNetwork || loading}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-trust-accent hover:bg-trust-accent-hover text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    'Generar pago'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Payment Details & Status */}
          {step === 3 && (
            <div className="text-center">
              {status === 'confirmed' ? (
                <div className="py-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-trust-green/20 mb-4">
                    <svg className="w-8 h-8 text-trust-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Pago confirmado</h3>
                  <p className="text-gray-400 text-sm">Tu cuenta ha sido actualizada a Pro. Disfruta todas las funciones.</p>
                </div>
              ) : (
                <>
                  {status === 'confirming' && (
                    <div className="mb-4 p-3 rounded-lg bg-trust-yellow/10 border border-trust-yellow/30 text-trust-yellow text-sm">
                      Pago detectado, confirmando en la blockchain...
                    </div>
                  )}

                  {status === 'error' && (
                    <div className="mb-4 p-3 rounded-lg bg-trust-red/10 border border-trust-red/30 text-trust-red text-sm">
                      Error al crear la orden. Intenta de nuevo.
                    </div>
                  )}

                  <p className="text-gray-400 text-sm mb-4">
                    Envia exactamente el monto a la siguiente direccion:
                  </p>

                  {/* Amount */}
                  <div className="text-3xl font-bold text-white mb-4">
                    ${paymentData?.amount || selectedPlan?.price} <span className="text-lg text-gray-500">USDT</span>
                  </div>

                  {/* QR Code */}
                  {paymentData?.payAddress && (
                    <div className="inline-flex items-center justify-center w-40 h-40 rounded-xl bg-white mb-4 p-2">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(paymentData.payAddress)}`}
                        alt="QR Code"
                        className="w-full h-full"
                      />
                    </div>
                  )}

                  {/* Address */}
                  <div className="bg-[#1f1d24] rounded-lg p-3 mb-4">
                    <p className="text-xs text-gray-500 mb-1">Direccion de pago ({selectedNetwork?.name})</p>
                    <p className="text-sm text-white font-mono break-all select-all cursor-pointer"
                       onClick={() => { navigator.clipboard.writeText(paymentData?.payAddress || ''); }}>
                      {paymentData?.payAddress || 'Generando...'}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-1">Click para copiar</p>
                  </div>

                  {/* Invoice link */}
                  {paymentData?.invoiceUrl && (
                    <a href={paymentData.invoiceUrl} target="_blank" rel="noopener noreferrer"
                       className="inline-block mb-4 text-xs text-trust-accent hover:underline">
                      Abrir pagina de pago completa →
                    </a>
                  )}

                  {/* Countdown */}
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-4">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Expira en {formatTime(countdown)}
                  </div>

                  <button
                    onClick={() => { setStep(1); setStatus('waiting'); setCountdown(1800); }}
                    className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
                  >
                    Cancelar y volver
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#3a3840] text-center">
          <span className="text-xs text-gray-600">Powered by NOWPayments</span>
        </div>
      </div>
    </div>
  );
}
