# Despensa V1 — Gating Free vs Pro (para el CTO)

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Desbloquea:** cableado del cap del CTO. **Consistente con:** `plan/paywall-triggers.md`, `plan/paywall-copy-offer.md` ($99 MXN vivo), patrón de cap-por-feature del coach.

> Regla: **CRUD de despensa = siempre Free** (gancho + costo de cambio). Se limita **solo la magia** ("¿qué puedo comer?", feature IA). Sin dark patterns.

---

## (1) "¿Qué puedo comer?" = feature `despensa_reco`
- **Cap Free: 3 recomendaciones/mes** — **igual que el coach** (`coach_chat` = 3/mes). Razón: mismo patrón mental para el usuario ("3 pruebas gratis de las cosas inteligentes"), mismo copy, y protege margen (cada reco = llamada IA de grounding). No subir a más: 3 basta para probar el WOW; más regala la feature diferenciadora.
- **Al agotar:** el backend responde **`429`** con `variant:'limit'`, **antes** de llamar a la IA (no gastar la llamada):
  ```
  { blocked:true, feature:'despensa_reco', variant:'limit',
    usage:{ used, cap:3, plan:'free', resetLabel } }
  ```
  → el cliente abre `UpgradeModal` variante `limit`.
- **Pro:** ilimitado (uso justo, mismo airbag/kill-switch global que las demás features IA).
- **Aviso al 80%** (al usar la 2ª de 3): toast discreto 1×/mes, post-resultado — no es muro (patrón §3 de `paywall-triggers.md`).

## (2) CRUD de despensa = SIEMPRE Free (sin muro)
- **Poblar / ver / editar / borrar productos** (por texto libre): **gratis, sin muro, para Free y Pro.** Es el gancho de adopción y el costo de cambio.
- **Límite de productos en V1: sin límite duro.** Propongo un **tope técnico suave de 100 productos/usuario** solo como salvaguarda anti-abuso (no es un muro de monetización; si alguien lo alcanza, mensaje neutro "tu despensa está llena, quita algo", nunca "hazte Pro"). Si el CTO prefiere no poner tope en V1, está bien — no hay razón de producto para limitarlo.
- **Nunca** convertir el CRUD en disparo de paywall.

## (3) Pro / V2 — "Próximamente" (sin fecha)
Marcados en el UpgradeModal como Próximamente, atenuados, **sin lenguaje médico, sin fecha**:
- **Recetas generadas con tu despensa** (más allá de opciones simples) — Pro cuando esté [LIVE].
- **Sustituciones** ("no tienes crema → usa yogur") — V2.
- **Lista de compras adaptativa** ("te falta X para tu objetivo") — V2.

En V1 no existen aún → **no** se listan como incluidas ni disparan muro; solo aparecen en el bloque "Próximamente".

## (4) Bullet a destacar cuando el disparo viene de `despensa_reco`
El backend manda `feature:'despensa_reco'`; el `UpgradeModal` **resalta el bullet de despensa** (no el genérico del coach). Copy alineado a `paywall-copy-offer.md`:

- **Variante `limit` (agotó las 3 recos):**
  - Titular: **"Ya usaste tus 3 recomendaciones con tu despensa este mes"**
  - Cuerpo: "Con Pro, tu coach cocina contigo sin límite: dile qué tienes y te dice qué comer para tu meta."
  - CTA: "Hazte Pro — $99 MXN/mes" · Secundario: **"Seguir editando mi despensa"** (ruta gratis, no `onManual` de comida sino cerrar hacia la despensa) · Terciario: "Se reinician el {resetLabel}".
- **Bullet destacado (nuevo, marcar [LIVE] al shippear):** **"Cocina con lo que tienes."** "Dile a tu coach qué hay en tu cocina y recibe opciones que cierran tu día — sin límite."
- Si el disparo es `plans` (tocó recetas/sustituciones Pro): mismo bullet destacado + las sustituciones/lista en "Próximamente".

> **Casey/Copy:** agregar el bullet "Cocina con lo que tienes" a `paywall-copy-offer.md` §2 como bullet **[LIVE]** cuando la despensa V1 despliegue; sustituciones y lista de compras van al bloque "Próximamente".

---

## Contrato para el CTO (resumen cableable)
| Acción | Gating | Respuesta backend |
|---|---|---|
| CRUD despensa (add/ver/editar/borrar) | **Free siempre** | 200 (sin cap). Tope técnico suave 100 items (opcional) |
| "¿Qué puedo comer?" (`despensa_reco`) — Free, dentro del cap | permitido | 200, `usage.used++` |
| "¿Qué puedo comer?" — Free, cap agotado | **bloqueado** | **429** `{feature:'despensa_reco', variant:'limit', usage}` → UpgradeModal |
| "¿Qué puedo comer?" — Pro | ilimitado | 200 (airbag global) |
| Recetas/sustituciones/lista (V2) | no existen en V1 | n/a (solo teaser "Próximamente" en el modal) |

- **Cap:** `feature='despensa_reco'`, `cap=3/mes`, reserva atómica **antes** de la IA (mismo patrón `consumir_analisis`/`coach_chat`).
- **Config:** el número (3) va en `app_config` para poder ajustarlo sin redeploy.
- El backend **no decide copy** — solo `feature`+`variant`+`usage`; el copy vive en el cliente.

## TL;DR
`despensa_reco` = **3/mes Free** (igual al coach) → 429 `limit` al agotar → UpgradeModal con bullet **"Cocina con lo que tienes"**; Pro ilimitado. **CRUD de despensa = siempre gratis, sin muro** (tope técnico suave 100 items opcional, no de monetización). Recetas/sustituciones/lista = **Pro/V2 "Próximamente"**, sin fecha ni promesa médica. Cap antes de la IA, número en `app_config`. Sin dark patterns, consistente con R1.
