# R1 — Launch Checklist (Definition of Done)

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Uso:** lista verificable contra la que Lugia da el **visto de ship** de R1 (coach vivo y cobrable).
**Leyenda estado:** ✅ LISTO · 🟡 EN CURSO · ⛔ BLOQUEADO. Cada owner confirma su línea antes del ship.

> **Regla de ship:** R1 **no shippea** hasta que todos los items estén ✅ **excepto (h)**, que es el **gate final separado** de Emiliano (keys live de Stripe). Los dos **gates de seguridad/negocio** son **(a)** — hoy **EN FIRMA**, no bloqueado estructuralmente — y **(h)**.

---

## Gates de ship (bloquean el release)

### (a) Guard de salud FIRMADO por QA — antes de encender memoria 🟡 EN FIRMA (no bloqueado estructuralmente)
- **Owner:** Karpathy/CTO (fix) + Slowking (pasada adversarial) + Nielsen QA (firma autoritativa) · **Verifica:** firma CERRADO en RE-QA.
- **Estado real (corregido por Lugia):** la allow-list enumerada de síntomas **se descartó** (es estructuralmente imposible que sea hermética). El guard se **rediseñó — Camino B, hermético por diseño**: `es_salud = HEALTH_SIGNAL OR (contiene ALLERGEN_TERM Y no es 'gusto limpio')` → **alérgeno = SALUD por defecto**, salvo gusto explícito sin bloqueadores de daño. El CTO cerró la colisión gusto+síntoma: **117/117 tests, 0 regresión**. Construido, no desplegado.
- **Estado del proceso:** **EN FIRMA** — Slowking hace la pasada adversarial ahora + Nielsen firma la autoritativa (~10:10pm). No es un bloqueo estructural; es el último paso de firma.
- **DoD:** Nielsen firma CERRADO → se **enciende la memoria** (R4-1: `coach_memories` + `save_memory` + inyección). Barrera que impide capturar datos de salud/alergias mal.
- **Fallback en el bolsillo (probablemente innecesario):** si la firma no llega a tiempo, lanzar memoria **solo de gustos/platillos** (guard rechaza lo dudoso por defecto) y encender memoria plena en fast-follow. Con el rediseño hermético ya construido, es solo un colchón.
- **Nota:** la **captura de alergias** sigue bloqueada por separado hasta el filtro hermético con etiquetas (`plan/coach-alergias-arquitectura.md`); NO es parte de R1.

### (h) Stripe go-live (keys LIVE) — gate final separado ⛔ BLOQUEADO (depende de Emiliano)
- **Owner:** Emiliano (cuenta Stripe) + CTO (config) · **Verifica:** checkout real con tarjeta live en producción → webhook marca `plan='pro'`.
- **Estado:** Stripe Pro **validado en test** ($99 MXN). Falta poner **keys live** + producto/precio live + webhook de producción. **Es el último switch**, aparte del resto del ship.
- **DoD:** un pago real de extremo a extremo activa Pro; el portal cancela y respeta `cancel_at_period_end`. No se enciende hasta el OK de Emiliano.

---

## Items de producto (deben quedar ✅ para el visto)

### (b) HOME briefing en vivo sin romper la HOME actual 🟡 EN CURSO
- **Owner:** Rams (UI) + Casey (migración de pantalla) · **Verifica:** HOME renderiza el saludo/briefing nuevo; el flujo actual (anillos, registro, semana) intacto; dark OK.
- **Estado:** sistema de diseño cerrado; `GreetingHeader` construido pero **huérfano** (`plan/consistencia-premium-app.md` §1.3). Falta cablearlo y verificar no-regresión + dark (D1-D8).
- **DoD:** briefing vivo · cero azul legacy/emoji en HOME · `.num` en cifras · no-regresión del registro y la gráfica.

### (c) Contrato de paywall cableado end-to-end 🟡 EN CURSO
- **Owner:** CTO (429/403 + payload) + Casey (`UpgradeModal`) · **Verifica:** recorrido completo abajo.
- **Estado:** copy (`paywall-copy-offer.md`), triggers (`paywall-triggers.md`) y spec (`upgrademodal-premium-spec.md`) cerrados; falta el cableado.
- **DoD (cadena completa):** backend `429`(cap)/`403`(Pro-only) con `{blocked,feature,variant,usage}` → cliente abre `UpgradeModal` con `variant`+`feature` → CTA → **Stripe checkout/portal intactos** (`/api/checkout`, `/api/portal`) → webhook → `plan='pro'`. Probar `plans` y `limit`, `isPro`, `cancel_at_period_end`.

### (d) Caps chequeados ANTES de la llamada a la IA 🟡 EN CURSO
- **Owner:** CTO · **Verifica:** en el 11º análisis y en el 4º msg de coach, el 429 llega **sin** haber llamado al modelo (log/telemetría).
- **Estado:** patrón atómico vivo para análisis (`consumir_analisis`); falta **extenderlo a `coach_chat`** (degustación 3/mes).
- **DoD:** ningún gasto de IA en una acción que excede el cap; reserva atómica antes del modelo para `analisis` y `coach_chat`.

### (e) Ruta manual gratis SIEMPRE disponible ✅ LISTO (verificar no-regresión)
- **Owner:** CTO + Casey · **Verifica:** con cap agotado, el registro manual y por texto funcionan sin muro; `limit` ofrece `onManual`.
- **Estado:** el registro manual es ilimitado y gratis por diseño; el muro nunca lo bloquea. Solo falta **confirmar** que ninguna ruta nueva lo gatee y que `limit` muestra "Seguir con registro manual".
- **DoD:** el usuario nunca queda sin poder anotar su comida.

### (f) Solo se muestra como incluido lo [LIVE] 🟡 EN CURSO
- **Owner:** Casey · **Verifica:** el modal lista como activo solo features desplegadas; dashboard/planes en "Próximamente" (atenuado, sin fecha, sin lenguaje médico).
- **Estado:** regla definida en `paywall-copy-offer.md`; depende del cableado de Casey y de qué esté vivo al shippear (si el coach no está vivo, sus bullets bajan a Próximamente).
- **DoD:** cero promesa de algo no usable al pagar; sin lenguaje médico.

### (g) Coach Pro-gating enforced 🟡 EN CURSO
- **Owner:** CTO · **Verifica:** usuario Free consume degustación (3/mes) y al 4º recibe 429/`limit`; features de coach Pro-only devuelven 403/`plans`; Pro tiene acceso ilimitado.
- **Estado:** chat con tool-use vivo; falta el **gate por plan** en `/api/coach/chat` (degustación Free) y en features Pro-only.
- **DoD:** el valor del coach queda correctamente detrás del plan, con degustación funcional en Free.

---

## Higiene de release (no-regresión) — 🟡 EN CURSO
- **Owner:** CTO + Nielsen QA · **DoD:**
  - [ ] `npm run build` verde.
  - [ ] Endpoints vivos **sin cambios de contrato**: `/api/analyze`, `/api/meals`, `/api/profile`, Stripe. (Todo el coach/memoria es **aditivo** — `coach-arquitectura.md` §8.)
  - [ ] Migración SQL de memoria **idempotente y aditiva**, revisada antes de correrla.
  - [ ] Pasada visual Light/Dark en móvil/desktop (D1-D8) — Nielsen + Rams.
  - [ ] RLS verificada en tablas nuevas (nadie lee datos de otro).

---

## Tablero-resumen para el visto de Lugia

| Item | Owner | Estado |
|---|---|:--:|
| (a) Guard de salud firmado (gate memoria) | Karpathy/CTO + Slowking + Nielsen | 🟡 **EN FIRMA** (~10:10pm) |
| (b) HOME briefing sin romper la actual | Rams + Casey | 🟡 EN CURSO |
| (c) Paywall end-to-end (429/403→modal→Stripe) | CTO + Casey | 🟡 EN CURSO |
| (d) Caps ANTES de la IA | CTO | 🟡 EN CURSO |
| (e) Ruta manual gratis siempre | CTO + Casey | ✅ LISTO (verificar) |
| (f) Solo [LIVE] como incluido | Casey | 🟡 EN CURSO |
| (g) Coach Pro-gating enforced | CTO | 🟡 EN CURSO |
| Higiene de release (no-regresión) | CTO + Nielsen | 🟡 EN CURSO |
| (h) Stripe keys LIVE (gate final) | Emiliano + CTO | ⛔ BLOQUEADO (esperado) |

---

## TL;DR para dar el ship
**No shippear R1 aún, pero ningún bloqueo estructural.** Item **(a)** guard de salud está **EN FIRMA** — se rediseñó a hermético-por-diseño (Camino B, 117/117, 0 regresión); Slowking hace la pasada adversarial y Nielsen firma (~10:10pm). Al firmar, se enciende la memoria; el descope a "memoria solo de gustos" es solo colchón, probablemente innecesario. **(h)** keys live de Stripe = switch final de Emiliano. El resto (b-g + higiene) están **EN CURSO** y son cableado directo sobre specs ya cerradas; **(e)** es lo más avanzado. **Recomendación PM:** esperar la firma de (a); en paralelo terminar (b-g); dejar (h) como último switch con Emiliano. Doy mi visto de producto cuando (b-g)+higiene estén ✅ y (a) firmado; (h) es el gate de Emiliano.
