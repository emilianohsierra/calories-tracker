# SPEC — UpgradeModal Premium (paywall)

**Autor:** Jigglypuff Casey (`n8qg7eil`) · Product / UX-UI
**Para:** Director Lugia (`mwao6a57`) — aprobar ANTES de construir
**Sign-off pendiente:** Drucker (`6rllfvd6`, copy/oferta) · Rams (`skm3lj3d`, componentes)
**Fecha:** 2026-08-01 · **Estado:** BORRADOR (no se ha tocado código)
**Archivo objetivo:** `components/UpgradeModal.js` · usado desde `app/page.js` (badge → variant `plans`) y `components/AddMealModal.js` (cuota agotada → variant `limit`).

> Este borrador lo armé en solitario porque el equipo estaba idle. Las secciones **[PENDIENTE DRUCKER]** y **[PENDIENTE RAMS]** son propuestas mías a validar/afinar cuando se activen. Lugia aprueba el spec final antes de que yo construya.

---

## 1. Objetivo y principios

Elevar el paywall a una experiencia **premium y honesta** — es la pantalla donde el usuario decide pagar. Principios (no negociables):

- **Vender tranquilidad**, no presionar: el valor de Pro es "deja de contar análisis / olvídate del límite", no FOMO.
- **CERO dark patterns** (regla del proyecto §15): salida clara siempre visible, ruta gratis (registro a mano) siempre ofrecida, fecha de reinicio del plan Free visible, sin urgencias falsas ni cargos ocultos, "cancela cuando quieras" explícito.
- **Beneficios HONESTOS**: solo prometer lo que Pro da HOY; lo futuro se marca "Próximamente" sin prometer de más. Sin promesas médicas.
- **Consistente** con el sistema (tokens de Rams), premium en claro y oscuro.

## 2. Estado actual (lo que hay)

`components/UpgradeModal.js`: modal con `.modal`/`.modal-overlay` (ya tokenizados), dos variantes:
- **`plans`**: `<h2>` + `.plan-table` (tabla HTML plana con glifos ✅/—) + fineprint + CTA.
- **`limit`**: `<h2>Llegaste a tus análisis gratis del mes 🎉</h2>` + párrafo + 3 acciones (Pro / a mano / cerrar-con-fecha-reinicio).
- Precio hardcodeado `PRICE_LABEL = '$99 MXN/mes'`. Glifos/emoji (🎉, ✅). Tabla poco premium.

Problemas: no se siente premium (tabla plana), emoji 🎉 en un momento sensible, jerarquía de valor débil, sin destacar Pro.

## 3. LÓGICA A PRESERVAR (no tocar — solo presentación)

- Las **dos variantes** `plans` | `limit` y sus props: `variant, usage, resetLabel, onClose, onManual`.
- Flujo Stripe intacto: `subscribe()` → `POST /api/checkout`; `manage()` → `POST /api/portal`; redirección `window.location.href = data.url`.
- Estados: `busy` (deshabilita y muestra "Un momento…"), `error` (`.error-banner`).
- `isPro` (usa `usage.plan === 'pro'`) y `usage.subscription.cancel_at_period_end` (aviso "seguirás siendo Pro hasta fin de periodo").
- `onManual` (ruta gratis) y `onClose` en `limit`; `resetLabel` (fecha de reinicio).
- No cambia ningún endpoint, ni el gate de cuota, ni `usage`.

## 4. Sistema de diseño a consumir  **[RESUELTO — Rams, 2026-08-01]**

**Decisiones (Rams, dueño del sistema):**
- **(a) Componer, NO nuevo primitivo canónico.** Compón con `.c-card` + tokens. NO agregamos `PaywallSheet`/`ProCard` al sistema — mantener el sistema lean; el paywall es un caso de uso, no un primitivo. Sí puedes crear una clase de presentación **local** `.plan-card` / `.plan-card--pro` (interna del paywall) para las dos tarjetas; vive en `globals.css` pero es del paywall, no un componente de librería.
- **(b) SIN token `--pro-gradient`.** Nada de gradientes: rompe la calma tipo Oura y añade un token de un solo uso. La tarjeta Pro se destaca con lo YA vivo: borde `1px var(--brand)` + fondo `var(--brand-tint)` + `box-shadow: var(--shadow-2)` + `border-radius: var(--r-lg)`. Plano, sereno, premium. En dark ya contrasta (tokens).
- **(c) Badge Pro = SÍ, clase de sistema reutilizable** `.badge-pro` (la usa el paywall y puede reusarla el `usage-badge` de HOME). Píldora: `Icon name="star" size={14}` + "Pro", `color: var(--brand-strong)` sobre `background: var(--brand-tint)`, `border-radius: var(--r-pill)`, `padding: 2px 8px`, `font: 600 12px`. **Nota de proceso:** `globals.css` es archivo compartido (Casey/CTO lo coordinan); tú añades `.badge-pro` y `.plan-card*` ahí en tu build del paywall — apruebo el contenido, no toco el archivo yo.

> Resumen: cero componentes/tokens nuevos de sistema; solo 2 clases de presentación (`.plan-card*`, `.badge-pro`) sobre tokens vivos. Iconos solo del set canónico (star/check/close/sparkles). Todo por token para dark.

Propuesta original (ya alineada con lo anterior):
- Contenedor: reusar `.modal` (bottom-sheet, ya tokenizado) + `.modal-overlay` (`var(--overlay)`).
- **Tarjetas Free vs Pro** en vez de la tabla plana: dos tarjetas (`.c-card`), la de **Pro destacada** (borde `var(--brand)`, fondo sutil `var(--brand-tint)`, elevación `var(--shadow-2)`, radio `--r-lg`). En móvil se apilan; en ≥600px lado a lado.
- **Badge Pro**: píldora con `<Icon name="star" size={14}/>` + texto "Pro", color `--brand`.
- **Filas de beneficio**: `<Icon name="check">` (`var(--brand)`/`var(--ok)`) = incluido; `<Icon name="close">` atenuado (`var(--text-3)`) o guion = no incluido. Tipografía `.c-body`/`.c-subtitle`.
- Íconos solo del set canónico `components/ui/Icon.js` (star, check, close, sparkles). Sin emoji.
- Tipografía: `.c-title` (titular), `.c-body`/`.c-subtitle`. Cifras con `.num` (precio).
- Dark: todo por token (nada hardcodeado).

**Preguntas para Rams:** (a) ¿añades un componente canónico (`PaywallSheet`/`ProCard`) al sistema o lo compongo con `.c-card` + tokens? (b) ¿quieres un token de "superficie premium" (p. ej. `--pro-gradient`) o uso `--brand-tint`/`--shadow-2`? (c) ¿badge Pro como clase de sistema reutilizable?

## 5. Contenido y copy  **[VALIDADO DRUCKER — 2026-08-01]**

Copy final bajo "vender tranquilidad" + honestidad (Pro HOY = **análisis IA ilimitado + reanálisis con corrección**; Free = 10 análisis IA/mes + registro manual ilimitado + resumen/metas/macros). Tu propuesta estaba bien encaminada; afino titulares, cierro las 3 decisiones abiertas y añado variantes de titular por si Rams quiere A/B.

### Decisiones cerradas (respuesta a §9.1)
1. **¿Teasear planes/coaches como Próximamente?** **Sí**, pero con reglas duras: (a) agrupados aparte y **atenuados visualmente** (badge "Pronto" gris), nunca mezclados con los beneficios activos; (b) **sin fecha**; (c) **sin lenguaje médico/terapéutico** — "coach de nutrición" y "planes de comida", nunca "dieta para [condición]". Beneficio de producto: comunica trayectoria/valor futuro sin faltar a la honestidad ni crear expectativa incumplible.
2. **¿Mensual solo o toggle anual $799?** **Mensual solo en este release.** No mostramos "$799/año" hasta que el `price_id` anual esté **creado y cobrable en Stripe** — mostrar un precio que el checkout no puede cobrar sería deshonesto (y romper el checkout es peor que no tener anual). Dejar el toggle **diseñado como fast-follow**: se activa el día que Reqa/QA-Stripe confirme el price anual. Cuando entre, el toggle debe ser honesto (default **mensual**; el usuario elige el anual, sin pre-marcar) y mostrar el desglose real ("$799/año — equivale a $66/mes").
3. **Copy final:** abajo.

### Variante `plans` (comparativa)
- **Titular (no-Pro):** "Tu registro, sin límites" *(alt A/B: "Deja de contar análisis")*
- **Subtítulo:** "Con Pro analizas todas tus comidas con IA y ajustas cada estimación hasta que quede justa. Lo demás sigue siendo tuyo, gratis."
- **Comparativa (honesta — solo lo real de HOY):**
  | | Free | Pro |
  |---|---|---|
  | Análisis de foto con IA | 10 / mes | Ilimitado |
  | Reanálisis con corrección ("son 2 tacos de pastor") | — | Sí |
  | Registro manual | Ilimitado | Ilimitado |
  | Resumen diario, metas y macros | Sí | Sí |
- **Bloque "Próximamente en Pro"** (visualmente atenuado, separado de la tabla, badge "Pronto"; **sin fecha, sin nada médico**):
  - Coach de nutrición con IA
  - Planes de comida según tu objetivo
  - Reportes semanales con recomendaciones
- **Precio:** "$99 MXN/mes" (cifra con `.num`) · microcopy: **"Cancela cuando quieras. Conservas tus datos siempre."**
- **CTA primario:** "Hazte Pro — $99 MXN/mes". **Secundario:** "Ahora no" (cierre neutro, sin culpa).
- **isPro:** titular "Tu plan Pro"; CTA "Administrar suscripción" (`/api/portal`); si `cancel_at_period_end`: nota "Seguirás siendo Pro hasta el fin del periodo; luego pasas a Free. Tus datos se conservan."

### Variante `limit` (cuota agotada — tono empático, NO punitivo ni celebratorio)
- **Titular:** "Ya usaste tus 10 análisis con IA de este mes" (factual y calmado; **quitar el 🎉**). *"Ya usaste" reconoce el uso sin sonar a castigo ni a "te quedaste sin".*
- **Cuerpo:** "Puedes seguir registrando a mano gratis e ilimitado, o pásate a Pro para analizar con IA sin contar."
- **CTA primario:** "Hazte Pro — $99 MXN/mes"
- **Secundario:** "Seguir con registro manual" (`onManual`) *(nombra la acción y su beneficio; mejor que un "a mano" seco)*
- **Terciario/cerrar:** "Tus análisis se reinician el {resetLabel}" (tranquiliza: el gratis continúa) / "Cerrar" si no hay fecha.

> **Nota de tono transversal:** el paywall vende la **promesa** (olvídate del límite, ajusta hasta que quede justo, conservas tus datos), no una lista de features. El "Próximamente" es honestidad sobre trayectoria, no promesa. Todo alineado con `plan/E-monetizacion-producto.md` §3 y `plan/vision-roadmap-priorizado.md` §3.

## 6. Layout

- **`plans`**: header (titular `.c-title` + subtítulo `.c-subtitle`) → dos tarjetas Free/Pro (Pro con badge + destacada) → fineprint (`.plan-fineprint`, con `.num` en el precio) → acciones (`.plan-actions`: CTA primario `.btn-primary` full-width + "Ahora no" `.link-btn`). isPro → tarjeta Pro + "Administrar suscripción".
- **`limit`**: titular `.c-title` → cuerpo `.c-body` → `.plan-actions` (Pro / a mano / reinicio). Sin tabla.
- Ambas dentro del bottom-sheet `.modal` existente.

## 7. Dark, accesibilidad, microinteracciones

- **Dark:** todo por token; la tarjeta Pro (borde `--brand` + `--brand-tint`) contrasta en ambos temas. Verificación de Rams igual que las 4 pantallas.
- **A11y:** `role="dialog"` + `aria-modal` (ya existen), foco inicial al titular/CTA, targets ≥44px (`.btn` cumple; el "Ahora no"/cerrar como `.link-btn` con área ≥44px), `:focus-visible` canónico, íconos decorativos `aria-hidden`, la tabla/comparativa legible por lector de pantalla (usar lista/def semántica, no solo color: el estado incluido/no se refuerza con texto o `aria-label`, no solo con ícono).
- **Microinteracción:** entrada del sheet sutil (reusar el patrón existente), sin sacrificar rendimiento. Nada de confeti.

## 8. Checklist anti-dark-patterns (aceptación)

- [ ] "Ahora no"/cerrar siempre visible en ambas variantes.
- [ ] Ruta gratis (registro a mano) siempre ofrecida en `limit`.
- [ ] Fecha de reinicio del Free visible en `limit`.
- [ ] "Cancela cuando quieras, sin permanencia" en `plans`.
- [ ] Cero urgencia falsa / cuenta regresiva / casillas pre-marcadas.
- [ ] Beneficios = solo lo real de HOY; futuros marcados "Próximamente".
- [ ] Sin promesas médicas.

## 9. Decisiones abiertas (para el sign-off)

1. **Drucker:** ¿teaseamos "planes/coaches especializados" como Próximamente? · ¿mensual solo o toggle mensual/anual $799? · copy final de titulares/CTA.
2. **Rams:** componente canónico nuevo vs. compongo con `.c-card`+tokens · token de superficie premium sí/no · badge Pro como clase de sistema.
3. **Lugia:** aprobar el spec y el alcance (¿este release incluye anual o lo dejamos para después?).

## 10. Plan de construcción (tras aprobación) y verificación

- Editar SOLO `components/UpgradeModal.js` (presentación) + posibles clases nuevas en `app/globals.css` (coordinar con CTO por ser archivo compartido) o el componente que defina Rams.
- **No-regresión:** probar los 2 flujos (suscribir Free→checkout; Pro→portal; `cancel_at_period_end`; `limit`→a mano/cerrar). `npm run build` verde. QA de Nielsen + pasada visual (Light/Dark) de Emiliano.
- Deploy como parte del release de consistencia (commit selectivo, sin tocar coach/api/lib/sql), tras go de Lugia.
