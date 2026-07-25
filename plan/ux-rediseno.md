# Auditoría UX/UI + Dirección de Rediseño Premium — calories-tracker

**Rol:** UX/UI Designer · **Sprint:** Diagnóstico (sin tocar código) · **Fecha:** 2026-07-24

Archivos auditados: `app/page.js`, `components/AddMealModal.js`, `components/DailySummary.js`, `components/MealList.js`, `components/WeekChart.js`, `app/globals.css`, `app/api/analyze/route.js`, `lib/analyze.js`.

---

## 1. Auditoría del flujo actual — dónde se traba el usuario

**Flujo hoy:** Home carga día + semana → FAB "📷 Agregar platillo" abre cámara → `onPickFile` reescala → abre modal → fase `preview` (nota opcional) → el usuario **pulsa "✨ Analizar con IA"** → fase `analyzing` (spinner) → fase `edit` (form de 6+ campos + reanalizar) → "Guardar" → cierra.

Fricciones detectadas:

- **Paso extra innecesario (`preview`).** Tras tomar la foto el usuario debe pulsar otro botón para analizar. La nota para la IA es opcional pero ocupa el foco del paso. Rompe la promesa de "registrar en 15s". `AddMealModal.js:91-113`.
- **Sin onboarding ni meta inicial.** `goal` arranca hardcodeado en `2000` (`app/page.js:15`); un usuario nuevo ve una meta que no es suya y la opción de cambiarla está escondida en un link de texto pequeño ("Editar meta", `DailySummary.js:56`).
- **Dos botones de captura compiten.** FAB primario (cámara, `capture="environment"`) + FAB galería (`🖼️`). En **desktop** `capture` puede abrir webcam o fallar; el usuario no elige antes de invocar la cámara. Jerarquía confusa. `app/page.js:141-154`.
- **Estado de carga pobre.** `analyzing` es solo un spinner + texto (`AddMealModal.js:115-120`). La llamada de visión tarda varios segundos → se percibe como "colgado". Sin skeleton del resultado ni progreso.
- **Formulario abrumador.** Al llegar a `edit` se muestran de golpe título, descripción, tipo, hora y 4 campos numéricos (`AddMealModal.js:122-167`). Debería presentarse como resultado legible con edición progresiva.
- **"No es comida" cuesta una llamada.** El backend valida `es_comida=false` **después** de gastar la API (`app/api/analyze/route.js:70-75`) y devuelve un error genérico en `preview`. Costo real desperdiciado + callejón sin salida.
- **Sin confirmación de éxito.** Guardar/eliminar solo cierra o recarga; no hay toast ni feedback ("Guardado ✓"). El meter tampoco anima el cambio de forma perceptible.
- **Targets táctiles chicos.** Botón borrar `🗑` y `icon-btn` con padding 4px (`globals.css:353-361`) quedan bajo el mínimo de 44×44px. Confirmación inline "Borrar / No" con texto de 12px.
- **Iconografía por emoji.** 🍽️ 📷 🖼️ ✨ 🔁 🗑 — inconsistente entre plataformas y percibido como no-premium.
- **Navegación de fecha limitada.** Solo flechas ‹ ›; no hay "Hoy" para volver ni selector de fecha. `app/page.js:102-116`.
- **Sin foco visible.** No hay `:focus-visible` en el CSS → navegación por teclado invisible (falla WCAG).

---

## 2. Flujo ideal

### Onboarding (primer arranque, 3 pasos, saltable)
1. **Bienvenida + propuesta de valor** en español: "Cuenta tus calorías con una foto — hecho para comida mexicana y latina".
2. **Meta calórica guiada:** objetivo (perder / mantener / ganar) → sugerimos una meta editable. Elimina el `2000` genérico y personaliza desde el minuto uno.
3. **Primera foto:** CTA directo a la cámara (o foto de ejemplo) mostrando cómo se edita y guarda.
> (Login/cuenta llegará con multiusuario; dejar el hueco previsto en la navegación.)

### Registrar una comida en <15s (acción central)
1. **Un solo FAB** → hoja de acción "Tomar foto / Elegir de galería" (o cámara directa en móvil).
2. Foto capturada → reescala → **auto-análisis inmediato** (sin el botón "Analizar"). La nota para la IA queda accesible *durante* el análisis, no antes.
3. Mientras analiza: **skeleton del resultado** con la foto ya visible + barra de progreso indeterminada con texto ("Estimando calorías…").
4. **Resultado como tarjeta legible:** título grande, **kcal destacadas**, macros en píldoras, chip de confianza. Botón **Guardar** primario visible. "Ajustar valores" y "Corregir a la IA" colapsados detrás de un toggle.
5. Un tap **Guardar** → toast "Guardado ✓" + el meter del día sube con animación.

Resultado: **1 captura → 1 confirmación**, edición solo si hace falta.

---

## 3. Dirección visual premium
Referencias: Apple Health (jerarquía de datos + dark), Oura (calidez, anillos de progreso), Stripe (elevación sutil, tipografía impecable).

- **Tipografía:** adoptar **Inter** (variable) o mantener `-apple-system` con escala modular fija (12/13/15/17/21/28/48). Aplicar `font-variant-numeric: tabular-nums` a **todas las cifras** (kcal, macros, gráfica) para que no "bailen". Pesos 400/500/600/700.
- **Color:** conservar base neutra cálida (`#f9f9f7`) pero definir un **acento de marca propio** (el `#2a78d6` es un azul genérico "de plantilla"). Mantener el sistema semántico ok/warn/over ya existente. Tokenizar todo para **dark mode** (`prefers-color-scheme`) — Health/Oura son dark-first.
- **Jerarquía:** el número de kcal del día es el héroe; macros secundarios; sistema de tarjetas con **sombra suave tipo Stripe** en lugar de solo borde. Considerar un **anillo de progreso** (estilo Oura/Apple) en vez de la barra lineal para el resumen diario.
- **Estados:**
  - *Carga:* skeletons, nunca spinner solo.
  - *Vacío:* el `empty-state` actual mejora con ilustración/icono + CTA único.
  - *Error:* inline **con acción de reintento** ("Reintentar"), no un mensaje sin salida.
- **Accesibilidad WCAG-AA:**
  - Contraste texto ≥4.5:1 → **revisar `--ink-muted` (#898781) y los labels de 12px**, probablemente por debajo del mínimo sobre `--surface`.
  - `:focus-visible` en **todos** los interactivos.
  - Targets táctiles ≥44×44px (arreglar `icon-btn`, borrar, nav de fecha).
  - `prefers-reduced-motion` para spinner y transición del meter.
  - Reforzar aria ya presente en `role="meter"` y en la gráfica; la gráfica debe ser usable en **touch** (hoy depende de hover, `WeekChart.js:85`).

---

## 4. Top 5 mejoras (mayor impacto / menor esfuerzo) — 1ª iteración

1. **Auto-analizar al capturar la foto** (eliminar el paso "✨ Analizar con IA") + **skeleton de resultado**. Corta un tap y elimina la principal fricción hacia "<15s". *Esfuerzo bajo.*
2. **Toast de confirmación** al guardar/eliminar + **botón "Reintentar"** en errores del modal. Alta percepción de calidad, casi sin código. *Esfuerzo bajo.*
3. **Accesibilidad base:** `:focus-visible`, targets táctiles ≥44px y **corregir contraste** de textos muted/labels a WCAG-AA. *Esfuerzo bajo.*
4. **Onboarding mínimo de meta calórica** en el primer arranque (adiós al `2000` hardcodeado). Gran salto en retención y personalización. *Esfuerzo medio.*
5. **Salto premium visual:** reemplazar emojis por un set de iconos consistente (Lucide/estilo SF) + **números tabulares** + tokens de **dark mode**. *Esfuerzo medio.*

---

### Nota para el equipo
Todo esto es rediseño de front sobre el flujo actual; **no depende** de resolver los blockers de infra (SQLite/serverless, multiusuario). La mejora #4 (onboarding de meta) y el futuro paywall freemium sí deben coordinarse con Backend cuando exista login. El costo por foto de la API de visión refuerza el punto #1: menos pasos = menos reanálisis desperdiciados.
