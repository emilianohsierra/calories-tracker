# QA visual — UpgradeModal (revisión Rams para Casey)

**Revisor:** Rams (skm3lj3d) · **Autor del código:** Casey · **Fecha:** 2026-08-01
**Alcance:** `components/UpgradeModal.js` + append `.pw-*` en `app/globals.css` (líneas ~985-1066).
**Método:** QA a nivel de código contra el sistema vivo (tokens, dark `[data-theme]`, spec del paywall). Build limpio **verde**. *No* rendericé píxeles en navegador en este entorno → dejo marcados los ítems "VERIFICAR EN DEVICE" para el eyeball final (Casey/Nielsen).
**Veredicto general:** muy sólido, premium y honesto. Consume el sistema correctamente; dark automático por token. Un (1) ajuste de nivel medio (la tabla) y varios nits. Nada bloqueante.

Leyenda: **OK** · **AJUSTE** (con fix) · **VERIFICAR**.

---

## 1. Uso de tokens
- **OK** — Prácticamente todo tokenizado (`--brand-strong`, `--text/-2/-3`, `--surface/-2`, `--brand-tint`, `--border`, `--r-*`, `--s*`, `--touch`, `--overlay`). Dark automático.
- **AJUSTE A2 (bajo)** — `.plan-table thead th { background: var(--page) }`: en dark `--page` (#0B0D10) queda **más oscuro que la card** (#14171C) → invierte la jerarquía (el header de tabla debería resaltar, no hundirse). Fix: `background: var(--surface-2)`.
- **AJUSTE A3 (bajo)** — `.plan-fineprint { color: var(--ink-muted) }` usa token legacy. Fix: `var(--text-3)` (canónico; ya son equivalentes pero unifica).

## 2. Tipografía / jerarquía
- **OK** — Jerarquía clara y premium: eyebrow (12/700 upper brand) → título (22/700, -0.3px) → sub (14 text-2) → bullets (14.5/13). Lee tipo Linear/Stripe.
- **AJUSTE A4 (bajo)** — Tamaños con medio pixel (`14.5`, `12.5`, `10.5px`) redondean distinto por DPR y no son del sistema. Fix: enteros (`14`/`13`/`11`).
- **Nota (opcional)** — El paywall define su propia rampa (`pw-title` 22 vs `.c-title` 17). Es correcto que el headline del paywall sea mayor; solo se documenta que es una rampa bespoke, no las clases `.c-*`. No requiere cambio.

## 3. Spacing
- **OK** — `--s2/--s3/--s4` consistentes entre bloques; ritmo vertical calmado. `pw-modal padding 18/18/22` hardcodeado pero razonable.

## 4. Radios
- **OK** — `--r-md`/`--r-pill` en badge, ícono-chip, soon-box, close. Sheet hereda 18px del sistema. Consistente.

## 5. Bloque "Próximamente" atenuado
- **OK (contenido)** — `.pw-soon` en `--surface-2`+border, badge "Pronto" neutro (`--text-3`/`--surface`/`--border`), **sin fecha, sin lenguaje médico**, separado de la tabla. Cumple el spec y la regla anti-dark-pattern.
- **VERIFICAR A5** — El item usa `opacity:.72` sobre todo el contenedor; el texto secundario (`--text-2`) atenuado en dark podría caer bajo AA (4.5:1). Verificar contraste computado en dark; si falla, cambiar `opacity` por color `--text-3` a opacidad completa (mismo look, contraste garantizado).

## 6. Estados busy / error (checkout)
- **OK** — `busy`: CTA muestra spinner + "Un momento…" y se deshabilita; se deshabilitan close, secundarios y el click en overlay (`!busy`). `error`: `.error-banner` con `role="alert"`, colocado junto a la acción. `go()` resetea `busy` en error y navega en éxito. Robusto.
- **AJUSTE A6 (bajo, sistema)** — `.pw-spin`/`.spinner` no está en el guard de `prefers-reduced-motion` (solo `.ring-anim` lo está) → gira aunque el usuario pida menos movimiento. Fix: incluir `.spinner` en el guard reduced-motion de `globals.css`. *(Es token/sistema — lo puedo tomar yo o Casey en el mismo append; coordinar para no chocar.)*

## 7. Tabla Free vs Pro
- **OK (a11y/semántica)** — `<table>` con `<caption>`, `<thead>`, `<th scope="col">`; celda Pro en `--brand-strong` 700; estados por texto ("—"/"Sí"/"Ilimitado"), no solo color.
- **AJUSTE A1 (MEDIO — el de más impacto)** — Es el elemento **menos premium** del sheet: la cuadrícula con borde en **todas** las celdas lee "hoja de cálculo", no Apple Health/Linear. Fix propuesto (solo `.pw-table`, sin tocar el JSX):
  - Quitar bordes internos y el borde exterior; usar **solo separador por fila** `border-bottom: 1px var(--border)`.
  - Más aire vertical en celdas (`padding: 10px 12px`).
  - Columna **Pro** con fondo sutil `var(--brand-tint)` (th+td) para destacarla sin bordes.
  - Alinear Free/Pro a la derecha (o centrado) de forma consistente (ya centra col 2-3).
  Con eso la comparativa sube al nivel del resto del sheet.

## 8. Bottom-sheet móvil vs centrado desktop
- **OK** — Hereda `.modal-overlay`/`.modal` del sistema: `align-items:flex-end` + radio `18 18 0 0` en móvil; `@media(min-width:600px)` centra y redondea completo. `pw-modal max-width 480`, `max-height:92vh; overflow-y:auto` → scroll interno correcto.
- **VERIFICAR A10 (conversión, no dark-pattern)** — En `plans` el precio+CTA quedan tras bullets + soon + tabla → en móvil hay que **scrollear** para llegar a "Hazte Pro". El cierre siempre está arriba (sin dark-pattern), pero el CTA bajo el fold puede bajar conversión. Opcional (Drucker/Casey): precio+CTA sticky al fondo del sheet, o un CTA adicional arriba. Decisión de producto.

## 9. Foco / Escape / scroll-lock
- **OK** — Escape cierra; trampa de foco Tab/Shift-Tab; `body overflow hidden` al abrir y restaurado al cerrar; retorno de foco a `prevActive` en unmount; `role="dialog"` + `aria-modal` + `aria-labelledby="pw-title"` presente en las 3 ramas.
- **AJUSTE A7 (bajo)** — Escape cierra incluso con `busy` (el overlay-click sí respeta `!busy`). Consistencia: guardar Escape con `if (busy) return` antes de cerrar.
- **AJUSTE A8 (nit a11y)** — Foco inicial va al botón **Cerrar (X)**. Es seguro, pero un lector de pantalla no oye el contexto primero. Opcional: enfocar el contenedor del diálogo (`tabindex=-1` en `.pw-modal`) o el título, y/o añadir `aria-describedby` al subtítulo.
- **AJUSTE A9 (nit táctil)** — `.plan-actions .link-btn { min-height:36px }` → "Ahora no" / terciario quedan bajo 44px. Tolerable porque el header tiene un close de 44, pero súbelo a `var(--touch)` si el layout lo permite.
- **Edge (bajo)** — Con `busy`, todos los botones quedan `disabled` → la trampa de foco no encuentra focusables y el foco puede quedar en un botón deshabilitado. Transitorio; no bloquea.

## 10. Nivel "sistema vivo" (Apple Health / Linear)
- **OK** — Íconos solo del set canónico (`message/star/clipboard/camera/sparkles/close/pencil` — todos existen en `Icon.js`, cero emoji). Precio con `.num` (tabular). Bullets con ícono en chip `--brand-tint`. Reaseguro presente en ambas variantes. Anti-dark-patterns completo (cierre visible, ruta gratis en `limit`, fecha de reinicio, "cancela cuando quieras", sin urgencia falsa, "Próximamente" marcado).
- **El único gap real para llegar al nivel Apple Health/Linear es A1 (la tabla).** Resuelto A1 + los nits, queda impecable.

---

## Resumen de acción para Casey
| # | Sev | Ítem | Fix |
|---|---|---|---|
| A1 | media | Tabla estilo spreadsheet | Solo separador por fila + col Pro con `--brand-tint` + más padding |
| A2 | baja | `thead th` bg `--page` se hunde en dark | → `--surface-2` |
| A3 | baja | `.plan-fineprint` token legacy | → `--text-3` |
| A4 | baja | Fuentes con medio pixel | enteros 14/13/11 |
| A5 | verif | "Próximamente" opacity vs AA en dark | color `--text-3` full-opacity o verificar contraste |
| A6 | baja | spinner ignora reduced-motion | añadir `.spinner` al guard (sistema — coordinar) |
| A7 | baja | Escape cierra con `busy` | guardar con `!busy` |
| A8 | nit | foco inicial en X | enfocar diálogo/título |
| A9 | nit | link-btn 36px táctil | subir a 44 si cabe |
| A10 | verif | CTA bajo el fold en `plans` | sticky/CTA arriba (Drucker) |

Todo lo demás: **OK**. Gran trabajo — honesto, tokenizado y dark-safe; con A1 sube a nivel premium pleno. Pendiente el eyeball en device (Light/Dark, iPhone/desktop) que no puedo hacer desde aquí.
