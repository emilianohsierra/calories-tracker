# Visión de Experiencia — Coach Nutricional con IA (Premium)

**Rol:** UX/UI Designer + experiencia de producto · **Autor:** Rams Design (skm3lj3d)
**Fecha:** 2026-07-28 · **Estado:** Diseño de experiencia (no código de UI final)
**Coordinado con:** Karpathy AI-Nutri (contrato de datos por pantalla) · Drucker Product (línea free/Premium)

> **Cómo leer este doc.** Cada dato/widget está etiquetado:
> `[REAL]` ya existe en la app · `[INPUT]` requiere que el usuario lo capture · `[IA]` lo estima la visión/coach · `[V2]` fase posterior · `[?Karpathy]` / `[?Drucker]` pendiente de confirmación del equipo.
> Base actual heredada: registro por foto → visión GPT-4o-mini → JSON editable (título, kcal, macros, ingredientes, confianza), resumen diario vs meta, gráfica de 7 días. Stack Next.js 15 + React 19, en producción.

---

## 0. Principio rector de la experiencia

**"Un coach sereno, no un tablero de contabilidad."** (alineado con el concepto de Jony Ive: tipo Oura, no MyFitnessPal). El producto debe sentirse como alguien que te guía, no como una hoja de cálculo. Tres reglas de diseño que atraviesan todo:

1. **Progresivo sobre exhaustivo.** Nunca mostrar todas las opciones/métricas a la vez. Revelar por capas según objetivo e intención.
2. **Defaults inteligentes.** El usuario puede llegar al final tocando "Siguiente"; cada campo trae un valor razonable precargado. La personalización es opcional, no un peaje.
3. **Un dato protagonista por pantalla.** Siempre hay una sola cosa que importa más (hoy: cuánto me queda; onboarding: mi plan revelado; logro: la racha). Todo lo demás es soporte.

---

## 1. ONBOARDING BASADO EN OBJETIVOS

### 1.1 El problema a resolver
El catálogo de objetivos es enorme: salud general, composición corporal (perder grasa, ganar músculo, recomposición), rendimiento deportivo (resistencia, fuerza, hipertrofia), fitness/hábito, dietas (keto, alta proteína, mediterránea, vegetariana/vegana, ayuno), condiciones médicas (diabetes/glucosa, hipertensión/sodio, colesterol, renal). Mostrarlo todo abruma y expulsa. La solución no es recortar opciones, es **secuenciarlas**.

### 1.2 Arquitectura del flujo (6 pasos, con barra de progreso)

**Regla de oro:** el usuario elige objetivos primero; **solo pedimos los parámetros de los objetivos que eligió.** Quien solo quiere "salud general" contesta 3 preguntas; quien elige 4 objetivos contesta más, pero cada bloque se siente corto porque está segmentado.

```
Paso 1  Bienvenida + valor      → 1 pantalla, 1 CTA "Empecemos"
Paso 2  ¿Qué buscas? (multi)    → grid de categorías-objetivo, multi-selección
Paso 3  Datos base (una vez)    → sexo, edad, peso, altura, actividad  [defaults]
Paso 4  Parámetros por objetivo → wizard ramificado, 1 bloque por objetivo elegido
Paso 5  Cálculo ("preparando")  → animación 2-3s, sensación de trabajo personalizado
Paso 6  Revelación del plan     → el momento "ajá": tu meta y macros calculados
```

#### Paso 2 — Selección de objetivos (multi-selección, sin abrumar)
- Presentar **6 CATEGORÍAS** como tarjetas grandes con icono, no los ~20 objetivos sueltos:
  `Salud general` · `Composición corporal` · `Rendimiento deportivo` · `Hábito/Fitness` · `Estilo de dieta` · `Condición médica`
- Al tocar una categoría se expande **in situ** con sus sub-objetivos (chips seleccionables). Ej. "Composición corporal" → Perder grasa / Ganar músculo / Recomposición / Mantener.
- Multi-selección real, pero con **guía suave**: si el usuario elige combinaciones en conflicto (ej. "perder grasa" + "ganar músculo máximo"), un microcopy no-bloqueante explica el trade-off y sugiere "Recomposición" como puente. No prohibimos; orientamos.
- **Objetivo primario:** si elige varios, un paso mínimo "¿cuál es tu prioridad?" fija el objetivo que manda cuando hay conflicto de cálculo. Esto le da a Karpathy una jerarquía determinista.

#### Paso 3 — Datos base (se piden UNA sola vez, no por objetivo)
- `[INPUT]` sexo, edad, peso, altura, nivel de actividad (5 niveles con descripción en lenguaje humano: "sentado casi todo el día" … "entreno duro 6+ días").
- Todos con **defaults/sliders** y unidades locales (kg/cm, con opción lb). Peso/altura alimentan el cálculo de Karpathy `[?Karpathy: Mifflin-St Jeor vs Katch-McArdle; si hay % grasa opcional → Katch]`.
- **Diseño anti-fricción:** un campo por pantalla en móvil (estilo Typeform) o card compacta; teclado numérico correcto; el botón "Siguiente" siempre visible.

#### Paso 4 — Parámetros por objetivo (wizard ramificado)
Solo aparecen los bloques de los objetivos elegidos. Cada bloque = 1–3 preguntas máximo:
- *Perder grasa* → ritmo (lento/moderado/agresivo → define déficit) `[?Karpathy]`.
- *Ganar músculo* → nivel de experiencia + días de entrenamiento (define superávit + proteína).
- *Rendimiento/deportivo* → deporte/tipo (resistencia vs fuerza) → ajusta carbohidratos.
- *Estilo de dieta* → keto / alta proteína / mediterránea / vegetariana / vegana → ajusta reparto de macros y filtra sugerencias del coach.
- *Condición médica* → selección + **disclaimer legal** ("no sustituye consejo médico"); ajusta límites (sodio, azúcares, etc.) y **micronutrientes vigilados**. Esta rama debe ser conservadora y marcada visualmente distinta.

#### Paso 5 — "Calculando tu plan"
- Micro-momento de 2–3s con animación (anillos que se llenan) y microcopy que nombra lo que hace: "Ajustando macros a tu objetivo de recomposición…". Convierte una espera técnica en **valor percibido**. Respeta `prefers-reduced-motion`.

#### Paso 6 — Revelación del plan (el "momento ajá")
La pantalla más importante del onboarding. Diseño:
- **Héroe:** meta calórica diaria (número grande, tabular). `[REAL/IA cálculo Karpathy]`
- Debajo: **reparto de macros** en 3 anillos/barras (proteína, carbos, grasa) con gramos y %. `[?Karpathy: número único o rango]`
- Objetivos activos como chips + **objetivos secundarios** ("además vigilaremos tu fibra e hidratación").
- Metas de soporte: fibra, hidratación (vasos/L), y para condición médica el límite relevante. `[?Karpathy: ¿calcula fibra/hidratación/micros?]`
- CTA primario: **"Registrar mi primera comida"** (lleva al flujo de foto ya existente). El onboarding termina en acción, no en un muro.

### 1.3 Cómo NO abrumar — resumen de tácticas
| Táctica | Aplicación |
|---|---|
| Categorías antes que items | 6 tarjetas → expanden a sub-objetivos |
| Ramificación | solo se piden parámetros de lo elegido |
| Datos base una vez | no repetir peso/edad por objetivo |
| Un campo por pantalla | reduce carga cognitiva móvil |
| Defaults + sliders | avanzable sin escribir |
| Progreso visible | barra 1–6, sensación de fin cercano |
| Objetivo primario | resuelve conflictos sin diálogos largos |
| Saltable | "Prefiero explorar primero" → plan por defecto de salud general, editable luego |

### 1.4 Posición del muro Premium (recomendación UX → confirmar Drucker)
`[?Drucker]` **Recomendación: onboarding y revelación del plan van ANTES del muro.** El usuario debe vivir el "ajá" (ver su plan calculado) sin tarjeta. El muro aparece al **activar features Premium** (multi-objetivo simultáneo, dashboard completo, coach IA, gamificación avanzada). Así: activación alta → conversión sobre valor demostrado, no sobre promesa. Hipótesis de línea free/Premium detallada en §4.

---

## 2. DASHBOARD PREMIUM

### 2.1 Jerarquía — qué ve primero el usuario
Orden vertical de la pantalla principal (móvil-first, scroll), de mayor a menor prioridad:

```
┌─ 1. HÉROE: Progreso de HOY hacia el objetivo ────────────┐
│    Anillo(s) de calorías + macros del día vs plan        │  [REAL]
│    "Te quedan 640 kcal · Proteína 82/140g"               │
├─ 2. RACHA + estado del coach ────────────────────────────┤
│    "🔥 7 días cumpliendo" + 1 insight corto del coach     │  [IA/V2]
├─ 3. ADHERENCIA al plan (semana) ─────────────────────────┤
│    % de días dentro de meta · anillo semanal             │  [REAL derivable]
├─ 4. TENDENCIA (semana / mes, toggle) ────────────────────┤
│    kcal por día (ya existe) + línea de meta              │  [REAL 7d] [V2 mes]
├─ 5. NUTRIENTES clave ────────────────────────────────────┤
│    Macros (real) · Fibra · Hidratación · Micros del obj. │  ver tabla
├─ 6. CUERPO: peso y medidas ──────────────────────────────┤
│    Evolución de peso (línea) + medidas                   │  [INPUT]
├─ 7. Accesos: registrar comida (FAB), retos, logros ──────┘
```

**Principio:** lo primero es **"¿voy bien HOY?"** (accionable ahora), no las estadísticas históricas. La tendencia y el cuerpo van más abajo porque son de consulta, no de acción diaria.

### 2.2 Contrato de datos por widget (para Karpathy)
| Widget | Fuente | Estado |
|---|---|---|
| Calorías/macros del día vs meta | registro por foto existente | `[REAL]` |
| Adherencia (% días en meta) | derivado del historial de registros | `[REAL derivable]` |
| Tendencia semanal | gráfica 7 días actual | `[REAL]` |
| Tendencia mensual | agregación 30d | `[V2 — need endpoint]` `[?Karpathy]` |
| Fibra | ¿la estima la visión de la foto? | `[?Karpathy — IA o INPUT]` |
| Hidratación | probablemente captura manual (botón +1 vaso) | `[INPUT]` |
| Micronutrientes relevantes | según objetivo/condición | `[?Karpathy — IA vs. fuente externa]` `[V2]` |
| Peso | captura manual periódica | `[INPUT]` |
| Medidas corporales | captura manual (cintura, cadera, etc.) | `[INPUT]` `[V2]` |
| Rachas / días consecutivos | derivado de registros que cumplen meta | `[REAL derivable]` |
| Insights del coach | genera Karpathy del historial | `[?Karpathy — frecuencia/formato]` |

> **Nota de diseño ante incertidumbre:** todo widget cuyo dato aún no exista se diseña con **estado vacío accionable** ("Registra tu peso para ver tu tendencia" + botón), nunca con un cero mudo o un placeholder falso. Esto permite lanzar el dashboard aunque algunas fuentes lleguen en V2.

### 2.3 Interacciones
- **Toggle semana/mes** en tendencia (segmented control).
- **Hidratación:** tap rápido "+1 vaso" desde el dashboard, sin abrir modal (fricción mínima para un hábito de alta frecuencia).
- **Peso:** entrada rápida con teclado numérico + fecha; la gráfica se actualiza con animación.
- Cada widget bloqueado por Premium muestra **teaser difuminado + candado + CTA** (ver §4), no desaparece.

---

## 3. GAMIFICACIÓN UX (ligada a hábitos sanos)

**Filosofía:** premiar **consistencia y conductas saludables**, nunca la restricción extrema. La gamificación refuerza el hábito, no la obsesión. Nada de castigar; celebrar y reconducir con amabilidad.

### 3.1 Sistema de progresión
- **XP (experiencia):** se gana por acciones saludables, no por "comer poco":
  registrar una comida (+), cerrar el día dentro de meta (++), cumplir proteína/fibra (+), registrar peso semanal (+), completar hidratación (+), completar un reto (+++).
- **Niveles:** curva suave; cada nivel desbloquea un elemento cosmético o un insight nuevo del coach. Nombre temático de coach ("Aprendiz → Constante → Disciplinado → Atleta").
- **Rachas:** día consecutivo cumpliendo el plan. Diseño **anti-ansiedad**: existe un "comodín/día de descanso" o "racha congelada" al fallar un día (estilo Duolingo streak freeze) para no destruir semanas de esfuerzo por un tropiezo — clave para retención y salud mental.

### 3.2 Logros e insignias
- **Insignias por hito** (primera comida, 7/30/100 días, meta de proteína 10 veces, semana con fibra completa, primer kilo hacia el objetivo).
- **Insignias por hábito saludable**, no por peso: "Hidratado toda la semana", "Desayunos constantes", "Semana equilibrada en macros". Refuerza conducta, no báscula.
- Galería de insignias con estados bloqueado/desbloqueado (silueta → color al ganarla).

### 3.3 Desafíos y retos mensuales
- **Reto mensual** temático ("Julio: +fibra", "Agosto: hidratación") con barra de progreso y recompensa (XP + insignia exclusiva del mes).
- **Micro-desafíos semanales** propuestos por el coach según tus datos ("esta semana, 3 desayunos con proteína").
- Los retos son **opt-in** y siempre orientados a un hábito sano medible con datos que ya tenemos.

### 3.4 Dónde vive la gamificación en la UI
- **No** como pantalla separada aislada: un **resumen** (nivel + racha + reto activo) vive en el dashboard (widget 2); el **detalle** (galería de logros, historial de retos, nivel) en una pestaña "Progreso/Coach".
- Celebraciones puntuales: al subir de nivel o cerrar racha, **toast/confetti breve** (respeta reduced-motion). Sin interrumpir el flujo de registro.

---

## 4. MURO PREMIUM — dónde y cómo (coordinar Drucker)

`[?Drucker]` Hipótesis de línea, sujeta a confirmación:

| Capacidad | FREE | PREMIUM |
|---|---|---|
| Registro por foto | ✅ con límite diario de análisis | ✅ ilimitado |
| Objetivos | 1 objetivo | multi-objetivo simultáneo |
| Resumen diario + macros | ✅ básico | ✅ completo |
| Tendencia | 7 días | semana + **mes** + histórico |
| Fibra / hidratación | básico | ✅ con metas y seguimiento |
| Micronutrientes | ❌ (teaser) | ✅ según objetivo/condición |
| Peso y medidas | peso simple | evolución completa + medidas |
| Coach IA (insights/retos personalizados) | ❌ (teaser) | ✅ |
| Gamificación | rachas + logros básicos | niveles, retos mensuales, insignias exclusivas |

### Patrón de muro (UX)
- **Onboarding y revelación del plan: siempre gratis** (activación primero).
- Widgets Premium en el dashboard: **visibles pero con teaser** (difuminado + candado + valor: "Desbloquea tus micronutrientes y coach IA"). Ver el valor bloqueado convierte mejor que ocultarlo.
- **Paywall:** `[?Drucker: pantalla con planes mensual/anual + trial, o CTA simple]`. Base técnica ya presente en el repo (`components/UpgradeModal.js`, `lib/stripe.js`, `app/api/checkout|portal|stripe`). Diseñar el paywall con: 3–4 bullets de valor centrados en el coach, comparativa free/Premium, precio anual destacado con ahorro, y prueba/garantía si aplica.
- **Momento de oferta:** al intentar activar un 2º objetivo, al tocar un widget bloqueado, o tras N días de racha (usuario ya enganchado = mejor conversión).

---

## 5. DIRECCIÓN VISUAL (coherente con la app en producción)

Evolución, no ruptura, del look actual (base neutra cálida `#f9f9f7`, tarjetas, acento azul):

- **Personalidad:** coach sereno tipo Oura/Apple Health — calma, foco en el dato, generoso en espacio en blanco. Menos "app de dieta", más "bienestar".
- **Tipografía:** escala modular; **números tabulares** (`tabular-nums`) en toda cifra (kcal, macros, peso, XP) para estabilidad visual. Pesos 400/500/600/700.
- **Color:** conservar sistema semántico existente (ok/warn/over). Definir **acento de marca propio** (el azul actual es genérico) + paleta de estados nutricionales por macro (proteína/carbos/grasa con colores consistentes en todo: dashboard, onboarding, gráfica). **Dark mode** tokenizado (Oura/Health son dark-first).
- **Componente estrella: anillos de progreso** (estilo Apple Activity/Oura) para meta diaria y macros — más "coach" que la barra lineal actual, reutilizables en onboarding (revelación) y dashboard (héroe).
- **Iconografía:** reemplazar emojis por un set consistente (Lucide/estilo SF) — salto inmediato de percepción premium.
- **Estados:** skeletons en carga (no spinner solo), vacíos accionables (con CTA), errores con reintento.
- **Accesibilidad WCAG-AA:** contraste ≥4.5:1 (revisar textos muted actuales), `:focus-visible` en todo interactivo, targets táctiles ≥44px, `prefers-reduced-motion` en anillos/confetti, aria en anillos y gráficas.
- **Coherencia técnica:** todo sobre Next.js 15 + React 19 actual; los anillos como SVG (como ya se hace en `WeekChart.js`). No introducir dependencias pesadas de UI sin necesidad.

---

## 6. WIREFRAMES DESCRITOS (para handoff a Ford/Build)

**W1 · Onboarding-Objetivos:** pantalla con barra de progreso arriba; título "¿Qué buscas?"; grid 2×3 de tarjetas-categoría con icono + label; al tap, expansión con chips de sub-objetivos; footer con "Continuar" (habilitado al elegir ≥1).

**W2 · Datos base:** un campo por pantalla estilo Typeform; slider/stepper con default; unidad conmutable; progreso persistente.

**W3 · Revelación del plan:** fondo limpio; anillo grande de kcal al centro; 3 anillos de macros debajo; chips de objetivos activos; línea de metas de soporte (fibra/agua); CTA "Registrar mi primera comida".

**W4 · Dashboard:** scroll vertical con el orden de §2.1; héroe = anillos de hoy; widget racha/coach; adherencia; tendencia con toggle semana/mes; nutrientes; peso; FAB de registro fijo.

**W5 · Progreso/Coach (pestaña):** nivel + barra XP arriba; reto mensual activo con progreso; galería de insignias (bloqueadas/desbloqueadas); historial de rachas.

**W6 · Paywall/Upgrade:** header con valor del coach; comparativa free/Premium; toggle mensual/anual con ahorro; CTA; enlace "restaurar/gestionar" (base `stripe` ya en repo).

**W7 · Widget bloqueado (patrón):** card real con contenido difuminado, candado centrado, microcopy de valor, botón "Desbloquear con Premium".

---

## 7. Dependencias y siguientes pasos
- **Karpathy (bloqueante parcial):** confirmar contrato de datos §2.2 y motor de cálculo §1 (inputs, fórmula, si calcula fibra/hidratación/micros, formato de macros, formato/frecuencia de insights del coach). Sin esto, los widgets marcados `[?Karpathy]` quedan como estado-vacío-accionable en v1.
- **Drucker (bloqueante parcial):** confirmar línea free/Premium §4, posición del muro (recomiendo post-plan) y formato de paywall/precios.
- **Ford/Build:** este doc + wireframes §6 son el input de implementación; priorizar onboarding + revelación del plan + dashboard héroe (anillos) como primer incremento visible.
- **Nielsen QA:** validar accesibilidad §5 y que el onboarding sea completable con defaults en < 60s.

**Recomendación de secuencia de entrega:** (1) Onboarding por objetivos + revelación del plan, (2) Dashboard con héroe de anillos + racha, (3) Gamificación (niveles/logros), (4) Paywall y widgets Premium con teaser. El "ajá" del plan calculado es la palanca de activación; va primero.
