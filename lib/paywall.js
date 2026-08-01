// Contrato de paywall (Drucker · plan/paywall-triggers.md §4). El BACKEND es la fuente de
// verdad de cuándo se permite/bloquea; el copy vive en el cliente (UpgradeModal). El backend
// solo decide variant + feature + usage.
// - 429 + variant:'limit'  = agotó un cap de una feature que estaba usando (T1 foto, T2 coach).
// - 403 + variant:'plans'  = tocó una feature Pro que su plan no incluye (T3/T4/T6/T7).

// Payload de "límite alcanzado" (cap por-feature excedido → variant limit). `usage` = {plan,
// used, cap, remaining, resetLabel} para el badge/aviso; el backend NO pone copy.
export function limitPayload({ feature, usage = null }) {
  return { blocked: true, feature, variant: 'limit', usage };
}

// Payload de "feature Pro-only" (variant plans). Sin usage necesario.
export function plansPayload({ feature }) {
  return { blocked: true, feature, variant: 'plans' };
}

// Cliente: detecta un bloqueo de paywall en una respuesta fetch. Devuelve el payload
// { blocked, feature, variant, usage } o null. El cliente NUNCA inventa el bloqueo: solo
// reacciona a 429/403 con blocked del backend.
export function readPaywall(status, data) {
  if ((status === 429 || status === 403) && data && data.blocked) {
    return { blocked: true, feature: data.feature || '', variant: data.variant || 'plans', usage: data.usage || null };
  }
  return null;
}
