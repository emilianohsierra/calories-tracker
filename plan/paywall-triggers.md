# Paywall — Mapa de Disparos (triggers)

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Guía el cableado de:** Casey (`components/UpgradeModal.js`) y CTO (señal de upgrade del backend).
**Base:** `plan/paywall-copy-offer.md` (copy), `plan/upgrademodal-premium-spec.md` (variantes `plans`/`limit`), `plan/coach-arquitectura.md` §6 (caps por-feature), `plan/vision-roadmap-priorizado.md` (split).

> **Principio rector (no negociable):** el muro aparece **SIEMPRE después del valor, nunca antes**. Free es útil por sí solo; el **registro manual/texto es siempre gratis**. El objetivo es "vender tranquilidad" en el **instante justo** (cuando el usuario ya sintió lo que se pierde), no interrumpir. Cero dark patterns.

---

## 0. Las dos variantes (recordatorio)
- **`limit`** = el usuario **agotó un cap de una feature que estaba usando** (análisis foto, mensajes de coach). Tono empático: "ya usaste tus X", con **ruta gratis visible**.
- **`plans`** = el usuario **tocó/descubrió una feature Pro** que aún no tiene (coach especializado, dashboard, reporte). Tono aspiracional: comparativa + "esto te espera en Pro".

Regla de asignación: **¿estaba usando algo y se topó con el tope? → `limit`. ¿Quiso entrar a algo que no incluye su plan? → `plans`.**

---

## 1. Mapa de disparos

| # | Acción del usuario (disparo) | Valor ya recibido antes del muro | Variante | Momento exacto | Microcopy clave |
|---|---|---|:--:|---|---|
| T1 | **Agota los 10 análisis de foto/mes** e intenta el 11º | Usó 10 análisis IA gratis | `limit` | **ANTES** de llamar a la IA (no gastar la llamada) | "Ya usaste tus 10 análisis con IA de este mes. Puedes seguir a mano gratis, o Pro para analizar sin contar." |
| T2 | **Agota la degustación del coach** (3 msg/mes) e intenta el 4º | Conversó 3 veces con el coach (probó el valor) | `limit` | Al enviar el 4º mensaje, **antes** de llamar al modelo | "Ya usaste tus 3 consultas con el coach este mes. Con Pro, tu coach está disponible siempre." |
| T3 | **Toca un coach especializado bloqueado** (2º objetivo / cambiar de coach) | Ya tiene 1 coach activo y su plan calculado | `plans` | Al seleccionar el coach/objetivo no incluido | "Cambia de objetivo y ten los 5 coaches con Pro." |
| T4 | **Abre el dashboard premium 'Próximamente'** (tendencias/histórico/micros) | Vio su resumen de 7 días y el teaser difuminado | `plans` | Al tocar el widget con teaser+candado | "Tu progreso completo, más allá de 7 días, te espera en Pro." |
| T5 | **Toca el badge de saldo** (ej. "3/10 análisis") | Está usando la app activamente | `plans` | Al tocar el badge (acción voluntaria) | "Ve todo lo que incluye Pro." (informativo, nunca interrumpe) |
| T6 | **Abre el reporte semanal** (feature Pro, R2) | Registró durante la semana | `plans` | Al tocar la tarjeta/teaser del reporte | "Tu coach revisó tu semana. Desbloquéalo con Pro." |
| T7 | **Intenta reanálisis con corrección** (feature Pro hoy) | Ya obtuvo un análisis por foto | `plans` | Al tocar "Corregir a la IA" | "Ajusta cada estimación hasta que quede justa, con Pro." |

> **Nota T2/coach:** solo aplica **cuando el coach esté vivo como Pro** (cierre R1). Antes de eso, T2/T3/T6 no se cablean.

---

## 2. Reglas de "siempre después del valor"

Cada disparo cumple que el usuario **ya recibió valor** antes del muro:
- **T1 (análisis):** ya hizo 10 análisis reales. El muro llega al **intentar** el 11º — **antes de la llamada IA** (para no cobrar/gastar), pero **después** de 10 usos completos.
- **T2 (coach):** ya tuvo 3 conversaciones útiles. El muro es la 4ª intención, no la 1ª.
- **T4/T6 (dashboard/reporte):** el usuario **ve el contenido difuminado (teaser)**, no un espacio vacío — sabe qué desbloquea. Ver el valor bloqueado convierte mejor y es honesto.
- **T7 (reanálisis):** ya tiene su primer análisis; el muro es sobre *mejorarlo*, no sobre obtenerlo.

**Anti-patrón prohibido:** ningún muro al **abrir la app**, en **onboarding**, ni **antes del plan calculado** (el "momento ajá" es siempre gratis). Nada de muro antes de que el usuario registre su primera comida.

---

## 3. Anti-fatiga (no acosar con el muro)
Aun siendo honesto, mostrar el muro en cada tap cansa. Reglas de frecuencia:
- **Cap de aparición proactiva:** las variantes `plans` **no-solicitadas** (T3/T4/T6/T7) se muestran **máx. 1 vez por día** por usuario. Si ya vio una hoy, el 2º intento hace la acción-fallback silenciosa (o un tooltip discreto "Pro"), no reabre el modal.
- **T1/T2 (`limit`) siempre se muestran** (es un tope real que bloquea la acción que pidió) — pero traen **ruta gratis** (manual) para que nunca sea un callejón.
- **T5 (badge)** es siempre voluntario → nunca cuenta para el cap.
- **Aviso al 80% del cap** (ej. 8/10 análisis o 2/3 mensajes de coach): toast discreto, **1 sola vez por mes**, post-resultado — no es el muro, es cortesía.
- **Respeta el cierre:** si el usuario cierra el muro ("Ahora no"), no se reabre por la misma acción en la misma sesión.

---

## 4. Contrato para el CTO — señal de upgrade del backend

El backend es la **fuente de verdad** de cuándo se permite/bloquea (nunca confiar solo en el cliente):
- **Caps por-feature** (reusa `ai_usage`/`usage_counters`, patrón `consumir_analisis`): al reservar cuota, si excede → responder **429** con payload:
  ```
  { blocked: true, feature: 'analisis'|'coach_chat'|..., variant: 'limit', usage: {used, cap, plan, resetLabel} }
  ```
- **Features Pro-only** (coach especializado, dashboard, reporte, reanálisis): el endpoint responde **403** con `{ blocked:true, feature, variant:'plans' }` si `plan !== 'pro'`. El cliente abre `UpgradeModal` con esa variante.
- **El chequeo del cap del análisis va ANTES de la llamada a la IA** (T1) — ya es el patrón vivo; extenderlo a `coach_chat` (T2).
- `usage` (plan, used, cap, `resetLabel`, `subscription.cancel_at_period_end`) se expone al cliente para pintar badge (T5) y aviso 80%.
- **El backend no decide copy** — solo `variant` + `feature` + `usage`; el copy vive en el cliente (`paywall-copy-offer.md`).

## 5. Contrato para Casey — `UpgradeModal`
- Props ya existentes: `variant, usage, resetLabel, onClose, onManual`. Añadir (si falta) `feature` para que el modal ajuste el bullet destacado (ej. resaltar "coach ilimitado" si `feature==='coach_chat'`).
- **T3/T4/T6/T7 → `plans`** con el bullet relevante destacado. **T1/T2 → `limit`** con `onManual` visible.
- Aplicar el **cap anti-fatiga** (§3) del lado cliente para las `plans` no-solicitadas.
- Copy: **siempre** de `plan/paywall-copy-offer.md`; solo mostrar como incluido lo **[LIVE]**.

---

## 6. Checklist de aceptación (anti-dark-pattern)
- [ ] Ningún muro antes del primer valor (app open / onboarding / plan calculado / 1ª comida).
- [ ] T1/T2 siempre ofrecen la **ruta gratis** (manual) y la fecha de reinicio.
- [ ] Teasers (T4/T6) muestran contenido difuminado, no vacío — el usuario sabe qué desbloquea.
- [ ] `plans` no-solicitado máx. 1×/día; cierre respetado en la sesión.
- [ ] Aviso 80% máx. 1×/mes, post-resultado.
- [ ] Solo features **[LIVE]** como incluidas; el resto "Próximamente".
- [ ] Backend = fuente de verdad (429/403); el cliente nunca "inventa" el bloqueo.

---

## TL;DR
7 disparos, cada uno **después del valor**: T1 (agota 10 análisis)→`limit`; T2 (agota 3 msg coach)→`limit`; T3 (coach bloqueado), T4 (dashboard teaser), T5 (badge, voluntario), T6 (reporte semanal), T7 (reanálisis)→`plans`. `limit` = topó un cap que usaba (con ruta gratis); `plans` = quiso entrar a algo Pro (con teaser). **Nunca** muro antes del plan calculado o la 1ª comida. Anti-fatiga: `plans` no-solicitado 1×/día, aviso 80% 1×/mes. Backend manda (429/403 con `variant`+`feature`+`usage`); el copy vive en el cliente y solo muestra lo [LIVE].
