# Plan de Precisión Nutricional — calories-tracker

**Autor:** Karpathy AI-Nutri (IA + Nutrición) · Sprint de diagnóstico · 2026-07-24
**Alcance:** solo lectura. Archivos auditados: `lib/analyze.js`, `app/api/analyze/route.js`, `lib/image.js`, `lib/db.js`, `components/AddMealModal.js`.

---

## TL;DR

La estimación hoy es **100% alucinación del modelo**: no hay ninguna base de datos nutricional que aterrice los números. GPT-4o-mini inventa calorías y macros a partir de una foto, sin escala real de porción, sin coherencia macro↔caloría, con `temperature` por defecto (no determinista) y una confianza auto-reportada que no significa nada. Esto es aceptable para un MVP, pero es el **riesgo #1 de producto**: si el usuario percibe que los números son inventados, no paga. La palanca de mayor impacto es **grounding contra una BD nutricional (USDA + Open Food Facts + tabla mexicana)** y **forzar coherencia energética**. El costo por foto de gpt-4o-mini **no es tan barato como parece** por el multiplicador de tokens de imagen del modelo mini.

---

## (1) Auditoría de `lib/analyze.js` — dónde falla / alucina

Referencias por línea sobre `lib/analyze.js`:

| # | Hallazgo | Línea | Impacto |
|---|----------|-------|---------|
| A | **Cero grounding.** El modelo escupe `calorias/proteinas_g/carbohidratos_g/grasas_g` de memoria. No se contrasta contra ninguna tabla nutricional. Alucinación garantizada en platillos poco comunes o regionales. | 62-65 | **Crítico** |
| B | **Sin coherencia energética.** Nada valida que `calorias ≈ 4·proteína + 4·carbos + 9·grasa`. El modelo devuelve tripletas inconsistentes (p. ej. 600 kcal con macros que suman 400). Nadie lo detecta. | 62-65 | Alto |
| C | **`temperature` no fijada** → default 1.0. La MISMA foto da calorías distintas en cada análisis. Erosiona confianza del usuario ("ayer me dio 500, hoy 700"). | 141-146 | Alto |
| D | **Escala de porción no resuelta.** El prompt pide usar referencias visuales (plato, cubiertos, manos) pero no hay fiducial ni forma de conocer el tamaño real. Un taco puede ser de 60 g o 150 g; el error de porción domina el error total (±40-60%). | 90-91 | **Crítico** |
| E | **Confianza sin calibrar.** `confianza ∈ {alta,media,baja}` es auto-reportada; los LLM sistemáticamente se sobre-confían. Hoy solo se muestra como texto (`AddMealModal.js:182`), no cambia nada del cálculo ni pide corrección. | 66 | Medio |
| F | **`detail` de imagen no especificado** en `image_url` → usa `auto`. Para estimación de porción, `detail:'high'` mejora la lectura de tamaño; hoy se deja al azar del proveedor. Además la imagen ya se baja a 1280px en cliente (`lib/image.js:2`), lo que puede perder detalle útil de textura/porción. | 121 | Medio |
| G | **`max_tokens: 700`** puede truncar el JSON si `ingredientes` es largo → `JSON.parse` (línea 148) revienta y el usuario ve error genérico. Riesgo bajo pero real en platos combinados. | 145, 148 | Bajo |
| H | **Estimación puntual, no rango.** Se devuelve un número único donde honestamente hay un intervalo. Un rango ("480-620 kcal") comunica incertidumbre y es más defendible. | 62 | Medio (UX/confianza) |
| I | **Reanálisis obediente.** En corrección se instruye "respeta lo que el usuario afirma aunque contradiga tu estimación" (línea 136). Bien para UX, pero permite que el usuario empuje los números a lo que quiera → sesga datos si luego se usan para entrenar/analítica. | 129-137 | Bajo |
| J | **Grok default `grok-4.3`** como proveedor alterno (línea 21): soporte de visión no verificado en este flujo. Fuera de foco pero anotado. | 21 | Bajo |
| K | **`hint`/`feedback` del usuario inyectados en texto** libre del prompt (líneas 118-119, 134). Inyección de prompt de bajo riesgo (single-user), pero a considerar en multi-tenant. | 118-119 | Bajo (futuro) |

---

## (2) Cómo mejorar la precisión

### 2.1 Grounding contra BD nutricional real (la mejora de mayor ROI)
Cambiar de "el modelo inventa el número" a "**el modelo identifica alimento + porción, la BD calcula las calorías**". Arquitectura propuesta (pipeline de 2 pasos):

1. **Visión → estructura, NO números.** Nuevo schema: el modelo devuelve por ingrediente `{ nombre_canonico, porcion_estimada_g, metodo_preparacion, referencia_visual_usada }`. NO le pedimos kcal.
2. **Resolver contra BD y calcular localmente.** Por cada ingrediente, buscar en:
   - **USDA FoodData Central** (API gratuita, `api.nal.usda.gov/fdc`) — genérico y "Foundation/SR Legacy".
   - **Open Food Facts** (gratis, sin key) — productos empacados por código/nombre; fuerte en marcas.
   - **Tabla mexicana:** SMAE (Sistema Mexicano de Alimentos Equivalentes) / INCAP / tablas de composición de INSP — **esto es la ventaja competitiva latina.** Cargar un JSON curado de ~300-500 platillos/ingredientes MX (tacos, pozole, tamales, chilaquiles, tortilla, frijoles, etc.) con kcal/macros por 100 g.
   - Calcular: `kcal = Σ (porcion_g/100 · kcal_100g)`; idem macros. Números **derivados de datos, no inventados.**
3. **Matching:** embeddings/búsqueda semántica sobre nombres canónicos para mapear "chilaquiles verdes" → entrada de BD. Cache local (SQLite ya está) de mapeos ya resueltos.

> Fallback: si un ingrediente no matchea en ninguna BD, ahí sí se usa la estimación del modelo, pero **marcado como "estimado"** y bajando confianza.

### 2.2 Mejoras de prompt (rápidas, sin infra nueva)
- **Cadena de razonamiento de porción:** pedir primero identificar la referencia de escala (diámetro de plato ≈ 26 cm, cuchara, mano) y estimar gramos por componente **antes** de las calorías. Descomponer reduce el error.
- **Forzar coherencia energética** en el prompt + **validarla en código** (post-proceso en `app/api/analyze/route.js`): si `|calorias - (4·prot+4·carb+9·grasa)| / calorias > 0.15`, recalcular calorías desde macros y bajar confianza. Barato y elimina el hallazgo B.
- **Pedir rango + valor central:** `calorias_min`, `calorias`, `calorias_max`. Mostrar el central, comunicar el rango (hallazgo H).
- Fijar **`temperature: 0.2`** y añadir `seed` para reproducibilidad (hallazgo C).
- Set **`detail:'high'`** en la imagen y subir el downscale de cliente a ~1568px (hallazgo F).

### 2.3 Calibración de confianza
- Derivar confianza de **señales objetivas**, no de la opinión del modelo: (a) ¿hubo match en BD? (b) ¿había referencia de escala visible? (c) ¿coherencia energética dentro de tolerancia? (d) ¿el rango min-max es estrecho? Combinar → `alta/media/baja`.
- Cuando sea `baja`, la UI debe **pedir activamente** una corrección (gramos o "¿cuántas piezas?"), no solo informar. Hoy `AddMealModal.js:182` solo muestra texto.

### 2.4 Manejo de porciones / referencias visuales
- **Opción de fiducial:** ofrecer "pon una moneda de $10 / una tarjeta junto al plato" para calibrar escala real (gran salto de precisión, opt-in).
- **Presets de porción:** botones rápidos post-análisis ("½ / 1 / 1½ / 2 porciones") que reescalan macros linealmente sin re-llamar al modelo → 0 costo, mejora percibida de control.
- **Densidad calórica sanity-check:** kcal/g fuera de rango físico (>9 kcal/g imposible salvo aceite puro; <0.2 sospechoso) → flag automático.

---

## (3) Costo por análisis — modelos

> Órdenes de magnitud (verificar tarifas vigentes antes de fijar pricing). Supuestos: prompt ~400 tok, 1 imagen ~1280-1568px, salida JSON ~300 tok.

| Modelo | Precio aprox (in / out por 1M tok) | Costo aprox / foto | Nota |
|--------|-----------------------------------|--------------------|------|
| **gpt-4o-mini** (actual) | ~$0.15 / ~$0.60 | **~$0.002-0.004** | ⚠️ El mini aplica un **multiplicador alto de tokens de imagen**: por visión NO cuesta ~16× menos que 4o, la brecha real es mucho menor. |
| **gpt-4o** | ~$2.50 / ~$10 | ~$0.006-0.012 | Mejor razonamiento de porción y platillos regionales. |
| **Claude (visión)** — Haiku 4.5 / Sonnet 5 | Haiku barato / Sonnet gama media | Haiku ~comparable a 4o-mini; Sonnet entre mini y 4o | Fuerte en seguir schema y en español. Buen candidato a A/B. |

**Implicación de negocio (freemium):** a ~$0.003/foto, un usuario gratis de ~3 fotos/día = ~$0.27/mes de costo variable. Sostenible con límite (p. ej. 3-5 análisis/día en gratis, ilimitado en Pro). El costo real que sube la factura no es el texto, es **la imagen**; por eso el downscale en cliente (`lib/image.js`) ya es correcto y hay que conservarlo.

**Recomendación costo/precisión:**
- **Mantener gpt-4o-mini como default** para el paso de visión, PERO mover la precisión al grounding de la sección 2.1 (más barato y más efectivo que subir de modelo).
- **Ofrecer gpt-4o o Sonnet como "análisis de precisión"** en el tier Pro (upsell natural: "re-analizar con IA avanzada").
- Correr un **A/B mini vs Haiku 4.5** contra un set de ~50 fotos con peso/macros conocidos (ground truth) para decidir con datos, no con intuición.

---

## (4) Features inteligentes diferenciadoras

1. **Registro por texto y voz (además de foto).** "2 tacos de pastor con piña y un agua de horchata" → misma tubería de grounding (2.1) sin costo de visión. Cubre el caso "no quiero/no puedo tomar foto" (restaurante, prisa) — la queja #1 de las apps de foto. Voz vía Web Speech API o Whisper. **Alto impacto, reutiliza infra.**

2. **Memoria de platillos frecuentes ("Mis platillos").** Cachear análisis confirmados por el usuario (la BD SQLite ya existe). Al re-subir algo parecido: "¿Es tu *chilaquiles verdes* de siempre? (520 kcal)" → 1 tap, **0 costo de API**, más rápido y más preciso (usa números que el usuario ya validó). Excelente para retención.

3. **Coach conversacional nutricional (tier Pro).** Chat sobre el historial ("¿cómo voy con proteína esta semana?", "dame una cena de 400 kcal con lo que suelo comer") aterrizado en los datos de `meals` + metas. Diferenciador de valor y motor de conversión a pago; en español y con contexto de comida mexicana, terreno donde MyFitnessPal/Yazio son débiles.

*(Bonus barato:* auto-clasificación de `tipo_comida` por hora del registro; sugerencia de meta calórica desde peso/altura/actividad al onboarding.)*

---

## Prioridad recomendada (para el Director)
1. **Grounding + coherencia energética** (2.1 y validación de 2.2) — ataca los hallazgos A, B, D; es EL diferenciador de precisión.
2. `temperature`, `detail`, rango min-max, presets de porción — quick wins de 1 día (C, F, H).
3. Registro por texto/voz y memoria de platillos — features de producto que además reducen costo de API.
4. Coach Pro — palanca de monetización, después del PMF de precisión.

*Nota: todo lo anterior es diagnóstico; no se modificó código en este sprint.*
