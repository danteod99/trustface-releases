/**
 * NOWPayments API Client - TrustMind Desktop
 * Cliente para pagos crypto via NOWPayments
 * CommonJS module para Electron main process
 */

const crypto = require('crypto');

const API_KEY = process.env.NOWPAYMENTS_API_KEY || '0MA103D-8NF4VGJ-M2NE2FC-ZCF7E4X';
const BASE_URL = 'https://api.nowpayments.io/v1';

// Webhook IPN URL from environment
const IPN_CALLBACK_URL = process.env.NOWPAYMENTS_IPN_URL || '';

const PRICE_MAP = {
  // Legacy keys
  monthly: 99,
  quarterly: 229,
  yearly: 599,
  // TrustFace plans
  'face-monthly': 99,
  'face-quarterly': 229,
  'face-yearly': 599,
  // TrustInsta plans
  'insta-monthly': 99,
  'insta-quarterly': 229,
  'insta-yearly': 599,
  // Bundle plans
  'bundle-monthly': 149,
  'bundle-quarterly': 349,
  'bundle-yearly': 899,
};

const CURRENCY_MAP = {
  trc20: 'usdttrc20',
  bsc: 'usdtbsc',
  erc20: 'usdterc20',
  sol: 'usdcsol',
};

const DURATION_LABELS = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  yearly: 'Anual',
};

/**
 * Crea una orden de pago crypto
 * @param {string} userId - ID del usuario
 * @param {Object} plan - { duration: 'monthly'|'quarterly'|'yearly', network: 'trc20'|'bsc'|'erc20'|'sol' }
 * @returns {Promise<Object>} Datos del pago o error
 */
async function createPaymentOrder(userId, plan) {
  const { duration, network } = plan;

  const priceAmount = PRICE_MAP[duration];
  if (!priceAmount) {
    return { error: `Plan no valido: ${duration}` };
  }

  const payCurrency = CURRENCY_MAP[network];
  if (!payCurrency) {
    return { error: `Red no valida: ${network}` };
  }

  const orderId = crypto.randomUUID();

  const body = {
    price_amount: priceAmount,
    price_currency: 'usd',
    pay_currency: payCurrency,
    order_id: orderId,
    order_description: `TrustFace Pro - ${duration}`,
  };
  if (IPN_CALLBACK_URL) body.ipn_callback_url = IPN_CALLBACK_URL;

  try {
    console.log(`[NOWPayments] Creando orden de pago - Usuario: ${userId}, Plan: ${duration}, Red: ${network}`);

    const response = await fetch(`${BASE_URL}/payment`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(`[NOWPayments] Error al crear orden: ${response.status} - ${JSON.stringify(errorData)}`);
      return { error: errorData.message || `Error HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log(`[NOWPayments] Pago creado exitosamente - ID: ${data.payment_id}, Address: ${data.pay_address}`);

    return {
      orderId,
      paymentId: data.payment_id,
      payAddress: data.pay_address,
      payAmount: data.pay_amount,
      payCurrency: data.pay_currency,
      expiresAt: data.expiration_estimate_date,
    };
  } catch (err) {
    console.log(`[NOWPayments] Error de conexion al crear orden: ${err.message}`);
    return { error: `Error de conexion: ${err.message}` };
  }
}

/**
 * Verifica el estado de un pago
 * @param {string} paymentId - ID del pago de NOWPayments
 * @returns {Promise<Object>} Estado del pago o error
 */
async function checkPaymentStatus(paymentId) {
  try {
    console.log(`[NOWPayments] Consultando estado del pago: ${paymentId}`);

    const response = await fetch(`${BASE_URL}/payment/${paymentId}`, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(`[NOWPayments] Error al consultar pago: ${response.status} - ${JSON.stringify(errorData)}`);
      return { error: errorData.message || `Error HTTP ${response.status}` };
    }

    const data = await response.json();
    console.log(`[NOWPayments] Estado del pago ${paymentId}: ${data.payment_status}`);

    return {
      status: data.payment_status,
      payAmount: data.pay_amount,
      actuallyPaid: data.actually_paid,
      payCurrency: data.pay_currency,
      network: data.network,
    };
  } catch (err) {
    console.log(`[NOWPayments] Error de conexion al consultar pago: ${err.message}`);
    return { error: `Error de conexion: ${err.message}` };
  }
}

/**
 * Retorna las redes crypto disponibles para pago
 * @returns {Array<Object>} Lista de redes soportadas
 */
function getAvailableNetworks() {
  return [
    { id: 'trc20', label: 'Tron (TRC20)', currency: 'USDT', icon: 'T' },
    { id: 'bsc', label: 'BSC (BEP20)', currency: 'USDT', icon: 'B' },
    { id: 'erc20', label: 'Ethereum (ERC20)', currency: 'USDT', icon: 'E' },
    { id: 'sol', label: 'Solana', currency: 'USDC', icon: 'S' },
  ];
}

/**
 * Retorna los planes de precio disponibles
 * @returns {Array<Object>} Lista de planes
 */
function getPricingPlans() {
  const features = [
    'Perfiles ilimitados',
    'Todas las automatizaciones',
    'Scraper de datos',
    'Programador',
    'Warm-up automatico',
    'Soporte prioritario',
  ];

  return [
    {
      id: 'monthly',
      name: 'Mensual',
      price: 99,
      period: '/mes',
      features: [...features],
    },
    {
      id: 'quarterly',
      name: 'Trimestral',
      price: 229,
      period: '/3 meses',
      savings: 'Ahorra 23%',
      features: [...features],
    },
    {
      id: 'yearly',
      name: 'Anual',
      price: 599,
      period: '/ano',
      savings: 'Ahorra 50%',
      features: [...features],
    },
    {
      id: 'bundle-monthly',
      name: 'Bundle Mensual',
      price: 149,
      period: '/mes',
      savings: 'Insta + Face',
      features: [...features, 'TrustInsta + TrustFace'],
    },
    {
      id: 'bundle-quarterly',
      name: 'Bundle Trimestral',
      price: 349,
      period: '/3 meses',
      savings: 'Ahorra 22%',
      popular: true,
      features: [...features, 'TrustInsta + TrustFace'],
    },
    {
      id: 'bundle-yearly',
      name: 'Bundle Anual',
      price: 899,
      period: '/ano',
      savings: 'Ahorra 50%',
      features: [...features, 'TrustInsta + TrustFace'],
    },
  ];
}

module.exports = {
  createPaymentOrder,
  checkPaymentStatus,
  getAvailableNetworks,
  getPricingPlans,
};
