import Stripe from 'stripe';

// Cliente Stripe del lado servidor. Nunca se expone al navegador.
// (m1) NO se fija una apiVersion que contradiga la del webhook de Emiliano (dahlia):
// se usa la versión por defecto del SDK y TODAS las lecturas de la suscripción pasan por
// stripe.subscriptions.retrieve() en el webhook, que además lee current_period_end de
// forma defensiva (items[0] ?? subscription), así funciona en cualquiera de las 2 versiones.
let stripe;

export function getStripe() {
  if (stripe) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error('Falta STRIPE_SECRET_KEY');
    err.code = 'NO_STRIPE_KEY';
    throw err;
  }
  stripe = new Stripe(key);
  return stripe;
}

// Precio del plan Pro. MVP = solo mensual; el anual se agrega luego con un 2º Price ID
// (STRIPE_PRICE_PRO_ANNUAL) sin cambiar la estructura.
export const PRICES = {
  monthly: () => process.env.STRIPE_PRICE_PRO, // 99 MXN/mes
  // annual: () => process.env.STRIPE_PRICE_PRO_ANNUAL, // fast-follow
};

export const ALLOWED_PLANS = Object.keys(PRICES);

// m8: plan desconocido → null (sin fallback silencioso a mensual). El caller valida.
export function resolvePriceId(plan) {
  const getter = PRICES[plan];
  return getter ? getter() : null;
}

// m2: SOLO estos price IDs (nuestro plan Pro) conceden premium en el webhook.
export function ourPriceIds() {
  return [process.env.STRIPE_PRICE_PRO, process.env.STRIPE_PRICE_PRO_ANNUAL].filter(Boolean);
}
