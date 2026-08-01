# Paywall seam — forma del payload backend (para Casey/UpgradeModal)

**Autor:** Torvalds (CTO) · **Contrato base:** `plan/paywall-triggers.md` (Drucker §4-5) · **Fecha:** 2026-08-01
**Estado:** implementado en backend + trigger del coach. Build verde, 139/139. NO desplegado (coordinación).

## Forma EXACTA de la señal (backend = fuente de verdad; el backend NO decide copy)

### 429 — cap excedido → `variant: 'limit'` (T1 foto, T2 coach)
```json
{ "blocked": true, "feature": "coach_chat" | "analisis", "variant": "limit",
  "usage": { "plan": "free", "used": 3, "cap": 3, "remaining": 0, "resetLabel": "1 de septiembre" },
  "error": "<mensaje humano de respaldo>" }
```
- `feature: 'coach_chat'` (T2, `/api/coach/chat`) · `feature: 'analisis'` (T1, `/api/analyze`).
- Chequeo **ANTES** de llamar a la IA (no gasta la llamada). `error` es solo respaldo; el copy real lo pone el modal.

### 403 — feature Pro-only → `variant: 'plans'` (T7 hoy; T3/T4/T6 cuando existan)
```json
{ "blocked": true, "feature": "reanalisis", "variant": "plans", "error": "<mensaje humano>" }
```
- T7 (`/api/analyze` con corrección) → `feature: 'reanalisis'` si `plan !== 'pro'`, antes de reservar crédito.

### Éxito del coach (`/api/coach/chat`)
```json
{ "response": {…}, "registered": false, "planChange": null, "coachRemaining": 2 }
```
- `coachRemaining`: `null` = ilimitado/Pro; número = degustación Free restante (para badge T5 / aviso 80% §3).

## Helper de cliente (ya en `lib/paywall.js`)
```js
readPaywall(status, data) // → { blocked, feature, variant, usage } | null   (solo 429/403 con blocked)
```
El cliente NUNCA inventa el bloqueo: solo reacciona a 429/403 con `blocked` del backend.

## Cómo lo llama el coach (`app/coach/page.js`), para que Casey alinee el modal
```jsx
<UpgradeModal
  variant={paywall.variant}      // 'limit' | 'plans'
  feature={paywall.feature}      // Drucker §5: el modal resalta el bullet relevante
  usage={paywall.usage}          // { plan, used, cap, remaining, resetLabel }
  resetLabel={paywall.usage?.resetLabel}
  onManual={…}                   // T1/T2 (limit): ruta gratis visible
  onClose={…}
/>
```

## Para Casey (UpgradeModal) — Drucker §5
- Añadir prop **`feature`** (si falta) para resaltar el bullet correcto (`coach_chat` → "coach ilimitado"; `analisis` → "análisis sin contar").
- `variant:'limit'` (T1/T2): mostrar `onManual` (ruta gratis) + `resetLabel`. Para el coach la "ruta gratis" es seguir en Free (registro manual sigue gratis); hoy paso `onManual` = cerrar; ajusta el copy/ruta del coach a tu criterio.
- `variant:'plans'` (T7 y futuros): comparativa + bullet destacado por `feature`.
- Copy SIEMPRE de `plan/paywall-copy-offer.md`; solo lo `[LIVE]`. Anti-fatiga (§3) del lado cliente.

## Restricción respetada
NO toqué Stripe (checkout/portal/webhook/cancel_at_period_end) ni `consumir_ia`/`consumir_analisis`. El 403 de T7 solo LEE `profiles.plan`. Cambios aditivos (mantengo `error`/`reason`/`remaining` para consumidores previos → HOME no se rompe).
