# Premium — Visión de Nutrición + Motor de IA

**Autor:** Karpathy AI-Nutri (nutricionista deportivo + arquitecto del motor de IA)
**Para:** Lugia (Director) · Coordinación: Drucker (Producto), Rams (UX)
**Fecha:** 2026-07-28
**Producto:** evolución de calories-tracker → coach nutricional con IA personalizado (99 MXN/mes)

> **Posicionamiento y límite legal (leer primero).** Somos un **coach de nutrición deportiva y de hábitos** que **informa, calcula y organiza**. NO diagnosticamos, NO tratamos enfermedades y NO sustituimos a un profesional sanitario (médico, nutriólogo clínico, endocrino). Toda condición médica activa un modo conservador con disclaimers reforzados (§5). Este documento define el motor; la validación clínica de fórmulas y umbrales debe revisarla un nutriólogo colegiado antes de producción.

---

## 1. Taxonomía de objetivos

Estructura jerárquica: **Categoría → Objetivo → (sub-objetivo)**. El usuario elige 1 objetivo primario y hasta 2 secundarios; el motor prioriza el primario en conflictos (ej. "perder grasa" + "maratón" → mantener rendimiento y hacer déficit leve).

```
A. SALUD Y HÁBITOS
   - Comer más sano / mejorar calidad de dieta
   - Mantener peso (recomposición pasiva)
   - Reducir ultraprocesados
   - Más verdura/fibra · más agua · menos azúcar añadido · menos alcohol
   - Mejorar energía / digestión / sueño (vía alimentación)

B. COMPOSICIÓN CORPORAL
   - Perder grasa (definición)
   - Ganar músculo (volumen)
   - Recomposición (perder grasa + ganar músculo simultáneo)
   - Mantener composición

C. RENDIMIENTO DEPORTIVO (resistencia)
   - Running: 5K · 10K · media maratón · maratón · trail/ultra
   - Ciclismo (ruta / MTB / gran fondo)
   - Triatlón (sprint / olímpico / 70.3 / IM)
   - Natación · remo
   - Objetivo transversal: mejorar tiempo · aguantar distancia · recuperar mejor

D. FITNESS / FUERZA
   - Powerlifting (fuerza máxima)
   - Halterofilia
   - Culturismo (volumen / definición / peak week)
   - CrossFit · Hyrox (híbrido fuerza-resistencia)

E. PATRONES DIETÉTICOS (modo de alimentación, se combinan con A-D)
   - Mediterránea · DASH
   - Vegetariana · Vegana · Flexitariana
   - Keto · Low-carb · Alta proteína
   - Baja en sodio · Sin gluten (preferencia, no celiaquía)
   - Ayuno intermitente (16:8, etc.)

F. CONDICIONES MÉDICAS  ⚠️ (ver §5 — máximo riesgo legal)
   - Diabetes tipo 1 / tipo 2 / prediabetes
   - Hipertensión
   - Colesterol/dislipidemia
   - Hígado graso (NAFLD)
   - Síndrome metabólico
   - Intolerancias (lactosa, FODMAP) · Celiaquía · Alergias alimentarias
   - Embarazo/lactancia · ERC (renal) · SOP · tiroides
```

**Regla de composición:** A–D definen el **balance energético y macros**; E define **restricciones/estilo**; F **sobrescribe con guardrails** y baja la agresividad del plan. Ejemplo: "Ganar músculo" (B) + "Vegana" (E) + "prediabetes" (F) → superávit leve, proteína vegetal reforzada, carbos de bajo IG, y disclaimer + recomendación de seguimiento profesional.

---

## 2. Perfiles: variables a pedir y cálculos

### 2.1 Variables base (todos los perfiles)
Sexo biológico, edad, altura, peso actual, peso objetivo (si aplica), nivel de actividad diaria (PAL), días/tipo de entrenamiento, objetivo(s), patrón dietético, intolerancias/alergias, condiciones médicas, país (México → catálogo de alimentos locales), presupuesto, tiempo/dificultad para cocinar. Opcional pero valioso: % grasa corporal, contorno cintura, medida de sueño/estrés.

### 2.2 Fórmulas del motor (aterrizadas)

**Metabolismo basal — Mifflin-St Jeor** (estándar, buen sesgo bajo en población general):
- Hombre: `BMR = 10·peso(kg) + 6.25·altura(cm) − 5·edad + 5`
- Mujer:  `BMR = 10·peso(kg) + 6.25·altura(cm) − 5·edad − 161`
- Si hay % grasa fiable → **Katch-McArdle**: `BMR = 370 + 21.6·MLG(kg)` (MLG = masa libre de grasa).

**TDEE (gasto total)** = `BMR · PAL`:
| PAL | Perfil |
|-----|--------|
| 1.2 | Sedentario |
| 1.375 | Ligero (1-3 entrenos/sem) |
| 1.55 | Moderado (3-5) |
| 1.725 | Alto (6-7) |
| 1.9 | Muy alto (2 sesiones/día, físico) |
> Alternativa más precisa para deportistas: `TDEE = BMR·PAL_base(1.2–1.4) + kcal_entreno_del_día` (estimar kcal por sesión: correr ≈ 1 kcal·kg·km).

**Objetivo energético:**
- Perder grasa: `objetivo = TDEE · (1 − d)`, d = 0.15–0.25. Tope de seguridad: no bajar de `BMR·1.1` ni perder >1%/sem del peso. 1 kg grasa ≈ 7700 kcal.
- Ganar músculo: `objetivo = TDEE · (1 + s)`, s = 0.10–0.15 (lean bulk ≈ +250–400 kcal). Ritmo 0.25–0.5%/sem.
- Recomposición: en TDEE (±5%), proteína alta, progresión de fuerza.
- Mantener/salud: TDEE.

**Macros:**
- **Proteína (g/kg peso, o MLG si obesidad):** salud 1.2–1.6 · resistencia 1.4–1.8 · hipertrofia 1.6–2.2 · pérdida de grasa (preservar músculo) 1.8–2.4 · fuerza 1.6–2.0.
- **Grasa:** mínimo 0.8 g/kg (hormonal); rango 20–35% kcal. Keto: 65–75% kcal.
- **Carbohidratos:** el resto. Resistencia según volumen: 3–5 g/kg (bajo) → 6–10 g/kg (alto) → 8–12 g/kg (carga). Low-carb: <100–130 g/día.
  `carbos_g = (objetivo_kcal − proteína_g·4 − grasa_g·9) / 4`
- **Fibra:** ~14 g / 1000 kcal. **Azúcar añadido:** <10% kcal (salud), señalar en el registro.

**Hidratación:** base `30–40 ml/kg/día`. Ejercicio: +`500–750 ml por hora`, ajustado por **tasa de sudoración** = `(peso_pre − peso_post + líquido_ingerido) / horas`. 
**Electrolitos (resistencia):** sodio `300–600 mg/h` (hasta 800–1000 en calor/sudador salado); reponer potasio/magnesio en sesiones >2h.

**Carga de carbohidratos (pre-competencia, ≥90 min de esfuerzo):** `8–12 g/kg/día` las 36–48h previas, bajando fibra y grasa. **Durante:** 30–60 g carbos/h (>2.5h: hasta 90 g/h con mezcla glucosa+fructosa 2:1). **Pre-carrera (3-4h antes):** 1–4 g/kg carbos bajos en fibra.
**Post-entreno (ventana si <8h a la próxima sesión):** `0.3 g/kg proteína + 0.8–1.2 g/kg carbos`; si no, cubrir en las comidas del día.

**Ajuste semanal automático** (motor §4): comparar **tendencia** de peso (media móvil 7 días, no el dato diario) contra el ritmo objetivo; si desviación > umbral, ajustar kcal en pasos de **±5–10% (≈100–250 kcal)**, priorizando carbos al bajar/proteína fija.

### 2.3 Ejemplos completos

**A) Runner — media maratón** · Hombre, 35 a, 72 kg, 178 cm, 40 km/sem, objetivo *rendir/mantener*.
- BMR = 10·72 + 6.25·178 − 5·35 + 5 = **1663 kcal**
- TDEE (PAL 1.6, incluye carrera) ≈ **2800 kcal**
- Proteína 1.6 g/kg = **115 g** (460 kcal) · Grasa 1.0 g/kg = **72 g** (648 kcal)
- Carbos = (2800 − 460 − 648)/4 = **423 g** (≈5.9 g/kg, adecuado)
- Hidratación ≈ 2.5 L/día + 500–750 ml/h de carrera; sodio 400 mg/h en tiradas largas
- Semana de carrera: carga 8–10 g/kg (48h antes) → ~600–720 g carbos/día; durante: geles 40–60 g carbos/h.

**B) Pérdida de grasa** · Mujer, 30 a, 70 kg, 165 cm, actividad ligera, objetivo *definición*.
- BMR = 10·70 + 6.25·165 − 5·30 − 161 = **1420 kcal**
- TDEE (PAL 1.375) ≈ **1953 kcal** → déficit 20% = **~1560 kcal** (ritmo ~0.35 kg/sem, seguro)
- Proteína 2.0 g/kg = **140 g** (560 kcal, preserva músculo y sacia) · Grasa 0.8 g/kg = **56 g** (504 kcal)
- Carbos = (1560 − 560 − 504)/4 = **124 g** (prioridad: verduras + carbos peri-entreno)
- Hidratación ~2.3 L; fibra ≥22 g. Chequeo: si en 3 sem no baja → recorte −120 kcal o +pasos.

**C) Ganancia muscular** · Hombre, 24 a, 68 kg, 175 cm, fuerza 4×/sem, objetivo *volumen limpio*.
- BMR = 10·68 + 6.25·175 − 5·24 + 5 = **1659 kcal**
- TDEE (PAL 1.55) ≈ **2571 kcal** → superávit 12% = **~2880 kcal** (ritmo ~0.3%/sem)
- Proteína 2.0 g/kg = **136 g** (544 kcal) · Grasa 0.9 g/kg = **61 g** (549 kcal)
- Carbos = (2880 − 544 − 549)/4 = **447 g** (combustible de entrenos)
- Chequeo: si sube >0.5%/sem varias semanas → probablemente grasa, bajar superávit a +8%.

---

## 3. Chat Nutricionista IA

### 3.1 Contexto del usuario que necesita cada respuesta (el "perfil" que se inyecta)
Objeto compacto que va en el **system prompt cacheado** (para abaratar, §6):
```
{ objetivo_primario, objetivos_sec, sexo, edad, peso, altura, TDEE, kcal_objetivo,
  macros_objetivo{prot,carb,gras}, patron_dieta, intolerancias[], alergias[],
  condiciones_medicas[], pais, presupuesto, tiempo_cocina, dificultad,
  progreso_reciente{tendencia_peso, adherencia_%, kcal_medias_7d, macros_pendientes_hoy},
  entrenos_proximos[] }
```

### 3.2 Cómo aterriza cada respuesta
Toda respuesta se ancla en **datos del usuario**, no en genéricos:
- "¿Qué ceno?" → mira `macros_pendientes_hoy` + preferencias + país → propone opción concreta con kcal/macros que **cierran** el día.
- "¿Voy bien?" → lee `tendencia_peso` vs ritmo objetivo + adherencia → veredicto + 1 ajuste.
- Siempre en español, con números del usuario, y ofrece la acción (registrar/replanear) en 1 tap.

### 3.3 Guardrails del chat
1. **Ámbito:** solo nutrición/hábitos/rendimiento. Fuera de ámbito → redirige.
2. **No médico:** ante síntomas, medicación, o petición de "curar/tratar" → disclaimer + derivar a profesional (§5).
3. **Sin extremos:** rechaza déficits agresivos (<BMR·1.1), dietas <1200 kcal sin supervisión, "detox", pérdidas >1%/sem, ayunos prolongados en perfiles de riesgo.
4. **Respeta restricciones duras:** alergia/celiaquía/veganismo NUNCA se violan en un plan (validación en código, no solo en prompt).
5. **Honestidad de incertidumbre:** si faltan datos, los pide; no inventa cifras clínicas.
6. **Inyección/seguridad:** el perfil va como contexto de sistema; el mensaje del usuario no puede reescribir reglas.

### 3.4 Lógica de PLANES de comida
Entradas: `macros_pendientes` (o del día completo), preferencias/rechazos, intolerancias/alergias (**filtro duro**), presupuesto, país (catálogo MX), tiempo y dificultad de cocina, nº comidas.
Flujo:
1. Repartir kcal/macros por comida (ej. desayuno 25%, comida 35%, cena 30%, snacks 10%).
2. Generar recetas/opciones que cumplan macros por comida ±10%, respetando filtros duros.
3. Devolver por comida: título, ingredientes con gramajes, kcal/macros, costo aprox, tiempo, dificultad.
4. **Recalcular al cambiar una comida:** si el usuario cambia/rechaza una comida, se recomputan los macros restantes y **solo** se re-generan las comidas afectadas (no todo el plan) → ahorra tokens y da control. (Ver "presets de porción" y memoria de platillos en `plan/ia-precision.md`.)
5. Preferir **grounding** contra BD nutricional para los números (USDA/OFF/SMAE — Beta) y no alucinar; mientras tanto, marcar "estimado".

---

## 4. Motor adaptativo (reglas + explicación del porqué)

Se ejecuta semanalmente (o al registrar peso). Usa **media móvil 7 días** y adherencia. Cada regla → detección → propuesta → **explicación**. Siempre transparente ("te propongo esto porque…").

| Señal detectada | Regla (umbral) | Ajuste propuesto | Explicación al usuario |
|---|---|---|---|
| **Baja demasiado rápido** | pérdida >1%/sem 2 sem seguidas | +150–250 kcal (carbos/grasa) | "Bajar tan rápido arriesga músculo y rebote; subimos un poco para que sea sostenible." |
| **Estancamiento (grasa)** | 0 cambio ≥3 sem con adherencia alta | −5–10% kcal o +pasos/cardio | "Tu cuerpo se adaptó; un recorte pequeño reactiva el déficit." |
| **Estancamiento con baja adherencia** | 0 cambio + adherencia <70% | NO recortar; trabajar hábito | "Antes de tocar kcal, apuntemos a registrar y cumplir 5 días." |
| **Gana grasa en volumen** | +>0.5%/sem varias sem, fuerza estancada | superávit +12%→+8% | "Estás ganando más grasa que músculo; afinamos el superávit." |
| **No gana en volumen** | 0 cambio ≥3 sem | +150 kcal | "Faltó combustible/estímulo; subimos energía." |
| **Mejora en running** | ritmo↑ o FC↓ a mismo esfuerzo | mantener + optimizar carbos peri-entreno | "Vas mejor; sostenemos y afinamos combustible." |
| **Fatiga/bajo rendimiento** | sesiones fallidas + carbos bajos | +carbos, revisar sueño/déficit | "Poco glucógeno hunde el rendimiento; subimos carbos." |
| **Deshidratación probable** | pérdida de peso intra-sesión alta | +plan de hidratación/electrolitos | "Sudas mucho; ajustamos líquidos y sodio." |
| **Proteína crónica baja** | <objetivo 5+ días | sugerir fuentes según dieta/país | "La proteína protege músculo; te doy opciones fáciles." |

**Regla de oro:** máximo **un ajuste por ciclo**, explicado, reversible, y nunca por debajo de los topes de seguridad.

---

## 5. ⚠️ CRÍTICO — Condiciones médicas (área de mayor riesgo legal)

**Esta es el área #1 de riesgo del producto.** Un mal consejo a un diabético o hipertenso puede causar daño real y demanda. Postura recomendada: **máximamente conservadores**.

### 5.1 Qué SÍ / qué NO hacemos
- **SÍ:** informar en términos generales, organizar comidas dentro de límites que el usuario/su médico ya conoce, recordar hábitos, registrar y visualizar. Ej.: "Muchas guías sugieren vigilar el sodio en hipertensión; aquí puedes ver tu sodio diario."
- **NO:** diagnosticar, prescribir dietas terapéuticas, indicar/ajustar medicación, dar rangos de glucosa/insulina objetivo, "curar" hígado graso, sustituir seguimiento clínico.

### 5.2 Disclaimers (fuertes, no letra chica)
- **Onboarding con condición médica:** pantalla de consentimiento explícita: *"Esta app no es un dispositivo médico ni sustituye a tu profesional sanitario. Consulta siempre a tu médico/nutriólogo antes de cambiar tu dieta, sobre todo con [condición]. En emergencias, acude a un servicio de salud."* (aceptación registrada con fecha).
- **En cada respuesta del chat tocando la condición:** disclaimer breve reincidente + sugerencia de validar con su profesional.
- **Banner persistente** en el módulo de condiciones médicas.

### 5.3 Nivel de conservadurismo por condición (recomendación)
| Condición | Postura |
|---|---|
| **Diabetes T1 / embarazo / ERC / T1 en menores** | **Máxima cautela.** No dar objetivos numéricos ni planes terapéuticos. Solo registro + educación general + "consulta a tu equipo médico". Evaluar **excluir** de features automáticas de macros. |
| **Diabetes T2 / prediabetes** | Conservador. Educación (carbos de bajo IG, fibra), sin prescribir; disclaimer fuerte; recomendar seguimiento. |
| **Hipertensión / colesterol / hígado graso / sínd. metabólico** | Conservador-medio. Visualizar sodio/grasas saturadas/azúcar y hábitos, con disclaimer; no "tratamiento". |
| **Intolerancias (lactosa/FODMAP)** | Manejable como restricción de preferencia + educación; bajo riesgo. |
| **Celiaquía / alergias** | **Filtro DURO en código** (nunca sugerir el alérgeno). Riesgo alto por seguridad alimentaria, no por "consejo": un fallo puede ser grave → doble validación y etiqueta "verifica siempre el etiquetado". |

### 5.4 Recomendación estratégica
1. **MVP:** lanzar Premium **sin** planes/macros automáticos para el grupo de "máxima cautela"; ofrecerles solo registro + educación + disclaimers.
2. **Legal:** Términos y Condiciones + consentimiento informado revisados por abogado; política de datos de salud (son datos sensibles — GDPR/LFPDPPP MX); no almacenar más de lo necesario.
3. **Clínico:** que un nutriólogo colegiado valide fórmulas, umbrales y copys de las condiciones antes de producción.
4. **Producto:** un "modo condición médica" que globalmente baja agresividad y activa guardrails; probable filtro de guardrail dedicado sobre las salidas del chat en estos perfiles.

---

## 6. Costo de IA por función (impacto en margen a 99 MXN/mes)

**Modelo base tras la migración:** `claude-haiku-4-5` (~$1 / 1M tok entrada, ~$5 / 1M salida). Tipo de cambio de referencia ~20 MXN/USD → **99 MXN ≈ $4.95**. Con **prompt caching** el perfil del usuario (system, ~1.5k tok) se cobra a ~0.1× en lecturas.

| Función | Tokens aprox (in / out) | Costo/uso (USD) | Nota |
|---|---|---|---|
| **Mensaje de chat** | ~2000 in (1.5k cacheados) / 400 out | **~$0.0027** | in: 500·$1/M + 1500·$0.1/M + out 400·$5/M |
| **Plan de comida (1 día)** | ~2500 / 2000 | **~$0.011** | |
| **Plan semanal** | ~3000 / ~9000 (o 7× diario) | **~$0.05** | preferir regenerar solo lo cambiado |
| **Análisis de foto** (existente) | imagen + ~400 out | **~$0.002–0.004** | ver `plan/ia-precision.md` (la imagen domina el costo) |
| **Ajuste adaptativo semanal** | ~1500 / 300 | **~$0.003** | 4/mes |

**Costo IA por usuario activo/mes (escenario medio):** chat 100 msg (~$0.27) + 4 planes (~$0.15) + fotos 3/día (~$0.27) + ajustes (~$0.01) ≈ **$0.70 USD ≈ 14 MXN**.
- Sobre 99 MXN de ingreso bruto → **~14% del ingreso** en IA. Con Stripe (~3.6%+comisión) e infra, **margen bruto sano (~65–75%)** *si se capea el uso*.
- **Riesgo:** el **chat** es la variable que dispara el costo. Un power-user (500+ msg/mes, planes diarios) puede llegar a **$2–3 USD (40–60 MXN)** → comería el margen.

**Recomendaciones de costo/margen:**
1. **Caps por tier:** Free = fotos y chat muy limitados; Premium = generoso con **fair-use suave** (ej. aviso a partir de X mensajes/día).
2. **Chat en Haiku** por defecto; reservar un modelo mayor (Sonnet/Opus) solo para planificación compleja como **upsell "IA avanzada"**.
3. **Prompt caching agresivo** del perfil (system estable) y **regenerar solo la comida cambiada**, no el plan entero.
4. **Memoria de platillos frecuentes** (0 costo API) para lo recurrente (ver `plan/ia-precision.md`).
5. **Planes plantilla + relleno**: partir de plantillas por objetivo/dieta y que la IA solo ajuste, en vez de generar de cero cada vez.

---

## Coordinación
- **Drucker (Producto):** taxonomía §1 y tiers/caps §6 deben mapear a la estructura de planes y al onboarding; el "modo condición médica" §5 es decisión de producto + legal.
- **Rams (UX):** onboarding que capture las variables §2.1 sin fricción (progresivo), consentimiento §5.2 claro, y UI del chat/planes que muestre el "porqué" de cada ajuste §4 y los disclaimers §5 de forma visible pero no invasiva.
- **CTO (Torvalds):** filtros duros (alergias/celiaquía) en código, no solo prompt; prompt caching; integración del grounding nutricional (Beta).

**Prioridad recomendada:** (1) motor de cálculo §2 + onboarding, (2) chat con guardrails §3/§5, (3) planes §3.4, (4) motor adaptativo §4, (5) módulo condiciones médicas §5 con validación legal/clínica antes de exponerlo.
