# Ola 1 — Spec del motor determinista (4 coaches) · listo para CTO

**Autor:** Karpathy AI-Nutri · **Impl:** Torvalds (gkmi48v7) · **Reporta a:** Lugia (mwao6a57)
**Base:** `plan/premium-vision-nutricion-ia.md` (§2) y `plan/rediseno-coach-ia.md`. **Fecha:** 2026-07-28

> **Alcance:** este motor es **100% determinista (sin IA)**. Calcula meta calórica, macros, hidratación y ajustes con fórmulas fijas y topes de seguridad. La IA solo *redacta* (chat, consejo del día, insights) sobre estos números — **nunca los inventa**. Todas las unidades: peso en kg, altura en cm, energía en kcal, macros en gramos. Redondear kcal a entero, macros a entero.

---

## 0. Núcleo compartido (todos los coaches)

### 0.1 Constantes
```
ACTIVITY_FACTORS = { sedentario:1.2, ligero:1.375, moderado:1.55, alto:1.725, muy_alto:1.9 }
KCAL_G           = { prot:4, carb:4, gras:9 }
KCAL_POR_KG_GRASA = 7700
PISO_KCAL_SEXO   = { hombre:1500, mujer:1200 }   // piso duro de seguridad
```

### 0.2 Metabolismo basal (BMR)
```
function bmr(sexo, peso, altura, edad, grasa_pct = null):
    if grasa_pct != null and 3 <= grasa_pct <= 60:        // Katch-McArdle (preferente si hay % grasa fiable)
        mlg = peso * (1 - grasa_pct/100)
        return 370 + 21.6 * mlg
    // Mifflin-St Jeor
    s = (sexo == 'hombre') ? 5 : -161
    return 10*peso + 6.25*altura - 5*edad + s
```

### 0.3 TDEE
```
function tdee(BMR, actividad):
    return BMR * ACTIVITY_FACTORS[actividad]
// Runner usa una variante con entreno explícito — ver §3.
```

### 0.4 Topes de seguridad (se aplican SIEMPRE, al final del cálculo)
```
function piso_kcal(BMR, sexo):
    return max(BMR * 1.1, PISO_KCAL_SEXO[sexo])

function aplica_topes_deficit(objetivo, BMR, sexo, peso, deficit_kcal_dia):
    // 1) nunca por debajo del piso
    objetivo = max(objetivo, piso_kcal(BMR, sexo))
    // 2) ritmo de pérdida <= 1% del peso / semana
    perdida_sem_kg = (deficit_kcal_dia * 7) / KCAL_POR_KG_GRASA
    if perdida_sem_kg > 0.01 * peso:
        max_deficit_dia = (0.01 * peso * KCAL_POR_KG_GRASA) / 7
        objetivo = TDEE - max_deficit_dia         // recalcular con déficit tope
        objetivo = max(objetivo, piso_kcal(BMR, sexo))
    return round(objetivo)
```

### 0.5 Reparto de macros (helper)
```
// prot y fat en g/kg; carbos = resto de kcal
function macros(objetivo_kcal, peso, prot_g_kg, fat_g_kg):
    prot_g = round(prot_g_kg * peso)
    fat_g  = round(fat_g_kg  * peso)
    carb_kcal = objetivo_kcal - prot_g*4 - fat_g*9
    if carb_kcal < 0:                     // déficit muy apretado: baja grasa hasta piso 0.8 g/kg
        fat_g = round(0.8 * peso)
        carb_kcal = objetivo_kcal - prot_g*4 - fat_g*9
    carb_g = round(max(carb_kcal, 0) / 4)
    return { prot_g, carb_g, fat_g, warn: (carb_kcal < 0) }  // warn=true => avisar en UI, no bloquear
```

### 0.6 Hidratación y fibra
```
function hidratacion_ml(peso, min_entreno_dia = 0):
    base    = 35 * peso                         // 30–40 ml/kg, punto medio
    entreno = (min_entreno_dia / 60) * 600      // ~600 ml por hora de ejercicio
    return round(base + entreno)

function fibra_g(objetivo_kcal):
    return round(14 * objetivo_kcal / 1000)     // 14 g / 1000 kcal
```

---

## 1. Coach PÉRDIDA DE GRASA

**(a) Onboarding:** sexo, edad, peso, altura, actividad, [grasa_pct opcional], ritmo {conservador|moderado} (agresivo NO se ofrece), peso_objetivo (opcional, solo para ETA).

**(b) Cálculo:**
```
B   = bmr(sexo, peso, altura, edad, grasa_pct)
T   = tdee(B, actividad)
def_pct = (ritmo == 'conservador') ? 0.15 : 0.20      // tope duro 0.25, nunca se expone
objetivo = T * (1 - def_pct)
deficit_dia = T - objetivo
objetivo = aplica_topes_deficit(objetivo, B, sexo, peso, deficit_dia)   // §0.4

// Macros: proteína alta para preservar músculo
base_prot = (grasa_pct != null && IMC_alto(peso,altura)) ? mlg_de(peso,grasa_pct) : peso
prot_g_kg = 2.0            // rango 1.8–2.4; usar 2.0
fat_g_kg  = 0.8            // piso hormonal
M = macros(objetivo, peso, prot_g_kg, fat_g_kg)   // carbos = resto
agua = hidratacion_ml(peso, min_entreno_dia_estimado)
fibra = fibra_g(objetivo)
```
**Topes:** objetivo ≥ piso (§0.4); pérdida ≤ 1%/sem; proteína ≥ 1.8 g/kg; grasa ≥ 0.8 g/kg; si `M.warn` (carbos exprimidos) → avisar, no bloquear.
**Sanity check (mujer 30a/70kg/165cm/ligero, moderado):** B≈1420, T≈1953, objetivo≈1560 (>piso 1562? usar max → ~1562), prot 140 g, gras 56 g, carbos ~124 g. ✔

**(c) Recompute dinámico:** ver §5.

---

## 2. Coach HIPERTROFIA

**(a) Onboarding:** sexo, edad, peso, altura, actividad, experiencia {novato|intermedio|avanzado}, dias_entreno.

**(b) Cálculo:**
```
B = bmr(...); T = tdee(B, actividad)
sup_pct = { novato:0.15, intermedio:0.11, avanzado:0.08 }[experiencia]
objetivo = T * (1 + sup_pct)

// tope de ritmo de ganancia (evitar exceso de grasa)
max_gain_sem = { novato:0.005, intermedio:0.0035, avanzado:0.0025 }[experiencia] * peso  // kg/sem
surplus_dia  = objetivo - T
if (surplus_dia * 7)/KCAL_POR_KG_GRASA > max_gain_sem:      // aprox usando 7700 como proxy
    objetivo = T + (max_gain_sem * KCAL_POR_KG_GRASA)/7

prot_g_kg = 2.0     // 1.6–2.2
fat_g_kg  = 0.9
M = macros(objetivo, peso, prot_g_kg, fat_g_kg)   // carbos amplios
agua = hidratacion_ml(peso, min_entreno_dia_estimado)
fibra = fibra_g(objetivo)
```
**Topes:** superávit ≤ 15%; ganancia ≤ ritmo por experiencia; proteína 1.6–2.2 g/kg; grasa ≥ 0.8 g/kg.
**Sanity (hombre 24a/68kg/175cm/moderado, novato):** B≈1659, T≈2571, objetivo≈**2945** (el superávit 15% da 2957 pero el tope de ganancia 0.5%/sem lo baja a 2945), prot 136 g, gras 61 g, carbos ~**463** g. ✔ *(verificado contra el código, 2026-07-28).*

**(c) Recompute dinámico:** ver §5.

---

## 3. Coach RUNNER

**(a) Onboarding:** sexo, edad, peso, altura, km_semana, dias_entreno, distancia_objetivo {5k|10k|21k|42k|ultra}, fecha_carrera (opcional), ritmo (opcional), superficie {asfalto|trail}, lesiones (texto, informativo). Objetivo por defecto: **mantener/rendir** (si además quiere bajar grasa, déficit máx 10% con piso de carbos).

**(b) Cálculo:** TDEE con entreno explícito (evita doble conteo):
```
B = bmr(...)
T_base = B * 1.35                                  // PAL base sin ejercicio (vida diaria)
km_dia = km_hoy ?? (km_semana / 7)                 // usa km de hoy si se conoce
kcal_entreno = 1.0 * peso * km_dia                 // ~1 kcal·kg·km
objetivo = T_base + kcal_entreno                   // mantenimiento del día

// si objetivo secundario = perder grasa:
if quiere_bajar_grasa:
    objetivo = objetivo * (1 - min(deficit_pct, 0.10))   // déficit runner tope 10%

// Macros
prot_g_kg = 1.6
fat_g_kg  = 1.0
M = macros(objetivo, peso, prot_g_kg, fat_g_kg)
// Guardrail de carbos para resistencia: mínimo por volumen
carb_min_g_kg = (km_semana >= 60) ? 7 : (km_semana >= 30 ? 6 : 5)
if M.carb_g < carb_min_g_kg * peso:
    // subir carbos bajando grasa hasta piso 0.8 g/kg
    fat_g = max(round(0.8*peso), fat_g - deficit_para_cubrir)
    recomputar M con fat_g fijo
min_entreno_dia = (km_dia > 0) ? estimar_min(km_dia, ritmo) : 0
agua = hidratacion_ml(peso, min_entreno_dia)
```
**Carbos por fase (targets que muestra el coach, g/kg/día):**
```
base           : 5–7
dia_alto_vol    : 7–10   (tirada larga / doble sesión)
carga_pre_carrera : 8–12  (activar SOLO si fecha_carrera - hoy <= 2 días Y distancia_objetivo >= 21k)
```
**Timing / hidratación / electrolitos (recomendación, no macro diario):**
```
pre (3-4h)   : 1–4 g/kg carbos bajos en fibra
durante      : 30–60 g carbos/h  (>2.5h: hasta 90 g/h, mezcla glucosa+fructosa 2:1)
post (<8h a la próxima sesión): 0.3 g/kg proteína + 0.8–1.2 g/kg carbos
liquido      : 500–750 ml/h  (ajustar con tasa_sudoracion si se mide)
sodio        : 300–600 mg/h  (hasta 800–1000 en calor / sudador salado)
tasa_sudoracion_l_h = (peso_pre - peso_post + litros_ingeridos) / horas
```
**Topes:** NUNCA déficit agresivo en bloque de entreno (máx 10%); carbos ≥ mínimo por volumen; grasa ≥ 0.8 g/kg; objetivo ≥ piso (§0.4).
**Sanity (hombre 35a/72kg/178cm, 40 km/sem, día de 8 km):** B≈1663, T_base≈2245, kcal_entreno≈576 → objetivo≈**2820**, prot 115 g. Los macros base darían gras 72 g / carbos ~428 g, pero el **guardrail de carbos** (40 km/sem → mín 6 g/kg = 432 g) se activa: baja la grasa a su piso 0.8 g/kg (**58 g**) y sube los carbos a ~**460** g. ✔ *(verificado contra el código, 2026-07-28).*

**(c) Recompute dinámico:** ver §5.

---

## 4. Coach BIENESTAR

**(a) Onboarding:** sexo, edad, peso, altura, actividad, foco_habito {comer_mas_sano|mantener|mas_agua|menos_ultraprocesados}.

**(b) Cálculo:** mantenimiento, macros balanceados, foco en hábitos (no en cifras estrictas).
```
B = bmr(...); T = tdee(B, actividad)
objetivo = T                                   // mantenimiento; NO se ofrece déficit aquí
prot_g_kg = 1.4; fat_g_kg = 0.9
M = macros(objetivo, peso, prot_g_kg, fat_g_kg)
agua = hidratacion_ml(peso)
fibra = fibra_g(objetivo)
// Metas de hábito (deterministas, para gamificar):
metas_habito = {
  agua_ml: agua,
  verdura_porciones: 3,                 // >=3/día
  ultraprocesados_max: 2,               // <=2 items/día (bandera, no bloqueo)
  azucar_anadido_max_kcal: 0.10 * objetivo
}
```
**Topes:** sin déficit por defecto; si el usuario pidiera bajar de peso, derivar al coach de pérdida de grasa (no lo hace bienestar). Macros como **rangos guía** (±10%), no estrictos: la UI enfatiza hábitos, no el conteo fino.

**(c) Recompute dinámico:** ver §5 (aplica igual; en bienestar los pendientes se muestran como guía suave).

---

## 4b. Coach RECOMPOSICIÓN  (5ta tarjeta de Ola 1)

La vía **coherente** para "perder grasa y ganar músculo a la vez": calorías cerca de mantenimiento (déficit **ligero**, modulado por % grasa) + **proteína alta** + entrenamiento de fuerza. No es un déficit agresivo ni un superávit; por eso NO se resuelve multi-seleccionando objetivos contradictorios (§ nota final).

**(a) Onboarding:** sexo, edad, peso, altura, actividad, **[grasa_pct — recomendado: modula el déficit]**, dias_entreno (opcional).

**Params (coaches.js):**
```
recomposicion: {
  id:'recomposicion', label:'Recomposición',
  proteinPerKg: 2.2,          // 2.0–2.4 (alta, prioriza síntesis proteica)
  fatPerKg: 0.9,
  // déficit LIGERO modulado por % grasa (umbrales por sexo); tope duro 10%
  deficitByBodyFat: {
    male:   [{bf:25, def:0.10}, {bf:18, def:0.05}, {bf:0, def:0.0}],
    female: [{bf:32, def:0.10}, {bf:25, def:0.05}, {bf:0, def:0.0}],
  },
  defaultDeficit: 0.05,        // si NO hay % grasa → déficit ligero conservador
}
```

**(b) Cálculo:**
```
B = bmr(...)            // Katch-McArdle si hay grasa_pct (habitual en recomp), si no Mifflin
T = tdee(B, actividad)

// déficit ligero modulado por % grasa (más grasa corporal → más margen de déficit)
function deficitRecomp(grasa_pct, sexo):
    if grasa_pct == null: return 0.05                       // default conservador
    tabla = deficitByBodyFat[sexo]
    return primer def de la tabla donde grasa_pct >= bf     // 0.10 / 0.05 / 0.0

defPct = deficitRecomp(grasa_pct, sexo)         // ∈ {0.0, 0.05, 0.10}
objetivo = T * (1 - defPct)
deficitDia = T - objetivo
objetivo = aplicaTopesDeficit({objetivo, T, B, sexo, peso, deficitDia})   // §0.4: piso + ritmo ≤1%/sem

prot_g_kg = 2.2 ; fat_g_kg = 0.9
M = macros(objetivo, peso, 2.2, 0.9)            // carbos = resto
agua = hidratacion_ml(peso, min_entreno_dia_estimado)
fibra = fibra_g(objetivo)
```

**Topes (los MISMOS de siempre):** déficit **máximo 10%** (nunca agresivo); objetivo ≥ piso (§0.4, `max(BMR·1.1, 1500H/1200M)`); ritmo ≤ 1%/sem; proteína ≥ 2.0 g/kg; grasa ≥ 0.8 g/kg. La proteína alta se mantiene **aunque** el déficit exprima los carbos (`macros()` baja la grasa a su piso y marca `warn`, no bloquea).

**Sanity check (verificado contra el código, 2026-07-28):**
- Hombre 30a/80kg/178cm, moderado (1.55), **grasa 22%** (media → −5%): B(Katch)≈1718, T≈2663, objetivo≈**2530**, prot **176 g**, gras **72 g**, carbos ~**294 g**, fibra 35, agua 2800. ✔
- Mismo sin % grasa (default −5%, Mifflin): ≈**2603** kcal, 176/313/72. ✔
- Grasa alta (95 kg, 30%) → −10%: **2520** kcal, 209/227/86. ✔
- Lean (72 kg, 12%) → **0% (mantenimiento)**: **2695** kcal, 158/369/65. ✔
- **Borde — peso muy bajo (mujer 42 kg, 35%, −10%):** objetivo cae a **1200** (piso femenino manda pese al −10%). ✔ seguridad intacta.

**(c) Recompute dinámico:** igual que el resto → §5.

---

## 5. Recompute dinámico de macros (compartido por los 5 coaches)

El objetivo diario (`objetivo_dia = {kcal, prot_g, carb_g, gras_g}`) es fijo por el coach. Lo dinámico es **lo pendiente** según lo consumido y el **replaneo de las comidas afectadas**.

```
function pendientes(objetivo_dia, consumido_hoy):
    return {
        kcal: objetivo_dia.kcal   - consumido_hoy.kcal,
        prot: objetivo_dia.prot_g - consumido_hoy.prot_g,
        carb: objetivo_dia.carb_g - consumido_hoy.carb_g,
        gras: objetivo_dia.gras_g - consumido_hoy.gras_g
    }   // valores negativos => excedido (mostrar, no ocultar)

// consumido_hoy = suma de comidas registradas (source of truth = tabla meals del día)
function on_meal_change(dia):
    consumido = sum(meals_registradas(dia))     // recomputar desde cero, no incremental
    pend = pendientes(objetivo_dia, consumido)
    return pend
```

**Reglas de replaneo (la parte determinista; la generación de recetas es IA aparte):**
- Al **cambiar/eliminar/registrar** una comida distinta → recomputar `consumido` desde las comidas del día y recalcular `pendientes`. **Solo** se re-generan las comidas planificadas **aún no consumidas** para cuadrar `pendientes` ±10% (llamada IA acotada; ver `plan/rediseno-coach-ia.md` §4). Las comidas ya consumidas no se tocan.
- **Presets de porción (0 IA):** al escalar una comida por factor f∈{0.5,1,1.5,2}: `macros_comida * f` y recomputar pendientes. Lineal, en cliente.
- **Lista de súper:** diff determinista — quitar ingredientes de la comida vieja, añadir los de la nueva, consolidar duplicados por ingrediente, agrupar por categoría; respetar `restricciones_duras` (filtro duro en código, nunca sugerir alérgeno/celiaquía).

### 5.1 Ajuste semanal automático (determinista; explicación la redacta IA)
```
function ajuste_semanal(coach, objetivo_actual, T, B, sexo, peso, m7d_actual, m7d_prev, adherencia):
    delta = m7d_actual - m7d_prev            // cambio de la media móvil 7d del peso (kg)
    if coach == 'perdida_grasa':
        if -delta > 0.01*peso:               // baja demasiado rápido
            return subir(objetivo_actual, +200, "bajar tan rápido arriesga músculo; subimos un poco")
        if abs(delta) < 0.002*peso and adherencia >= 0.8 and semanas_estancado >= 3:
            nuevo = max(objetivo_actual*0.92, piso_kcal(B,sexo))
            return set(nuevo, "te adaptaste; recorte del 8% para reactivar el déficit")
        if adherencia < 0.7:
            return sin_cambio("antes de tocar kcal, apuntemos a registrar y cumplir 5 días")
    if coach == 'hipertrofia':
        if delta > 0.005*peso:               // gana demasiado (probable grasa)
            return bajar(objetivo_actual, -150, "ganas más rápido de lo ideal; afinamos el superávit")
        if abs(delta) < 0.001*peso and semanas_estancado >= 3:
            return subir(objetivo_actual, +150, "faltó energía; subimos para seguir ganando")
    if coach == 'runner':
        // no tocar kcal por peso salvo objetivo grasa; priorizar rendimiento
        return revisar_carbos_y_recuperacion(...)
    if coach == 'bienestar':
        return foco_habitos(adherencia)      // no ajusta kcal; refuerza hábitos
    return sin_cambio()
// REGLA DE ORO: máximo UN ajuste por ciclo; reversible; nunca por debajo del piso.
```

---

## 6. CONSEJO DEL DÍA (spec)

**Cuándo:** una vez al día, **en la misma llamada de IA que el feedback AM** (comparte contexto cacheado → costo extra ≈ 0). Determinista la *selección del foco*; IA solo *redacta*.

**Datos de entrada (del objeto de contexto, §1.1 del rediseño):** perfil (coach, personalidad), `tendencias` (adherencia, racha, proteína cumplida, delta peso), `hoy.pendientes`, `proximo.entreno`, `memoria.hechos_clave` (favoritos, lesiones, compromisos), banderas de micros/hidratación.

**Selección de foco (determinista, evita repetir):**
```
FOCOS = [hidratacion, favorito, macro_pendiente, micro_bandera, habito, meal_prep, timing_entreno, progreso]
tips_recientes = memoria.tips_focos_ultimos_14d    // guardar foco (no el texto) de los últimos 14 días

function elegir_foco(ctx):
    candidatos = []
    if ctx.proximo.entreno is 'tirada_larga' or 'competencia_<=2d': candidatos += timing_entreno (peso 5)
    if ctx.tendencias.agua_media < 0.8*objetivo_agua: candidatos += hidratacion (peso 4)
    if ctx.tendencias.proteina_cumplida_dias >= 7: candidatos += progreso (peso 4)
    if ctx.hoy.pendientes.prot alto al mediodía: candidatos += macro_pendiente (peso 3)
    if hay micro_bandera (B12/hierro/sodio): candidatos += micro_bandera (peso 3)
    if ctx.memoria.favoritos no usado esta semana: candidatos += favorito (peso 2)
    ... (habito, meal_prep como relleno peso 1)
    candidatos = filtrar(candidatos, foco NOT IN tips_recientes)   // no repetir
    return argmax(peso) de candidatos (desempate aleatorio por índice del día)
```
**Salida:** string 1–2 frases + micro-CTA opcional, en el **tono elegido** (personalidad). Guardar el `foco` elegido en `tips_recientes`.
**Sin PII en la tarjeta compartible:** la versión compartible NO incluye nombre, peso, ni datos de salud; solo el tip genérico-personalizado y branding. (Coordinar diseño con Rams.)
**Costo:** fusionado con AM ≈ $0 extra; standalone ~$0.0015/día. Haiku.

---

## 7. REPORTE SEMANAL de insights (lógica)

**Cuándo:** semanal (domingo por la noche o cada 7 días desde el alta). **Detección 100% determinista** (métricas + reglas §5.1); la IA solo **redacta** los 1–3 insights y el foco de la semana.

**Métricas deterministas (calcular desde la BD, ventana 7 días):**
```
adherencia_pct        = dias_registrados / 7
kcal_media7d          = avg(kcal_consumidas)     ; desvio_vs_objetivo = kcal_media7d - objetivo.kcal
cumpl_prot_pct        = dias con prot >= 0.9*objetivo.prot_g / 7
cumpl_macros          = { prot, carb, gras } % de días en meta ±10%
agua_media_pct        = avg(agua_ml)/objetivo_agua
racha_registro        = dias consecutivos con registro
tendencia_peso        = media_movil7d_actual - media_movil7d_prev   (si hay logs)
entrenos_completados  = (runner) sesiones hechas / planificadas
```

**Reglas → insights (máx 3, prioriza señales fuertes):**
```
if tendencia y ajuste_semanal(...) propone cambio: insight #1 = ese ajuste CON su explicación
if cumpl_prot_pct >= 0.9 y semana previa < 0.6: insight de progreso ("subiste de X a Y en proteína")
if agua_media_pct < 0.8: insight de hidratación
if adherencia_pct < 0.7: insight de hábito (registrar), NO tocar kcal
if racha_registro es hito (7/14/30): insight de racha
```
**Salida estructurada (para UI + IA redacta):**
```
{
  semana: {desde, hasta},
  metricas: { adherencia_pct, kcal_media7d, desvio_vs_objetivo, cumpl_prot_pct, cumpl_macros,
              agua_media_pct, racha_registro, tendencia_peso, entrenos_completados },
  ajuste_propuesto: { hay:bool, nuevo_objetivo?, delta_kcal?, motivo },   // de §5.1, máx 1
  insights: [ {tipo, texto_IA} ],       // 1–3
  foco_semana: "string_IA"
}
```
**Costo:** ~1 llamada/semana, ~2k in (cacheado) / 500 out ≈ **$0.0045/sem ≈ $0.018/mes**. Haiku.

---

## 8. Notas de implementación para el CTO
- Motor determinista = **funciones puras** testeables (input → output), sin IA. Los sanity checks de cada coach sirven de test unitario.
- La IA (chat, consejo del día, reporte semanal) **recibe estos números ya calculados** en el contexto; su rol es redactar/tono, no recalcular. Guardrail: si la IA emite una cifra que no viene del motor, ignorarla en UI (mostrar solo las del motor).
- **Filtros duros** (alergias/celiaquía) en código, no en prompt.
- Persistir por usuario: `objetivo_dia`, `coach`, `personalidad`, `tips_recientes[14d]`, medias móviles y `semanas_estancado` para §5.1.
- Redondeos y `warn` de §0.5 deben mostrarse como aviso suave, nunca bloquear el guardado.

## 9. Nota — cómo comunicar objetivos combinados

- **"Perder grasa Y ganar músculo a la vez" = RECOMPOSICIÓN.** Es la vía coherente y se ofrece como **una tarjeta de objetivo propia** (la 5ta), no como multi-selección.
- **No permitir multi-seleccionar objetivos calóricos contradictorios** (p. ej. "pérdida de grasa" + "hipertrofia"): uno pide déficit y el otro superávit, y el motor no puede satisfacer ambos. El onboarding fuerza **un solo objetivo calórico** (pérdida de grasa · hipertrofia · recomposición · mantener · runner) y, si el usuario quiere las dos cosas, lo encamina a **Recomposición**.
- **Los estilos de dieta son un EJE APARTE** (mediterránea, keto, vegana, alta proteína, etc.): se combinan **con cualquier** objetivo como overlay de restricción/estilo, sin contradicción calórica (ver `plan/rediseno-coach-ia.md` A1). Es decir: **1 objetivo calórico × N estilos de dieta × 1 tono** — los objetivos calóricos son excluyentes; la dieta y el tono no.
- Copy sugerido en la tarjeta: *"¿Quieres perder grasa y ganar músculo? Elige **Recomposición** — comes cerca de tu mantenimiento con proteína alta para lograr ambas sin dietas extremas."*

**Coordinación:** Rams (UI de onboarding que capture las variables (a) de cada coach; **Recomposición como 5ta tarjeta**; que la selección de objetivo calórico sea de opción ÚNICA, con la dieta y el tono como ejes separados; tarjeta del consejo del día sin PII; UI del reporte semanal). Drucker (los **5** coaches de Ola 1 son no-médicos → sin diferir; personalidad/consejo del día como valor). Los coaches clínicos y de etapas NO entran en Ola 1 (§7 del rediseño).
