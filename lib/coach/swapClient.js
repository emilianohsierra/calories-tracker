// Feature B — swap proactivo por objetivo. Contrato del CTO (a confirmar):
//   GET /api/coach/swap → { swap: { de, a, razon, a_product_id? } | null }
//     el BACKEND decide si ofrecer (back-off/anti-saturación + esDatoDeSalud + alérgenos duros);
//     null = no ofrecer ahora. La UI NUNCA fuerza ni inventa.
//   POST /api/coach/swap { acepto } → { ok } (registra para el back-off: 'Ahora no' baja frecuencia).
// Deploy-safe: fallo/ausente → null (no se muestra la tarjeta). Mock SÓLO en dev.

export async function getSwap() {
  try {
    const res = await fetch('/api/coach/swap');
    if (res.ok) {
      const d = await res.json().catch(() => null);
      if (d && 'swap' in d) return d.swap || null; // null explícito = no ofrecer
    }
  } catch {
    // sin backend / red caída
  }
  if (process.env.NODE_ENV === 'production') return null; // prod: degrada (sin tarjeta)
  return { de: 'Yogur azucarado', a: 'Yogur natural', razon: 'Mismo desayuno, más proteína y menos azúcar añadido — te acerca a tu meta.' };
}

export async function postSwapOferta(acepto) {
  try {
    await fetch('/api/coach/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acepto: !!acepto }) });
  } catch { /* best-effort: el back-off se reintenta luego */ }
}
