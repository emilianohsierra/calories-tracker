# Despensa Inteligente — Diseño UX/UI (fase de diseño, no construir)

**Rol:** UX/UI Lead · **Autor:** Rams Design (skm3lj3d) · **Fecha:** 2026-08-01
**Reconcilia con el sistema VIVO** (extiende, no inventa): tokens de `app/globals.css` (Ola 1 + `[data-theme=dark]`), `components/ui/Icon.js`, cards/primitivos actuales (`.card`, `.chip-action`, `MacroBar`, `ProgressRing`, `.modal` bottom-sheet, `EmptyState`, `Skeleton`, `Toast`, `MealSuggestionCard`).
**Norte:** app moderna de inventario + nutrición (tono Oura/Linear), **no** una tabla. Móvil-first, PWA. Confianza como valor central (badges de confianza).
**Estado:** wireframes en texto + componentes. **NO construir.** Coordinación: CTO (modelo de datos) · Karpathy (qué datos muestra el coach / "¿qué puedo comer?").

> Etiquetas: `[REAL]` ya existe · `[INPUT]` lo captura el usuario · `[IA]` visión/coach · `[V2]` fase posterior · `[?]` pendiente confirmar con CTO/Karpathy.

---

## 0. Principios
1. **Inventario que da confianza, no una hoja de cálculo.** Cada producto es una card con imagen, no una fila. El badge de confianza (verificado / tuyo / estimado-IA) es el corazón de la credibilidad.
2. **Agregar en <15s** con el método que el usuario tenga a mano (escanear / foto de etiqueta / buscar / manual), siempre con un paso **Confirmar** antes de guardar (nunca guardar a ciegas un dato de IA).
3. **La despensa alimenta al coach:** "¿qué puedo comer?" usa lo que TIENES. Cierra el loop inventario → sugerencia → registrar.
4. **Sereno y claro:** un dato protagonista por card, mucho aire, color de nutriente consistente con el resto de la app, dark de primera clase.

---

## 1. PANTALLA "Mi Despensa"

Ruta `/despensa` (nueva). Entrada desde Dashboard y Coach (§6). Móvil-first, scroll vertical.

### 1.1 Wireframe
```
┌─ Header ─────────────────────────────────────────┐
│  ‹  Mi despensa                     [＋ Agregar]  │  título + CTA primario
├─ Buscador ───────────────────────────────────────┤
│  (search) ¿Qué tienes en tu despensa?            │  input pill, foco directo
├─ Filtros (chips scroll horizontal) ──────────────┤
│  [Todos][Proteínas][Carbos][Frutas][Verduras]    │
│  [Lácteos][Snacks][Bebidas][Congelados][Otros]   │
├─ Resumen (opcional, 1 línea) ────────────────────┤
│  24 productos · 3 por caducar                     │  [REAL derivable]
├─ Grid de productos (2 col móvil) ────────────────┤
│  ┌───────────┐  ┌───────────┐                    │
│  │ [imagen]  │  │ [imagen]  │                     │  PantryCard
│  │ Pechuga   │  │ Avena     │                     │
│  │ Bachoco   │  │ Quaker    │                     │
│  │ 450 g  ●v │  │ 1.2 kg ●e │                     │  cantidad + badge confianza
│  │ 165 kcal  │  │ 389 kcal  │                     │  nutrición básica /100g
│  └───────────┘  └───────────┘                    │
│  …                                                │
└─ FAB / TabBar (Coach permanente) ────────────────┘
```

### 1.2 PantryCard — componente estrella (`components/pantry/PantryCard.js` [V-diseño])
Card (extiende `.card`) — **no** fila de tabla:
- **Imagen** del producto (foto de etiqueta o thumbnail de catálogo); placeholder `<Icon name="utensils">` en `--surface-2` si no hay. `[IA/REAL]`
- **Nombre** (`.c-title` truncado 1 línea) + **marca** (`.c-subtitle`, `--text-2`). `[INPUT/IA]`
- **Cantidad disponible** con unidad (`.num` tabular): "450 g", "3 pzas", "1.2 L". `[INPUT]`
- **Badge de confianza** (§2.3) esquina superior de la imagen: ● verificado / ● tuyo / ● estimado.
- **Nutrición básica** compacta: kcal + P/C/G por porción o /100g (`.num`, colores de nutriente). `[REAL/IA]`
- **Indicador de caducidad** (si existe): pill discreta "Caduca en 2 días" en `--warn`/`--over` (§3.3). `[INPUT]`
- Tap → **PantryDetailSheet** (§3): editar cantidad, +Agregar/−Consumir, caducidad, ver nutrición completa, fuente del dato.
- Long-press / botón overflow → acciones rápidas (Consumir 1, Editar, Eliminar).

### 1.3 Buscador y filtros
- **SearchBar** (`components/pantry/PantrySearch.js`): input pill (`--surface-2`, `--r-pill`), ícono `search`, placeholder "¿Qué tienes en tu despensa?", filtra en vivo (client-side sobre el inventario). Botón limpiar (`close`) cuando hay texto.
- **FilterChips**: reutiliza `.chip-action` (scroll horizontal con snap, como QuickActions). Categorías: **Todos · Proteínas · Carbos · Frutas · Verduras · Lácteos · Snacks · Bebidas · Congelados · Otros**. Chip activo = `--brand`/`--brand-tint`. Multi = no (una categoría a la vez) o "Todos". Cada categoría con su ícono lineal.
- Orden: por defecto "por caducar primero" luego alfabético; toggle opcional (`segmented`) recientes/nombre `[V2]`.

### 1.4 Estados
- **Vacío (despensa nueva):** `EmptyState` sereno con ilustración/ícono + copy del coach *"Tu despensa está vacía. Agrega lo que tienes y te digo qué cocinar."* + **CTA primario "Agregar producto"** (abre §2). Nunca lista muda.
- **Sin resultados (buscador/filtro):** "No encontré '{texto}' en tu despensa" + acción "Agregarlo" (lleva al alta con el nombre precargado).
- **Loading:** grid de `Skeleton` cards (shimmer suave, reduced-motion safe).
- **Error de carga:** inline humano + **Reintentar** (patrón del coach). Nunca error técnico.

---

## 2. FLUJO AGREGAR PRODUCTO

FAB/CTA "＋ Agregar" → **AddProductSheet** (bottom-sheet `.modal`) con selector de método arriba, y **siempre** un paso **Confirmar** antes de guardar.

### 2.1 Selector de método (4 vías)
```
┌─ Agregar a tu despensa ──────────────────────────┐
│  ¿Cómo lo agregamos?                              │
│  ┌─────────┐┌─────────┐┌─────────┐┌─────────┐    │
│  │(barcode)││(camera) ││(search) ││(pencil) │    │
│  │Escanear ││ Foto de ││ Buscar  ││ Manual  │    │
│  │ código  ││etiqueta ││         ││         │    │
│  └─────────┘└─────────┘└─────────┘└─────────┘    │
└──────────────────────────────────────────────────┘
```
- **Escanear código** `[IA/?CTO]`: abre cámara con guía de encuadre; al leer el barcode → busca en catálogo (BD nutricional / Open Food Facts `[?CTO/Karpathy]`) → precarga producto → **Confirmar**. Confianza = **verificado** si hay match de catálogo.
- **Foto de etiqueta** `[IA]`: foto → visión extrae nombre/marca/nutrición del panel → precarga → **Confirmar**. Confianza = **estimado-IA**.
- **Buscar** `[REAL/IA]`: buscador de catálogo por nombre → elige resultado → **Confirmar**. Confianza = **verificado** (catálogo).
- **Manual** `[INPUT]`: formulario (nombre, marca, categoría, cantidad+unidad, nutrición básica opcional, caducidad opcional). Confianza = **dato de usuario**.

Reglas: los 4 desembocan en la **misma pantalla Confirmar**; cámara/escáner ocultos si no hay soporte (fallback a Buscar/Manual). Un método por vez.

### 2.2 Paso CONFIRMAR (obligatorio, `components/pantry/ConfirmProduct.js`)
```
┌─ Confirma el producto ───────────────────────────┐
│  [imagen/etiqueta]                                │
│  Nombre     [ Pechuga de pollo            ]       │  editable
│  Marca      [ Bachoco                     ]       │  editable
│  Categoría  [ Proteínas ▾ ]                       │
│  Cantidad   [ 450 ] [ g ▾ ]                       │  .num
│  Caducidad  [ opcional  📅 ]                      │
│  Nutrición /100g  kcal[165] P[31] C[0] G[3.6]     │  editable, colores nutriente
│  ┌ Confianza ──────────────────────────────────┐ │
│  │ ● Verificado · de catálogo                   │ │  badge + fuente (§2.3)
│  └──────────────────────────────────────────────┘ │
│  [ Cancelar ]                 [ Guardar producto ]│
└──────────────────────────────────────────────────┘
```
- Todos los campos **editables** antes de guardar (el usuario corrige a la IA/catálogo). Si edita un valor de un dato "verificado/estimado", su confianza baja a **dato de usuario** en ese campo (honestidad).
- Validación mínima: nombre + cantidad requeridos; nutrición opcional (si falta, se estima o queda "sin dato").
- **Guardar** → toast "Agregado a tu despensa" + vuelve al grid con la card nueva resaltada un instante.

### 2.3 Badge de CONFIANZA (crítico) — `components/pantry/ConfidenceBadge.js`
Sistema de 3 niveles, **consistente en toda la app** (card, detalle, confirmar, sugerencias del coach):
| Nivel | Significado | Visual |
|---|---|---|
| **Verificado** | De catálogo/barcode con match | punto `--ok` + `Icon check` + "Verificado" |
| **Dato de usuario** | Capturado/ editado por el usuario | punto `--brand` + `Icon pencil` + "Tú lo pusiste" |
| **Estimado (IA)** | Extraído por visión, sin verificar | punto `--warn-c` + `Icon sparkles` + "Estimado por IA" |
- En card = solo el punto de color + ícono (compacto, con `aria-label` completo). En detalle/confirmar = punto + etiqueta de texto + 1 línea de fuente ("de la etiqueta que fotografiaste").
- **Nunca solo color** (daltonismo): siempre ícono + texto/aria. Tap en el badge → tooltip/sheet explicando qué significa y cómo mejorar la confianza ("escanéalo para verificar").

---

## 3. INVENTARIO — controles y caducidad

### 3.1 PantryDetailSheet (`components/pantry/PantryDetailSheet.js`)
Bottom-sheet al tocar una card:
```
┌─ [imagen]  Pechuga de pollo · Bachoco   ●v   ✕ ──┐
│  Disponible:   [ − ]  450 g  [ ＋ ]               │  stepper cantidad
│  [  − Consumir  ]        [  ＋ Agregar  ]         │  acciones grandes
│  Caducidad:  12 sep · "Caduca en 2 días" ⚠        │  editable
│  Nutrición /100g: 165 kcal · P31 C0 G3.6         │  MacroBar mini opcional
│  Confianza: ● Verificado — de catálogo            │  ConfidenceBadge full
│  [ Editar producto ]            [ Eliminar ]      │
└──────────────────────────────────────────────────┘
```
- **+Agregar / −Consumir:** botones grandes (≥44px). "−Consumir" abre mini-input de cuánto (o pasos rápidos: ½, 1 porción, todo). Consumir hasta 0 → pregunta "¿Se acabó? Quitar de la despensa o dejar en 0 para recomprar" (enlaza a Lista de compras §5).
- **Editar cantidad:** stepper `[−] N [+]` + edición directa (`.num`, teclado numérico).
- **Editar producto:** reabre Confirmar con los datos precargados.
- Cambios optimistas + toast; error → revertir + Reintentar.

### 3.2 "Consumir" → registro (puente con comidas) `[?Karpathy]`
Opción: al consumir un producto, ofrecer "¿Registrarlo como comida?" → prellena `AddMealModal`/registro con su nutrición. Cierra el loop despensa↔diario. `[V2/?]`

### 3.3 Indicador de CADUCIDAD
- Opcional por producto. Si existe, pill en la card y el detalle:
  - >7 días: sin pill (o gris `--text-3` discreto).
  - ≤3 días: `--warn-c` "Caduca en N días".
  - Vencido: `--over` "Caducó" + sugerencia de quitarlo.
- Resumen superior "N por caducar" filtra a esos productos al tocarlo.
- Nunca alarmante: tono de recordatorio, no de culpa.

---

## 4. "¿QUÉ PUEDO COMER?" (despensa ↔ coach)

Acceso: chip/CTA en Despensa **y** en el Coach (quick action ya prevista). Usa lo que TIENES (`[IA→Karpathy]`).

### 4.1 Wireframe
```
┌─ ¿Qué puedo comer? ──────────────────────────────┐
│  Con lo que tienes y tu meta de hoy:              │
│  ┌──────────────────────────────────────────────┐│
│  │ Pollo a la plancha con avena                  ││  ← reusa MealSuggestionCard
│  │ pechuga · avena · aceite                      ││  ingredientes (de tu despensa)
│  │ 520 kcal · P45 C40 G12                        ││  kcal + macros (colores)
│  │ ● usa 3 de tu despensa      [ Registrar ]     ││  botón Registrar (1 tap)
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │ Otra opción…                                  ││
│  └──────────────────────────────────────────────┘│
│  [ Ver más ideas ]                                │
└──────────────────────────────────────────────────┘
```
- **Reutiliza `MealSuggestionCard`** del coach (ya especificada): título + ingredientes + kcal + proteína + **Registrar**. Extensión: línea "usa N de tu despensa" y, al registrar, **descuenta** las cantidades usadas del inventario (con confirmación) `[?CTO/Karpathy]`.
- Ancla a `macros_pendientes` del día + inventario disponible + restricciones/alergias (filtro duro, Karpathy). Si falta poco para completar la despensa, sugiere el ingrediente para la Lista de compras (§5).
- Estados: loading = skeleton de cards + "Buscando en tu despensa…"; vacío = "Agrega productos y te doy ideas" → CTA Despensa; error = Reintentar.

---

## 5. LISTA DE COMPRAS inteligente (V2 — reservar lugar en nav)

- **V2**, pero dejar el destino en la navegación de Despensa (tab/segmento "Compras" junto a "Despensa") y los enganches: "quitar de despensa → ¿agregar a compras?", "falta para esta receta → agregar".
- Diseño previsto `[V2]`: lista agrupada por categoría, check para marcar comprado, generada desde (a) productos agotados/por caducar, (b) faltantes de "¿qué puedo comer?"/planes, (c) manual. Al comprar → mueve a Despensa (con Confirmar). Compartible.
- En V1: un `EmptyState` "Próximamente: tu lista de compras se arma sola" (atenuado, sin fecha) o simplemente el tab oculto hasta V2. Recomiendo **placeholder visible atenuado** para comunicar trayectoria sin prometer.

---

## 6. ENTRADAS (Dashboard + Coach)

- **Dashboard:** card/acceso "Mi despensa" (con `Icon` de despensa/caja + conteo "24 productos · 3 por caducar") → `/despensa`. Coherente con las cards del dashboard.
- **Coach:** quick action "¿Qué puedo comer?" (§4) + mención contextual ("tienes pollo y avena — ¿te armo algo?"). El coach puede enlazar "Ver mi despensa".
- **Navegación:** si/cuando exista el TabBar (spec de HOME), Despensa puede ser un tab o vivir bajo "Plan". En V1 basta el acceso desde Dashboard y Coach + FAB de agregar dentro de la pantalla.

---

## 7. LIBRERÍA DE COMPONENTES (nuevos vs reusados)

| Componente | Archivo (propuesto) | Estado |
|---|---|---|
| PantryCard | `components/pantry/PantryCard.js` | Nuevo (extiende `.card`) |
| PantrySearch | `components/pantry/PantrySearch.js` | Nuevo (input pill + `Icon search`) |
| FilterChips | reusa `.chip-action` + `Icon` | Reusar |
| ConfidenceBadge | `components/pantry/ConfidenceBadge.js` | Nuevo (3 niveles, canónico, reutilizable) |
| AddProductSheet | `components/pantry/AddProductSheet.js` | Nuevo (`.modal` bottom-sheet) |
| MethodPicker (4 vías) | dentro de AddProductSheet | Nuevo |
| ScanView / LabelPhoto | `components/pantry/ScanView.js` | Nuevo (reusa cámara de `AddMealModal`) |
| ConfirmProduct | `components/pantry/ConfirmProduct.js` | Nuevo |
| PantryDetailSheet | `components/pantry/PantryDetailSheet.js` | Nuevo |
| QtyStepper | `components/ui/QtyStepper.js` | Nuevo (reutilizable +/−) |
| ExpiryPill | `components/pantry/ExpiryPill.js` | Nuevo (usa `--warn-c`/`--over`) |
| MealSuggestionCard ("¿qué puedo comer?") | `components/coach/MealSuggestionCard.js` | Reusar (extiende "usa N de tu despensa") |
| MacroBar / ProgressRing | `components/home/MacroBar.js` … | Reusar (nutrición) |
| EmptyState / Skeleton / Toast | `components/ui/*` | Reusar |
| Icon (search, barcode, camera, pencil, calendar, box, check, sparkles, plus, minus…) | `components/ui/Icon.js` | **Reusar + faltan íconos (§9)** |

Todo con tokens vivos; sin colores hardcodeados; dark automático.

---

## 8. Microinteracciones, responsive, a11y

- **Microinteracciones:** card nueva entra con fade+scale sutil; +/− anima el número (tabular); consumir a 0 → la card se atenúa antes de resolver; badge de confianza con leve realce al tocar. Todo respeta `prefers-reduced-motion`.
- **Responsive:** grid 2 col en móvil, 3-4 en tablet/desktop (`@media`); sheets a pantalla casi completa en móvil, centrados ≥600px (sistema). Buscador y filtros sticky al hacer scroll `[opcional]`.
- **A11y WCAG-AA:** ConfidenceBadge y ExpiryPill **nunca solo color** (ícono + texto/aria). QtyStepper con `aria-label` y targets ≥44px. Grid navegable por teclado, foco visible (`:focus-visible` vivo). Buscador `role="search"`. Sheets `role="dialog"`/`aria-modal`, foco atrapado y Escape (patrón del UpgradeModal). Cifras con `.num`. Imágenes con `alt` (nombre del producto).

---

## 9. Dependencias y coordinación

- **CTO (modelo de datos) `[?]`:** esquema de producto (id, nombre, marca, categoría, cantidad+unidad, nutrición/100g o por porción, caducidad, **fuente/confianza**, imagen, timestamps); inventario por usuario; endpoints CRUD + consumir/agregar (idempotentes); catálogo nutricional / barcode (Open Food Facts u otro) para "verificado"; descuento de inventario al registrar desde "¿qué puedo comer?". Persistencia serverless (Supabase) coherente con lo actual.
- **Karpathy (datos del coach) `[?]`:** "¿qué puedo comer?" = motor que cruza inventario disponible × `macros_pendientes` × restricciones/alergias (filtro duro) × país/preferencias → sugerencias con kcal/macros e ingredientes DE la despensa; formato de sugerencia (reusa contrato de `MealSuggestionCard`); extracción de etiqueta por visión (nombre/marca/nutrición) y nivel de confianza que devuelve.
- **Producto (Drucker) `[?]`:** ¿Despensa es Free o Pro? ¿límite de productos en Free? Lista de compras y "¿qué puedo comer?" ilimitado probablemente Pro. Ubicación en nav.
- **Íconos faltantes para `Icon.js` (§7):** `search`, `barcode`, `calendar`, `box`/`pantry`, `minus` (tengo `plus`, falta el par), `filter` (opcional). Los agrego al set canónico cuando se apruebe el build (coordinar con Casey, dueña de `globals.css`; el componente `Icon.js` es mío).

---

## 10. Secuencia sugerida (cuando Lugia dé build)
1. Modelo de datos + endpoints (CTO) — bloqueante.
2. Pantalla Despensa (grid + PantryCard + search + filtros + estados).
3. Agregar producto: Manual + Buscar → Confirmar + ConfidenceBadge (las 2 vías sin visión, más rápidas).
4. Escanear código + Foto de etiqueta (dependen de catálogo/visión).
5. Detalle + inventario (+/−, caducidad).
6. "¿Qué puedo comer?" (Karpathy) reusando MealSuggestionCard.
7. Lista de compras (V2).

**No construir aún** — este doc es el diseño; Lugia secuencia.
