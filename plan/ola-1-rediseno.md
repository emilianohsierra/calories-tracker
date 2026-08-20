# Ola 1 — Rediseño visual/UX (primera ola de ejecución)

**Rol:** UX/UI Lead — líder de diseño de esta fase · **Autor:** Rams Design (`skm3lj3d`)
**Para:** Director Lugia (`mwao6a57`) · **Builders (paralelo):** Ford / CTO Torvalds (`gkmi48v7`)
**Fecha:** 2026-08-19 · **Estado:** DIRECCIÓN — listo para repartir builders (NO deploy aún)
**Base de sistema:** `plan/rediseno-sistema-diseno.md`, `plan/ola1-spec-diseno.md`, tokens vivos en `app/globals.css`.
**Auditorías que consume:** `plan/consistencia-premium-app.md` (Casey), `plan/qa-integral-ux-hallazgos.md` (Nielsen) + **auditoría fresca 2026-08-19** (3 exploradores sobre HOME/registro, Coach/Despensa, Educación/Consejo/Mascota).

---

## 0. Aclaración de nombre (evitar colisión)

En el código "Ola 1" ya nombró la **capa de sistema de diseño** (tokens teal + dark + iconos), **viva y cerrada** en `app/globals.css` + `components/ui/Icon.js`. Esta epica — la que Emiliano eligió ahora — es la **primera ola de EJECUCIÓN** sobre ese sistema. En este doc "Ola 1" = esta ola de ejecución.

---

## 1. SCOPE de Ola 1 — corregido por la auditoría fresca

> **Hallazgo que cambia la tesis:** la deuda visual "vieja" **ya está mayormente pagada**. La auditoría del 2026-08-19 confirmó que **no** hay banner emoji legacy, **no** hay azul pre-rebrand, **no** hay emojis-como-UI en HOME/registro/coach/despensa/educación (el set `Icon` ya manda), las cifras usan `.num`, los CTAs son `.btn-primary` teal, y HOME ya monta el saludo `GreetingHeader` (no es huérfano). La "última milla" que queda es distinta a lo que asumía Casey.

**Tesis real de Ola 1:** **endurecimiento de accesibilidad (AA) + micro-consistencia** — cerrar los últimos huecos de foco/teclado, targets 44px, roles tipográficos ad-hoc, tokens legacy sueltos en CSS, y una superficie duplicada (Consejo del día). Todo **alto impacto en calidad percibida / bajo riesgo, deploy-safe, sin tocar lógica.**

### Dentro (IN)
- **A11y de modales**: foco inicial/trampa/Escape/retorno de foco donde falte (hay un hook probado `lib/ui/useModalA11y.js` ya adoptado por 6 modales; falta el más usado).
- **A11y del chat del coach**: región `aria-live` para las respuestas del coach; retorno de foco al composer tras enviar.
- **Targets táctiles 44px**: controles por debajo del `--touch` (`.composer-send`, `.usage-badge`, `.goal-edit-btn`, instancias de `.link-btn`).
- **Consolidación de "Consejo del día"**: dos implementaciones divergentes (`components/home/ConsejoDelDia.js` montado vs `components/CoachTipCard.js` legacy) → una sola, con roles canónicos.
- **Higiene de tokens en CSS**: alias legacy (`--ink-secondary/--ink-muted` → `--text-2/--text-3`), sombras hardcodeadas (`.fab`), radios de burbuja, CSS muerto del composer viejo.
- **Roles tipográficos**: sustituir tamaños inline ad-hoc por `.c-title/.c-subtitle/.c-body/.c-eyebrow` (transversal, por archivo).
- **Consistencia de educación**: feedback de quiz (RepasoCard vs LeccionQuiz), contraste del label "dominado", `alert()`+emoji de CoachTipCard.
- **Micro-consistencia despensa**: colisión de iconos de categoría, tamaños de sello <13px, variante dark de sellos regulatorios.

### Fuera (OUT) — explícito
- **Stripe / lealtad: CONGELADO** por orden de Emiliano. Ni código ni UI de pago/lealtad. La `LealtadCard` en vivo se deja intacta.
- **Gamificación V2**: otra epica, después.
- **Bugs FUNCIONALES de Nielsen** (B1 despensa fabrica datos, B2/B3 botones muertos del coach, I1 lista huérfana, I2–I6 pérdida de datos/re-tecleo): tocan store/handlers/API → riesgo medio, **fuera de Ola 1** (§5, track paralelo).
- **Inter (`next/font`)**: alto valor pero blast-radius transversal → slice propio al final, tras verificación (§4 S8).

### Líneas rojas (invariantes en TODO slice)
- **TCA:** nunca vergüenza por peso, nunca presión de dieta, nunca celebrar comer poco. Mascota/gamificación reaccionan a conducta, no a peso.
- **Deploy-safe:** sin breaking changes; degrade elegante; lo transversal detrás de verificación/flag.
- **A11y AA** y `prefers-reduced-motion` respetados (ya correcto en TypingIndicator/CoachOrb/Mascota).
- **Worktree compartido:** commits nuevos, **NUNCA `--amend`**; archivos disjuntos por slice; secrets scan; build + vitest verdes antes de reportar.

---

## 2. AUDIT

### 2.1 Sistema (tokens) — ✅ sano, NO se rediseña
Color teal (`--brand #0E7C6B`/dark `#2BC4AC`), superficies, texto, nutrientes+tracks, estados, espaciado `--s*`, radii `--r-*`, sombras `--shadow-*`, foco `--ring-focus`, `--touch 44px`, roles `.c-*`, `.num`, movimiento con guard reduced-motion. **Pendiente único de sistema:** Inter (hoy `system-ui`). Ola 1 es **adopción**, no redefinición.

### 2.2 Pantallas — hallazgos reales (auditoría 2026-08-19)

**ALTO impacto / BAJO riesgo**
- **Registro** `components/AddMealModal.js:128-129` — el modal más usado **no gestiona foco/teclado**: sin foco inicial, sin trampa, sin Escape, sin retorno de foco (solo cierra por click en overlay). Los otros 6 modales ya usan `useModalA11y`. → **S1 (top slice).**
- **Coach chat** `app/coach/page.js:366` — el hilo de burbujas **no tiene `aria-live`**; la respuesta final del coach nunca se locuta (solo el TypingIndicator, que desaparece). Falta retorno de foco al composer tras `send`. → **S2.**
- **Consejo del día** — **dos implementaciones divergentes**: `ConsejoDelDia.js` (montado en HOME `app/page.js:214`) reconstruye todo inline sobre `.card` y **no** usa roles canónicos (`:49` eyebrow a mano, `:53` `.c-title` sobreescrito), mientras `components/CoachTipCard.js` sí usa `.tip-card/.tip-eyebrow` **pero está muerto** (nadie lo monta). → **S4.**

**BAJO impacto / BAJO riesgo (higiene)**
- Targets <44px: `.composer-send` 36px (`globals.css:959`), `.usage-badge` (`:608`), `.goal-edit-btn` (`:168`), `.link-btn` sin min-height (Salir/Editar plan/Reintentar del coach).
- Tokens legacy en CSS: `.nav-btn`→`--ink-secondary` (`:119`), `.icon-btn`→`--ink-muted` (`:357`) en vez de `--text-2/--text-3`.
- Sombras hardcodeadas: `.fab`/`.fab-gallery` rgba (`:429/:441`) → `--shadow-2/3`.
- CSS muerto: reglas `.coach-composer input/.btn` (`:843-844`) del composer viejo. Radios de burbuja hardcodeados (`:840-841`).
- Educación: `CoachTipCard.js:23` `alert('Consejo copiado 📋')` (emoji + alert nativo); feedback de quiz divergente (RepasoCard no marca la incorrecta, LeccionQuiz sí); `MiAprendizaje.js` label "dominado" contraste AA frontera + títulos inline; headers de modal `h2 fontSize:18` ad-hoc.
- Despensa: `lib/pantry/constants.js:8-12` `frutas/lacteos/bebidas` comparten icono `droplet` (categorías idénticas visualmente); sellos `<13px` (`ExpiryPill/ConfidenceBadge`); Nutri-Score/NOM hex regulatorios sin variante dark (defendible).
- Mascota/Orb: rgba decorativos hardcodeados (`CoachOrb.js:20-21`, `Mascota.js:153`) — aceptable, opcional.

**Correcto (sin acción):** reduced-motion en TypingIndicator/CoachOrb/Mascota; QuickActions/PantryCard 44px + aria; MessageRenderer sanitiza y mapea a roles; ConfidenceBadge/ExpiryPill "nunca solo color".

---

## 3. DIRECCIÓN de Ola 1 (a11y-first + micro-consistencia)

Principio operativo: **"la última milla premium se juega en el detalle accesible."** El look ya es teal-sereno; lo que falta es que **cada interacción sea impecable** (teclado, foco, target, lector de pantalla) y que **no queden dos formas de decir lo mismo** (Consejo duplicado, tokens legacy). Reglas:

1. **Solo presentación.** Ningún slice toca lógica, datos, auth, IA, Stripe/lealtad.
2. **Reusa lo probado.** El hook `useModalA11y` y el set `Icon` ya existen: adoptar, no reinventar.
3. **Token, no hex. Icono, no emoji. Cifra tabular. Rol tipográfico, no inline.**
4. **A11y dentro del slice:** contraste AA, 44px, foco, aria, reduced-motion se verifican en el mismo slice.
5. **Un foco por pantalla; una sola implementación por superficie.**
6. **Deploy-safe:** degrade elegante; transversal (Inter) al final.

---

## 4. PLAN POR REBANADAS (priorizado, desplegable independiente)

Archivos **disjuntos** por slice para repartir sin colisión. **Nota de worktree:** varias mejoras de higiene viven en `app/globals.css` (recurso compartido) → se agrupan en **un** slice (S3) con **un** dueño, para no chocar.

| # | Slice | Archivos (disjuntos) | Impacto | Riesgo | Dep. |
|---|-------|----------------------|---------|--------|------|
| **S1** | **A11y modal de Registro** — adopta `useModalA11y` en AddMealModal (foco/trampa/Escape/retorno, guard mientras `saving`) | `components/AddMealModal.js` | ALTO | BAJO | — (**arrancado**, §6) |
| **S2** | **A11y Coach chat** — región `aria-live` para burbujas del coach + retorno de foco al composer + "Reintentar" a 44px | `app/coach/page.js` | ALTO | BAJO | — |
| **S3** | **Higiene CSS (globals)** — targets 44px (`.composer-send/.usage-badge/.goal-edit-btn/.link-btn`), alias `--ink-*`→`--text-*`, sombras `.fab`→token, radios de burbuja→token, borra CSS muerto del composer | `app/globals.css` | MEDIO | BAJO | dueño único |
| **S4** | **Consolidar "Consejo del día"** — `ConsejoDelDia` a roles canónicos (`.c-eyebrow/.c-title`), y retirar/deprecary `CoachTipCard` muerto | `components/home/ConsejoDelDia.js`, `components/CoachTipCard.js` | MEDIO-ALTO | BAJO | — |
| **S5** | **Consistencia Educación** — decisión de sistema sobre feedback de quiz (RepasoCard vs LeccionQuiz), contraste label "dominado", `alert()`+emoji de CoachTipCard→toast/Icon, headers a rol | `components/coach/RepasoCard.js`, `LeccionQuiz.js`, `MiAprendizaje.js` | MEDIO | BAJO | — |
| **S6** | **Micro-consistencia Despensa** — iconos de categoría únicos (`frutas/lacteos/bebidas`), tamaños de sello a escala, variante dark de sellos | `lib/pantry/constants.js`, `components/pantry/ExpiryPill.js`, `ConfidenceBadge.js`, `Sustituciones.js`, `ProductNomInfo.js` | BAJO | BAJO | — |
| **S7** | **Roles tipográficos (transversal)** — sustituir tamaños inline por `.c-*` en DayProgress/MacroBar/MealList/TrainingRow/MealCard + headers de modal | varios componentes (checklist por archivo) | MEDIO | BAJO | coordinar con S1/S2/S4 en archivos compartidos |
| **S8** | **Inter vía `next/font`** (transversal, blast-radius) | `app/layout.js`, `app/globals.css` | ALTO | MEDIO | tras verificación |

**Reparto paralelo sugerido:**
- **Rams (yo):** S1 ✅ (`692d132`) → S4 ✅ (`d9d944b`) → S7-a cuando se coordine.
- **Builder A (Ford):** S2 (Coach a11y) → luego S5 (+ **absorbe S7-b**, ver §4.1).
- **Builder B (CTO):** S3 (globals, dueño único) → luego S6.
- **S7** particionado para evitar colisión (§4.1). **S8** al final.

### 4.1 S7 — detalle PREPARADO (roles tipográficos), particionado sin colisión

Auditados los `fontSize` inline reales. Regla: **adoptar rol donde existe uno; dejar los tamaños de display (héroe/cifra grande) que son intencionales.** Partición por dueño para no chocar en el worktree compartido:

**S7-a — Rams (archivos libres, sin solape):**
- `components/home/MacroBar.js:13` (`13/500/text-2`) → `.c-subtitle` (match exacto); `:14` cifra → `.num` + peso local.
- `components/DayProgress.js:58` (`12/600/text-2`) → caption a `.c-subtitle`.
- `components/MealList.js:56,59` (botones `12`) → `.c-subtitle`.
- `components/home/TrainingRow.js:25` (`13`) → `.c-subtitle`.
- `components/coach/cards/MealCard.js:40` (badge `12/600/brand-strong`) → `.c-eyebrow` + color.

**S7-b — lo ABSORBE Builder A dentro de S5 (mismos archivos, cero colisión):**
- Headers de modal `h2 fontSize:18`: `components/coach/RepasoCard.js:34`, `LeccionQuiz.js:46`, `MiAprendizaje.js:91` → tratamiento de título de diálogo consistente (base `.c-title`).
- `components/coach/MiAprendizaje.js:104,121` (`14`) → `.c-body`; + el fix de contraste del label "dominado" (ya en S5).

**DEJAR (display intencional, no es violación de rol):** `DayProgress.js:36` (héroe kcal `40`), `MiAprendizaje.js:133` (cifra `20`), y el `h2` héroe de `ConsejoDelDia` (`20`, ya con `.c-title` de base).

> Nada de S7 se commitea hasta que Lugia confirme el reparto (toca varios archivos, algunos del carril S5). Este bloque es el checklist turn-key para ejecutarlo sin pisar a nadie.

### 4.2 S8 — Inter vía `next/font/google` (PREPARADO turn-key, ejecutar AL CIERRE)

**Ejecutar solo después de que el batch del CTO esté vivo y verificado (Ready 307).** Blast-radius alto: cambia la fuente base de toda la app. `next/font` **auto-hospeda** la fuente (la sirve desde el propio origen en `/_next/static`, sin request a Google en runtime) → **cero CLS por red** y sin bloqueo de render.

**Estado actual (verificado 2026-08-19):** Next `^15.3.4`, App Router, `app/layout.js` (`RootLayout` con `<html lang="es">`/`<body>`), `next/font` **no usado aún**, y `app/globals.css:34` fija `font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;`.

**Archivos que toca (2):**
1. `app/layout.js` — **archivo libre** (no es de S3). Aquí va TODO el cableado de `next/font`.
2. `app/globals.css:34` — **una sola línea** (la declaración `font-family`). ⚠️ **Es carril del CTO (S3)** → la edición de esa línea la hace/aprueba el dueño de `globals.css`, no Rams. Coordinar el handoff de ese one-liner.

**Cableado (en `app/layout.js`), turn-key:**
```
// pseudo — NO commitear hasta el cierre
import { Inter } from 'next/font/google';
const inter = Inter({
  subsets: ['latin'],          // español (á é í ó ú ñ ü ¿ ¡) está en 'latin'; NO hace falta 'latin-ext'
  display: 'swap',             // muestra fallback y cambia a Inter al cargar (evita texto invisible/FOIT)
  variable: '--font-inter',    // expone CSS var para que globals.css la consuma (mantiene la cascada)
  // adjustFontFallback: true  // DEFAULT en next/font: genera fallback size-adjusted (métricas tipo Arial)
  //                             → minimiza el salto de layout en el swap (CLS≈0)
});
// aplicar la variable en <html> (no en <body>) para que exista global, incl. portales/modales:
<html lang="es" className={inter.variable}>
```
Inter de `next/font/google` es **variable font** → cubre 400/500/600/700 (los pesos que usa la app) sin enumerar `weight`. `next/font` **preload** automático del subset usado.

**Edición en `globals.css:34` (handoff al dueño de S3):**
```
font-family: var(--font-inter), system-ui, -apple-system, 'Segoe UI', sans-serif;
```
El stack de fallback se conserva íntegro detrás de la var → si Inter no cargara, degrada exactamente al look actual.

**Cómo evitamos CLS / FOUT:**
- **Auto-hosting** (next/font) → sin request externo, sin render-blocking, sin flash por latencia de red.
- **`adjustFontFallback` (default on)** → el fallback queda ajustado en métricas a Inter, así el swap `system-ui → Inter` casi no mueve el layout.
- **`display: 'swap'`** → nunca texto invisible; el brevísimo FOUT restante es de fallback→Inter, ya minimizado por el punto anterior.
- **`variable` + fallback completo en el `font-family`** → degradación idéntica al estado actual si algo fallara.
- La app usa números tabulares vía `.num` (`font-variant-numeric`), independiente de la familia → **no** se rompe con el cambio de fuente.

**Riesgos y verificación:**
- ⚠️ **Colisión de carril:** la línea `globals.css:34` es de S3 (CTO). Ejecutar S8 **con** el dueño de `globals.css` o handoff explícito del one-liner. `app/layout.js` sí es libre.
- ⚠️ **PWA/offline:** los archivos de fuente viven en `/_next/static`. Verificar que el **service worker** los cachee (precache) para que la fuente no falle offline; si el SW es allowlist por ruta, añadir el patrón de fuentes. **Revisar `PushRegister`/SW config.**
- **Anti-flash de tema** (`THEME_INIT` en `<head>`): independiente de la fuente; no se toca.
- **QA:** `npm run build` + confirmar visualmente que Inter **realmente** renderiza (no fallback silencioso) en HOME/Coach/Despensa, claro y dark; vitest 805/805; 0 secretos; commit NUEVO (no `--amend`).
- **Reversible:** revertir = quitar el import/variable en `layout.js` + restaurar la línea de `globals.css`. Sin migración de datos.

---

## 5. Track paralelo FUNCIONAL (fuera de Ola 1 — decisión de Lugia)

Nielsen halló bugs **funcionales** de alto valor que NO son pulido visual (tocan store/handlers/API → riesgo medio):
- **B1** Despensa fabrica 4 productos falsos + escribe en el vacío si la API falla (`lib/pantry/store.js`). 🔴
- **B2** Botón `registrar_foto` del coach no hace nada. 🔴
- **B3** "Agregar a la lista" navega sin escribir → propuesta perdida. 🔴
- **I1** Lista de compras huérfana. **I2–I6** estado vacío como error falso, back-round-trip, re-tecleo de código/etiqueta. 🟠

**Recomendación:** epica separada "Ola 1.5 — funcional". Lo único visual que Ola 1 puede tomar es rediseñar el **estado vacío/error** de la despensa (dentro de S6) una vez el backend deje de fabricar datos.

---

## 6. Primer slice — S1 (ARRANCADO)

**S1 = A11y del modal de Registro (`components/AddMealModal.js`).** Adopta el hook probado `lib/ui/useModalA11y.js` (ya en UpgradeModal/LeccionQuiz/MiProgreso/…): foco inicial al diálogo, trampa de Tab, cierre con Escape, retorno de foco, scroll-lock — con **guard** para no cerrar mientras `saving`. Cambio localizado a un archivo; cero lógica/datos/IA/Stripe. Estado del arranque (hash, build/test) al pie de este doc tras verificar.

---

## 7. Verificación (todo slice, antes de reportar)
`npm run build` ✓ · `npm run test` (vitest verde) ✓ · secrets scan ✓ · commit NUEVO (no `--amend`) · hash a Lugia para coordinar push con CTO.
