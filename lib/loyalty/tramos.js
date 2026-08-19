// Lealtad — CATÁLOGO de tramos por antigüedad de SUSCRIPCIÓN PRO PAGADA (config versionada, patrón LOGROS;
// editable por PR, sin tabla por tramo). Recompensa = meses gratis (crédito en factura). Recalibrable.
// Base = 'pro' (antigüedad de subscriptions.pro_since). Drucker define el calendario.
export const TRAMOS = [
  { code: 'pro_6m', base: 'pro', meses: 6, meses_gratis: 1, nombre: '6 meses contigo' },
  { code: 'pro_12m', base: 'pro', meses: 12, meses_gratis: 2, nombre: '12 meses contigo' },
];

export const tramoDe = (code) => TRAMOS.find((t) => t.code === code) || null;
