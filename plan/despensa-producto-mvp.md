# Despensa Inteligente — Producto & Alcance (MVP)

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Fase:** DISEÑO (sin código) · **Brief:** §26 (alcance) y §27 (métrica) del brief mayor.
**Reconcilia con:** `plan/vision-roadmap-priorizado.md` (R1 cobrable desplegado, R2 loop diario specced), `plan/paywall-copy-offer.md` / `plan/paywall-triggers.md` ($99 MXN vivo), tools del coach vivas (`registrar_texto`, `generar_cena`, `save_memory` — ver estado en memoria del build).

> **Workstream:** el *qué/para quién/hasta dónde y por qué se paga*. La ciencia de recetas/sustituciones es de Karpathy; la UX de despensa/onboarding es de Rams; la arquitectura de datos es del CTO. Aquí defino el **corte del MVP, la monetización y la métrica**.

---

## 0. El WOW que perseguimos (una frase)
**"Tengo esto en casa → ¿qué como hoy que cumpla mi objetivo?"** → la app responde con **opciones concretas** hechas con lo que el usuario ya tiene. Ese único momento es el corazón del V1. Todo lo que no sirva a ese momento **no entra en V1**.

Encaja perfecto con el activo que ya existe: el coach ya sabe tus **macros pendientes del día** (motor determinista) y ya genera cenas (`generar_cena`). La despensa solo le da **una restricción nueva: "usa lo que tengo"**. Es una extensión del coach, no un módulo nuevo.

---

## 1. MVP V1 — el corte EXACTO (mínimo para el WOW)

### Entra en V1 (y solo esto)
| # | Capacidad (del §26) | Corte mínimo V1 | Por qué |
|---|---|---|---|
| 1 | **Crear/tener una despensa** | Una lista por usuario de "lo que tengo en casa" | Sin ella no hay WOW |
| 2 | **Agregar productos** | Por **texto libre** ("arroz, huevo, lata de atún, jitomate") — el mismo parser de `registrar_texto` | Fricción mínima; reusa lo vivo |
| 3 | **Buscar/seleccionar productos** | Búsqueda simple sobre alimentos genéricos (arroz, pollo, frijol…) + los del propio historial/"mis platillos" | Suficiente para poblar rápido |
| 4 | **Cantidades** | **Opcional y aproximada** ("tengo", "poco", "2 latas") — NO gramaje exacto | El WOW no necesita precisión de balanza; pedirla mata la adopción |
| 5 | **Asociar nutrición** | Reusar la estimación de macros ya existente (grounding del coach); marcar "estimado" | No inventar BD nueva |
| 6 | **Integrar con el coach** | La despensa entra al **contexto del coach** como una capa ("ingredientes disponibles") | Es la pieza que conecta todo |
| 7 | **"¿Qué puedo comer?"** | Botón/intención → el coach propone **1-3 opciones** que (a) usan lo disponible y (b) acercan a los macros pendientes | **ESTE es el WOW** |
| 8 | **Crear comidas con lo disponible** | Cada opción → tarjeta con "Registrar" (reusa el flujo de MealCard → `/api/meals`) | Cierra el loop: recomendación → registro |
| 9 | **Código de barras** | **SOLO si la infra ya está disponible sin costo nuevo**; si no → **fuera de V1** | No bloquear el WOW por hardware/BD de barcodes |

**Regla de barcode:** es un *nice-to-have* de captura, no parte del WOW. Si añadirlo cuesta una BD de productos o un SDK nuevo → **V2**. El texto libre ya puebla la despensa.

### La experiencia V1 en 4 pasos
```
1. "¿Qué tienes en casa?" → el usuario escribe/pega su lista (texto libre)
2. La despensa queda guardada (editable: agregar/quitar en 1 tap)
3. Toca "¿Qué puedo comer?" (o se lo pregunta al coach)
4. El coach responde 1-3 opciones con lo disponible que cierran su día → [Registrar]
```

---

## 2. V2 — lo que se difiere (capturado, no construido)
- **BD mexicana grande / catálogo extenso** (SMAE completo, marcas) — V1 usa alimentos genéricos + historial.
- **Tiendas y precios** — nada de integración con súper ni costos.
- **Sustituciones avanzadas** ("no tienes crema, usa yogur") — V1 solo propone con lo que hay.
- **Lista de compras adaptativa** ("te falta X para tu objetivo") — V2, y es un gancho Pro fuerte.
- **Caducidad / fechas** — V2 (útil pero no toca el WOW).
- **Cantidades exactas / gramaje por producto / inventario que se descuenta al cocinar** — V2.
- **Código de barras** si requiere BD/infra nueva — V2.

---

## 3. Monetización — Free vs Pro (consistente con el paywall vivo)

**Marco (heredado):** Free = **la herramienta** (poder tener la despensa); Pro = **el acompañamiento** (que el coach *actúe* sobre ella). La despensa + "¿qué puedo comer?" es un **diferenciador fuerte** → el acompañamiento inteligente es Pro. Sin dark patterns; registro manual siempre gratis.

| Capacidad | FREE | PRO ($99 MXN/mes) |
|---|---|---|
| Crear despensa + agregar/editar (texto) | ✅ (gancho) | ✅ |
| Ver qué tengo + nutrición estimada | ✅ | ✅ |
| **"¿Qué puedo comer?" (recomendaciones IA con lo disponible)** | **degustación: 3/mes** | **Ilimitado** |
| **Recetas/comidas generadas con la despensa** | ❌ (teaser) | ✅ |
| **Sustituciones** (V2) | ❌ | ✅ |
| **Lista de compras adaptativa** (V2) | ❌ | ✅ |

**Por qué este corte convierte y es honesto:**
- **Despensa básica Free** = gancho de adopción; el usuario invierte (puebla su despensa) → costo de cambio + engagement, aunque no pague.
- **"¿Qué puedo comer?" es la magia** → degustación limitada (3/mes, como el coach) para que **pruebe el WOW**, luego Pro. Es coherente con la degustación del coach (mismo patrón, mismo cap-por-feature del backend).
- **Coherencia con R1:** reusa el paywall vivo. Nuevo disparo (ver §5), variante `limit` al agotar la degustación de "¿qué puedo comer?" y `plans` al tocar recetas/sustituciones Pro. Copy en el bloque [LIVE]/[PRONTO] de `paywall-copy-offer.md` (recetas de despensa = nuevo bullet Pro cuando esté vivo; sustituciones/lista = "Próximamente").
- **Sin dark patterns:** poblar y ver la despensa es gratis para siempre; el muro solo aparece **después** de que el usuario probó "¿qué puedo comer?".

---

## 4. Métrica de éxito (§27) — "tengo esto y quiero cumplir mi objetivo → la app responde con opciones"

**Métrica estrella (WOW rate):**
> **% de invocaciones de "¿qué puedo comer?" que terminan en una comida registrada.**
Mide el arco completo: tengo esto (despensa) → pregunto → recibo opciones → **actúo**. Meta inicial: **≥35%** de las invocaciones → registro.

**Métricas de soporte:**
- **Adopción:** % de usuarios activos que crean despensa (con ≥3 productos) en su 1ª semana. Meta ≥40%.
- **Recurrencia del WOW:** invocaciones de "¿qué puedo comer?" por usuario activo/semana. Meta ≥1.5.
- **Conversión atribuida:** % de upgrades a Pro cuyo último disparo fue la despensa/"¿qué puedo comer?" (mide si es el diferenciador que dice el brief).
- **Calidad percibida:** % de opciones propuestas que el usuario acepta vs descarta (proxy de que las recomendaciones sirven; si es bajo, la recomendación no es buena aún).

> Instrumentar desde el día 1 con la telemetría de `ai_usage`/eventos ya existente (feature nueva `despensa_reco`). Cero costo de medición.

---

## 5. Qué NO construir en V1 (evitar hervir el océano)
- ❌ **Precios, tiendas, integración con súper.**
- ❌ **BD mexicana completa / catálogo de marcas.** (Genéricos + historial bastan.)
- ❌ **Código de barras** si requiere BD/SDK nuevo.
- ❌ **Caducidad, gramaje exacto, inventario que se descuenta.**
- ❌ **Sustituciones avanzadas y lista de compras** (son V2 y ganchos Pro futuros).
- ❌ **Recetas complejas multi-paso** — V1 propone opciones simples que cierran macros, no un recetario.
- **Regla de corte (equipo de 1-2):** si una pieza no sirve directamente al WOW "tengo esto → qué como hoy", no entra en V1.

---

## 6. Encaje en el roadmap vivo (secuencia)

```
R1 (coach vivo + cobrable) — DESPLEGADO  ✅
R2 (loop diario: consejo del día + reporte semanal + rachas) — SPECCED
  └─► DESPENSA V1 encaja como R2.5 / extensión del coach
        (reusa contexto del coach, generar_cena, MealCard, cap-por-feature, paywall)
R3 (proactividad + notificaciones) — DISEÑADO
```

**Recomendación de secuencia:** la Despensa V1 va **después de R1** y puede correr **en paralelo o justo después de R2** — no antes, porque **depende del coach que actúa** (R1) y se beneficia del loop diario (R2). No compite con R2 por prioridad: R2 instala el hábito diario (retención), la Despensa sube el **valor diferenciador y la conversión**. Sugiero: **R2 primero (retención barata), Despensa V1 inmediatamente después** como el gran diferenciador de la siguiente ola.

**Dependencias:** reusa casi todo lo vivo (parser de texto, contexto del coach, `generar_cena`, MealCard, cap-por-feature, paywall). Lo genuinamente nuevo: **modelo/tabla de despensa** (CTO) + la **capa de contexto "ingredientes disponibles"** + el **botón/intención "¿qué puedo comer?"** (Rams UI, Karpathy lógica de matching disponible↔macros).

---

## Handoffs
- **Karpathy:** lógica de "¿qué puedo comer?" = generar opciones que usan `ingredientes_disponibles` ∩ que cierran `macros_pendientes` ±10%, respetando filtros duros (alérgenos). Reusa `generar_cena` con la restricción de despensa. Define si es una tool nueva o un parámetro de la existente.
- **Rams:** UX de despensa (poblar por texto en <30s, editar en 1 tap, estado vacío accionable) + el momento "¿qué puedo comer?" y sus tarjetas de opción con [Registrar]. Sin gramaje obligatorio.
- **CTO:** tabla `pantry_items(user_id, nombre, cantidad_aprox, macros_est?, created_at)` con RLS; capa de contexto para el coach; nuevo `feature='despensa_reco'` en el ledger de cuota (degustación 3/mes Free); disparo de paywall (§5).
- **Casey/Copy:** bullet Pro "Cocina con lo que tienes" cuando esté [LIVE]; sustituciones/lista de compras = "Próximamente".
- **Lugia:** decisión de secuencia (R2 → Despensa V1) y GO de Emiliano.

## TL;DR
**V1 = el WOW y nada más:** despensa por texto libre + "¿qué puedo comer?" → 1-3 opciones que usan lo disponible y cierran los macros del día → [Registrar]. Reusa el coach vivo (contexto, `generar_cena`, MealCard, paywall). **Free** = tener/ver despensa + degustación 3/mes de "¿qué puedo comer?"; **Pro** = recomendaciones ilimitadas + recetas (sustituciones/lista = Próximamente/V2). **Métrica estrella:** % de "¿qué puedo comer?" que terminan en comida registrada (≥35%). **NO en V1:** precios/tiendas/BD-mexicana/caducidad/gramaje/barcode-con-infra-nueva/sustituciones/lista. **Secuencia:** después de R1, idealmente tras R2 — es el gran diferenciador de la siguiente ola, no compite con la retención de R2.
