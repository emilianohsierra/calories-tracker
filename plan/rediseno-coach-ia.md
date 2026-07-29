# Rediseño — Coach IA y Sistema de Coaches (corazón del producto)

**Autor:** Karpathy AI-Nutri (AI Product Designer + nutricionista deportivo)
**Para:** Lugia (Director) · Coordinación: Rams (skm3lj3d), Drucker (6rllfvd6) · Impl: Torvalds (gkmi48v7)
**Base:** `plan/premium-vision-nutricion-ia.md` · **Fecha:** 2026-07-28

> **Límite legal (vigente en todo el documento):** el Coach IA **informa, calcula, organiza y motiva**. NO diagnostica, NO prescribe, NO ajusta tratamientos ni medicación, NO sustituye a un profesional sanitario. Los coaches médicos (§2, §7) operan en modo educativo conservador con disclaimers reforzados y validación clínica/legal previa a producción.

---

## 1. Coach IA conversacional (estilo asistente, no chatbot de botones)

Un solo asistente conversacional en lenguaje natural que **conoce al usuario** y adopta la voz de un entrenador personal. La especialización (§2) es un **overlay de dominio** sobre el mismo motor: el coach activo cambia el conocimiento y las variables, no la mecánica.

### 1.1 OBJETO DE CONTEXTO (lo que la IA sabe del usuario)
Se ensambla en cada request y va en el **system prompt cacheado** (clave para el costo, §8). Tres capas:

```jsonc
{
  // — PERFIL (estable; cambia poco) —
  "identidad": { "nombre": "", "sexo_biologico": "", "edad": 0, "altura_cm": 0 },
  "antropometria": { "peso_kg": 0, "peso_objetivo_kg": 0, "grasa_pct": null, "cintura_cm": null },
  "objetivo": { "primario": "", "secundarios": [], "fecha_meta": null },
  "coach_activo": "runner|hipertrofia|perdida_grasa|...",
  "dieta": { "patron": "", "kcal_objetivo": 0, "rango_kcal": [0,0],
             "macros": { "prot_g":0, "carb_g":0, "gras_g":0 }, "fibra_g":0, "hidratacion_ml":0 },
  "restricciones_duras": { "alergias": [], "intolerancias": [], "celiaquia": false, "religiosas": [] }, // NUNCA violar
  "preferencias": { "favoritos": [], "rechazos": [], "cocina": "mexicana", "pais": "MX",
                    "presupuesto": "", "tiempo_cocina_min": 0, "dificultad": "" },
  "salud": { "condiciones": [], "lesiones": [], "medicacion_declarada": [] }, // dispara §7
  "entrenamiento": { "deporte": "", "dias_semana": 0, "sesiones": [], "carga_actual": "" },
  "estilo_vida": { "horarios_comida": [], "sueno_h": null, "estres": null, "trabajo": "" },

  // — ESTADO (dinámico; cambia a diario/semanal) —
  "hoy": { "kcal_consumidas":0, "macros_consumidos":{}, "macros_pendientes":{},
           "agua_ml":0, "comidas_registradas":[], "entreno_de_hoy":null },
  "tendencias": { "peso_media7d":0, "delta_semana":0, "adherencia_pct":0, "kcal_media7d":0,
                  "proteina_cumplida_dias":0, "racha_registro":0 },
  "proximo": { "entreno":null, "competencia":null },

  // — MEMORIA (resumen; §3) —
  "memoria": { "hechos_clave":[], "resumen_conversacion":"", "compromisos_abiertos":[] }
}
```

### 1.2 Cómo aterriza CADA respuesta
Regla dura: **ninguna respuesta genérica.** Toda salida usa datos del objeto de contexto:
- *"¿Qué ceno?"* → `hoy.macros_pendientes` + `preferencias.favoritos` + `restricciones_duras` + `estilo_vida.horarios` → opción concreta con kcal/macros que **cierran** el día.
- *"¿Voy bien?"* → `tendencias` vs ritmo objetivo + `adherencia` → veredicto + 1 acción.
- *"Me duele la rodilla al correr"* → `salud.lesiones` + `entrenamiento` → consejo nutricional de recuperación **+ derivar a fisio/médico** (no diagnóstico).
- Siempre: español, números del usuario, y una **acción en 1 tap** (registrar / replanear / ver siguiente comida).

### 1.3 Tono (entrenador personal)
Cercano, directo, motivador sin ser cursi; celebra progreso real (§6), corrige sin regañar, honesto con la incertidumbre. Frases cortas, orientadas a la acción. Nunca robótico ni con listas de menú por defecto: **conversa**. Ejemplo: *"Vas 10 días seguidos llegando a tu proteína — hace 3 semanas ni te acercabas. Hoy te faltan 25 g; unos huevos con tu cena lo cierran. ¿Te la registro?"*

---

## 2. Sistema de coaches especializados

Cada coach = **prompt de dominio + variables que pide + cálculos/recomendaciones que hace**. Comparten el objeto de contexto y el motor de §1 del plan base.

| Coach | Conocimiento de dominio | Variables extra que pide | Cálculos / recomendaciones |
|---|---|---|---|
| **Runner** (ver §2.1) | Fisiología de resistencia, glucógeno, periodización | km/sem, ritmo, distancia+fecha carrera, VO2/FC, superficie, lesiones | Carbos por fase, hidratación/electrolitos, timing, carga/descarga, plan de carrera |
| **Hipertrofia** | Balance proteico, superávit, progresión | split, series/semana, RIR, experiencia | Superávit lean (+10-15%), prot 1.6-2.2 g/kg, carbos peri-entreno, timing prot |
| **Pérdida de grasa** | Déficit sostenible, preservar músculo | ritmo deseado, actividad, hambre | Déficit 15-25% (tope BMR·1.1), prot 1.8-2.4 g/kg, fibra/saciedad |
| **Cardiovascular / salud del corazón** | Perfil lipídico, sodio, fibra soluble | tensión (si la declara), historial | Vigilar grasa sat., sodio, +fibra soluble, patrón DASH/mediterráneo (educativo) |
| **Vegano** | Proteína vegetal, combinación, B12/hierro/omega-3 | fuentes que usa, suplementos | Prot 1.6-2.2 g/kg con mezcla legumbre+cereal, banderas B12/hierro/Ca/omega-3/D |
| **Keto / low-carb** | Cetosis, electrolitos, adaptación | tolerancia carbos, síntomas | Carbos <20-50 g o <10% kcal, grasa 65-75%, electrolitos (gripe keto) |
| **Diabetes** ⚠️ (ver §2.2) | Carbos, índice glucémico, evitar picos | tipo, tratamiento, horarios (glucosa: solo registro) | Educación IG, combinar macros, swaps; NUNCA fija glucosa ni ajusta insulina |
| **Hipertensión** ⚠️ | Sodio, potasio, DASH | tensión declarada, medicación | Vigilar sodio (educativo), +potasio/verdura; derivar; sin prescribir |
| **Embarazo/lactancia** ⚠️ | Requerimientos aumentados, alimentos a evitar | trimestre, náuseas | Educación (folato, hierro, evitar crudos/alcohol); **derivar a control prenatal** |
| **Infantil** ⚠️ | Crecimiento, no dietas restrictivas | edad, contexto familiar | Educación de hábitos a padres; **sin déficit/macros agresivos**; derivar a pediatra |
| **Adulto mayor** ⚠️ | Sarcopenia, hidratación, deglución | movilidad, apetito, fármacos | +proteína (1.2-1.6 g/kg), hidratación, textura; cautela con fármacos; derivar |
| **Bienestar / hábitos** | Cambio de conducta, sueño, estrés | hábitos objetivo | Micro-metas, más verdura/agua/menos ultraprocesados; bajo riesgo |

⚠️ = coach médico → §7 (modo conservador, disclaimers, diferir en MVP).

### 2.1 COACH RUNNER — completo

**Variables:** km/semana actuales, ritmo objetivo (min/km), distancia+fecha de la carrera, VO2máx (o estimarlo: `VO2 ≈ 15.3·(FCmax/FCreposo)`), FC reposo/máx, superficie (asfalto/trail), sesiones tipo (largo, series, tempo, fácil), historial de lesiones, peso.

**Cálculos:**
- **Gasto de carrera:** `≈ 1 kcal · kg · km` → suma al TDEE del día.
- **Carbohidratos por fase:** base 5-7 g/kg · picos de volumen 7-10 g/kg · **carga** (48h pre, ≥90 min de esfuerzo) 8-12 g/kg (baja fibra y grasa).
- **Hidratación:** 30-40 ml/kg/día + 500-750 ml/h de carrera; personalizar con **tasa de sudoración** = `(peso_pre − peso_post + líquido) / horas`.
- **Electrolitos:** sodio 300-600 mg/h (hasta 800-1000 en calor/sudador salado); potasio/magnesio en >2h.
- **Timing:** pre (3-4h) 1-4 g/kg carbos bajos en fibra · durante 30-60 g/h (>2.5h hasta 90 g/h glucosa+fructosa 2:1) · post 0.3 g/kg proteína + 0.8-1.2 g/kg carbos si <8h a la próxima sesión.
- **Carga/descarga (tapering):** 1-2 sem antes bajar volumen 40-60%, **mantener intensidad**, subir carbos → llegar con glucógeno lleno y descansado.
- **Plan de carrera día a día** (ejemplo media maratón, sábado):
  - Mar-Jue: dieta normal, hidratación constante.
  - Vie (carga): ~8-10 g/kg carbos, baja fibra/grasa, +sodio.
  - Sáb (día): desayuno 3-4h antes, 1-3 g/kg carbos bajos en fibra + café opcional; en carrera geles 40-60 g carbos/h + 400-600 ml líquido/h con sodio; post: recuperación 0.3 g/kg prot + carbos.

**Ejemplo numérico:** Hombre, 35 a, 72 kg, 178 cm, 40 km/sem, media en 6 semanas.
- TDEE base+carrera ≈ **2800 kcal** · prot 1.6 g/kg = **115 g** · grasa 1.0 = **72 g** · carbos = **423 g** (5.9 g/kg).
- Día de tirada larga (18 km): +~1300 kcal → subir carbos a ~7-8 g/kg (~540-580 g) ese día.
- Semana de carrera: carga a 9 g/kg = **~650 g carbos/día** (48h antes); en carrera ~50 g carbos/h + ~500 ml/h con ~500 mg sodio/h.
- Coach detecta si el ritmo mejora a igual FC (§4/§6) → mantiene y afina combustible.

### 2.2 COACH DIABETES — completo ⚠️ (máximo riesgo, ver §7)

**Postura:** SOLO apoyo educativo y de organización. **No** fijamos objetivos de glucosa (los da su médico), **no** ajustamos insulina/medicación, **no** prescribimos dietas terapéuticas. Registramos y educamos.

**Variables:** tipo (1 / 2 / prediabetes), tratamiento declarado (insulina / orales / solo dieta), horarios de comida y de medicación, HbA1c/glucosa **como registro que el usuario ya conoce** (no como objetivo que fijemos), síntomas.

**Recomendaciones (educativas):**
- **Índice/carga glucémica:** preferir carbos de bajo IG (legumbres, avena, integral) sobre alto IG (pan blanco, refresco, jugo).
- **Evitar picos:** combinar carbos con **fibra + proteína + grasa** (baja la respuesta glucémica); distribuir carbos en el día en vez de concentrarlos; verdura antes del carbo.
- **Alternativas (swaps):** ofrecer sustituciones alto→bajo IG dentro de sus favoritos y cocina mexicana (ej. tortilla de maíz sobre pan blanco; fruta entera sobre jugo).
- **Riesgos que ACTIVAN alerta + derivación, no consejo propio:** hipoglucemia con ejercicio/ayuno si usa insulina; ayunos prolongados; síntomas (mareo, visión borrosa) → *"Esto lo tiene que ver tu médico; no ajustes tu medicación por lo que diga la app."*

**Ejemplo:** Usuario T2 con metformina, quiere comer mejor y bajar de peso.
- Coach: déficit **leve** (10-15%, no agresivo), prot alta para saciedad, carbos de bajo IG distribuidos, +fibra; swaps de sus platillos favoritos; disclaimer en cada interacción sobre glucosa; recomienda seguimiento con su equipo médico.
- Coach **NO** dice: "mantén tu glucosa en X", "reduce tu insulina", "cura tu diabetes". Si el usuario lo pide → derivar.
- **Recomendación de producto:** T1 y T2-con-insulina → MVP **sin macros automáticos**, solo registro + educación + derivación (§7).

---

## 3. Memoria (nunca repetir ni olvidar)

Tres capas, con **presupuesto de tokens acotado** (§8):

1. **Perfil estructurado (DB, fuente de verdad):** identidad, objetivo, restricciones, preferencias, salud, entrenamiento, favoritos, lesiones. Se edita, no se "recuerda por chat". Va siempre en contexto (cacheado).
2. **Hechos clave / memoria semántica:** lista curada de bullets que la IA extrae y persiste ("odia el brócoli", "lesión de rodilla nov-2026", "entrena 6am", "meta media maratón nov"). La IA **propone** guardar hechos; se guardan estructurados y se inyectan como `memoria.hechos_clave`. Se dedupe y se editan/borran si cambian.
3. **Memoria episódica (conversación):** NO se manda el transcript completo (costo). Se mantiene un **resumen rodante** (`resumen_conversacion`) que se recomprime periódicamente + los últimos N turnos. Compromisos abiertos ("dijo que probaría cocinar 3 días") se rastrean para dar seguimiento.

**Qué recuerda:** objetivos e historial, preferencias y favoritos, intolerancias/alergias/enfermedades, lesiones, hábitos y horarios, progreso (peso/adherencia/PRs), y compromisos. **Qué olvida a propósito:** datos sensibles innecesarios; nada de credenciales; PII mínima (§7 privacidad).

**Implementación:** capa 1-2 en la BD del app (SQLite → Postgres al escalar); la extracción de hechos y el resumen rodante son llamadas de IA baratas (§8). No depende del "memory tool" del proveedor; es memoria de aplicación controlada por nosotros (mejor para privacidad y costo).

---

## 4. Planes dinámicos vivos (recálculo al cambiar una comida)

El plan del día/semana es un objeto vivo. Cuando el usuario cambia/rechaza/registra una comida distinta:
1. **Recomputar macros restantes** del día = objetivo − consumido.
2. **Re-generar SOLO las comidas afectadas** (no el plan entero) para cuadrar lo pendiente ±10%, respetando restricciones duras. → ahorra tokens y da control.
3. **Actualizar la lista de súper**: quitar ingredientes de la comida vieja, añadir los de la nueva, consolidar duplicados, respetar presupuesto/país.
4. **Actualizar recomendaciones**: el coach reajusta la sugerencia de siguiente comida y las alertas (ej. si el cambio disparó el sodio o dejó corta la proteína).
5. **Presets de porción** (½/1/1½/2) reescalan macros linealmente **sin llamar a la IA** (0 costo).
Plantillas por objetivo/dieta como base + relleno de IA reduce costo y latencia (§8).

---

## 5. Feedback diario (mañana y noche)

Dos toques programados, cortos, accionables (costo controlado, §8):

- **Mañana:** lee `sueno_h`, `estres`, `entreno_de_hoy`, `proximo` → mensaje 1-3 frases: cómo llega, foco del día, y qué comer alrededor del entreno. Ej. *"Dormiste 6h y hoy toca tirada larga — desayuna algo con carbos 2-3h antes y lleva un gel. Meta de hoy: 420 g de carbos."*
- **Noche:** resumen del día + **puntuación** (adherencia a kcal/macros + registro + hidratación, 0-100) + objetivo de mañana. Ej. *"Día de 88/100: proteína y calorías en meta, te faltó agua. Mañana: cierra 2.5 L y repite la proteína."*

Formato: notificación con CTA. La puntuación alimenta motivación (§6) y el motor adaptativo (§4 del plan base).

---

## 6. Motivación inteligente y contextual

No frases genéricas: motivación **anclada en su historial** (usa `tendencias` y `memoria`).
- **Progreso comparativo:** *"Hace 3 semanas no llegabas a 120 g de proteína; llevas 10 días seguidos cumpliéndola."*
- **Rachas y hitos:** registro N días, primera semana en déficit sostenido, PR de ritmo.
- **Refuerzo tras recaída (sin culpa):** *"Un día flojo no borra 3 semanas buenas; retomamos hoy."*
- **Anticipación a metas:** *"Faltan 5 semanas para tu media; vas en ritmo."*
- **Timing:** ligado al feedback diario (§5) y a eventos (cierre de racha, mejora medible). Máximo 1-2 toques motivacionales/día para no saturar (UX con Rams).

---

## 7. ⚠️ SEGURIDAD MÉDICA CRÍTICA (área #1 de riesgo legal)

**Coaches de máximo riesgo:** diabetes, hipertensión, embarazo, infantil, adulto mayor. Un consejo equivocado aquí puede causar daño real y demanda.

### 7.1 Principios (invariantes)
- **Apoyo educativo y de organización, NUNCA sustituto médico.** No diagnóstico, no prescripción, no ajuste de tratamiento/medicación, no objetivos clínicos (glucosa, tensión).
- **Filtros duros en código** (no solo prompt): alergias/celiaquía nunca se violan; en coaches médicos, un **guardrail dedicado** sobre las salidas del chat bloquea prescripción/ajuste de medicación.
- **Derivar** ante síntomas, medicación o petición terapéutica.

### 7.2 Disclaimers + consentimiento
- **Onboarding con condición médica:** consentimiento informado explícito y registrado (fecha): *"No es un dispositivo médico ni sustituye a tu profesional. Consulta a tu médico antes de cambiar tu dieta, sobre todo con [condición]. En emergencias, acude a un servicio de salud."*
- **Banner persistente** en el coach médico + **disclaimer reincidente** en cada respuesta que toque la condición.
- **Datos de salud = sensibles** (LFPDPPP MX / GDPR): minimizar, cifrar, política de retención; no guardar más de lo necesario.

### 7.3 Qué coaches DIFERIR y cuán conservadores ser (recomendación)
| Coach | MVP | Nivel de cautela |
|---|---|---|
| **Diabetes T1 · embarazo · infantil · renal** | **DIFERIR.** Solo registro + educación general + derivación; **sin macros/planes automáticos** | **Máxima** |
| **Diabetes T2 (con insulina)** | Diferir planes; educación + registro | Máxima |
| **Diabetes T2 (solo dieta) · hipertensión · colesterol · hígado graso** | Educación + visualización (sodio/IG/grasas) + disclaimer fuerte; sin prescribir | Alta |
| **Adulto mayor** | Educación + proteína/hidratación; cautela con fármacos; derivar | Alta-media |
| **Bienestar · deportivos · dietas (no médicas)** | Full features | Estándar |

**Recomendación estratégica:** lanzar Ola 1 con coaches **no médicos** (pérdida de grasa, hipertrofia, mantener, comer sano, running); los coaches médicos entran **al final**, con fórmulas/umbrales/copys **validados por nutriólogo colegiado** y T&C/consentimiento revisados por **abogado**.

---

## 8. Costo de IA (memoria + feedback diario + multi-coach + planes vivos disparan el uso)

**Modelo base:** `claude-haiku-4-5` (~$1/1M in, ~$5/1M out). Referencia 99 MXN ≈ **$4.95 USD** (~20 MXN/USD). **Prompt caching** del objeto de contexto (perfil + prompt de dominio, ~3k tok estables) → lecturas a ~0.1×.

| Función | Tokens (in/out) | Costo/uso | Volumen típico/mes | Costo/mes |
|---|---|---|---|---|
| Mensaje de chat | ~2.5k in (2k cache) / 400 out | ~$0.003 | 150 msg | ~$0.45 |
| Feedback diario (mañana+noche) | ~2×(600 in / 300 out) | ~$0.004/día | 30 días | ~$0.12 |
| Recompute de comida (plan vivo) | ~900 / 500 | ~$0.003 | 30 | ~$0.09 |
| Análisis de foto (existente) | imagen / 400 out | ~$0.003 | 90 | ~$0.27 |
| Extracción de hechos + resumen rodante | ~2k / 500 | ~$0.0045 | 8 | ~$0.036 |
| Ajuste adaptativo semanal | ~1.5k / 300 | ~$0.003 | 4 | ~$0.012 |

**Total usuario activo medio ≈ $1.0 USD ≈ 20 MXN/mes** → **~20% del ingreso** (99 MXN). Margen bruto sano (~65-70%) tras Stripe/infra **si se capea**. **Riesgo:** un power-user (400+ msg, planes diarios, chat intenso) puede llegar a **$3-4 USD (60-80 MXN)** y comerse el margen — el **chat** y la **memoria sin comprimir** son los que disparan.

**Tácticas de margen:**
1. **Prompt caching** agresivo del perfil + prompt de dominio (estable primero, volátil al final).
2. **Resumen rodante de memoria** en vez de transcript completo; recomprimir con Haiku (barato) y NO mandar toda la historia.
3. **Caps de fair-use suaves** por tier (aviso a partir de X msg/día; el Free muy limitado).
4. **Haiku por defecto** para chat/feedback; reservar Sonnet/Opus solo para planificación compleja como **upsell "IA avanzada" Pro**.
5. **Plantillas + relleno** para planes; **presets de porción** y **memoria de platillos** a 0 costo de IA.
6. **Batch/programado** del feedback diario (2 llamadas fijas, no charla abierta).
7. **Multi-coach comparte un solo objeto de contexto** — cambiar de coach no re-carga el perfil.

---

## Coordinación
- **Rams (skm3lj3d):** UX del chat conversacional (§1.3), feedback diario mañana/noche (§5), motivación no intrusiva (§6, máx 1-2/día), disclaimers/consentimiento visibles (§7.2), y flujo de "guardar este hecho en memoria" (§3). Contrato de datos por pantalla ya entregado.
- **Drucker (6rllfvd6):** empaquetar coaches en tiers, caps de fair-use (§8), qué coaches médicos diferir (§7.3), y el upsell "IA avanzada".
- **Torvalds (gkmi48v7):** memoria de aplicación (capas §3), filtros duros + guardrail de coaches médicos en código (§7.1), prompt caching y resumen rodante (§8), recompute parcial de planes (§4).

**Prioridad:** (1) motor + objeto de contexto + chat con caching, (2) memoria (perfil+hechos+resumen), (3) planes vivos + feedback diario, (4) motivación + adaptativo, (5) coaches médicos con validación legal/clínica.

---

# ADENDUM (brief expandido por Emiliano)

Tres ejes que se **componen** sobre el mismo motor, contexto y memoria — no son motores separados:

```
ESPECIALISTA (dominio: qué sabe / qué pide / qué calcula)   ← A1
   ×  MODO DE ALIMENTACIÓN (dieta: overlay de restricción)   ← A1
   ×  PERSONALIDAD (tono: overlay de estilo, NO de ciencia)   ← A2
   → un solo objeto de contexto + memoria permanente (§3)
```

## A1. Centro de especialistas IA (catálogo completo)

Cada especialista = prompt de dominio (conocimiento + variables extra + cálculos) sobre el motor común. **Todos usan la memoria del usuario (§3) y anclan sus recomendaciones al historial, como si llevaran meses acompañándolo** (referencian PRs pasados, lesiones, tendencias, favoritos, compromisos abiertos).

**Composición corporal:** pérdida de grasa · hipertrofia · recomposición · mantenimiento. *(déficit/superávit, proteína alta, progresión; ver §2 del plan base y ejemplos numéricos.)*

**Rendimiento:** running · trail · maratón · media · ultra · ciclismo · triatlón · natación · CrossFit · Hyrox · powerlifting · halterofilia.
- Resistencia (running/trail/ciclismo/tri/natación/ultra): carbos por fase, hidratación/electrolitos, timing, carga/descarga, plan de competencia (Runner completo en §2.1; los demás heredan la misma mecánica con su gasto y duración).
- Fuerza/potencia (powerlifting, halterofilia): proteína 1.6-2.2 g/kg, carbos peri-entreno, gestión de peso por categoría, timing pre/post.
- Híbridos (CrossFit, Hyrox): combinan combustible de resistencia + proteína de fuerza; carbos moderados-altos, recuperación entre WODs.

**Fitness / calistenia:** recomposición con peso corporal, proteína para progresión, energía suficiente para volumen de entreno.

**Nutrición clínica — APOYO, NO diagnóstico ⚠️ (máximo riesgo, §7):** diabetes T1 · T2 · prediabetes · hipertensión · colesterol/dislipidemia · cardiovascular · renal (**con límites**) · hígado graso · colon irritable (SII/FODMAP) · celíaca · intolerancia a la lactosa · alergias · SOP · gota. Notas de dominio (todo **educativo**, nunca prescriptivo):
- Renal: educación sobre proteína/sodio/potasio/fósforo **según lo que su nefrólogo ya le indicó**; NO fijamos límites nosotros → DIFERIR.
- Gota: educación sobre purinas (limitar vísceras/mariscos/alcohol), hidratación.
- SOP: bajo IG, control de peso, fibra (educativo).
- SII/FODMAP: identificar disparadores como preferencia/restricción, no diagnóstico.
- Colesterol/cardiovascular: fibra soluble, grasa sat., patrón DASH/mediterráneo (educativo).
- Diabetes: IG, evitar picos, swaps (Diabetes completo en §2.2).

**Modos de alimentación (dieta, se combinan con cualquier especialista):** mediterránea · DASH · vegetariana · vegana · flexitariana · keto · low-carb · alta proteína · paleo · ayuno intermitente · plant-based. Actúan como **overlay de restricción/estilo** sobre los macros del especialista (banderas de micros donde aplique: B12/hierro en vegana, electrolitos en keto).

**Etapas de vida ⚠️ (sensibles, §7):** embarazo (apoyo **informativo**) · lactancia · adulto mayor · adolescente · niños (**orientación a padres**, sin dietas restrictivas).

**Tabla de diferir (extiende §7.3):** **DIFERIR en MVP, sin macros/planes automáticos, solo registro + educación + derivación:** diabetes T1, T2-con-insulina, **embarazo, renal, niños, adolescente**. Estos operan educar/organizar, NUNCA diagnosticar ni ajustar tratamiento, con consentimiento y disclaimers reforzados, y validación legal + clínica antes de exponerse.

## A2. Personalidad adaptable (5 tonos)

El usuario elige el **tono** del coach. Es una **capa de personalidad sobre el mismo motor**: cambia *cómo se dice*, **nunca la ciencia, los cálculos ni los guardrails**. Se implementa como un bloque corto de instrucción de tono (`personalidad`) que se intercambia en el prompt; el resto es invariante y cacheado (costo ≈ 0 extra).

| Tono | Voz | Ejemplo ("te faltan 25 g de proteína") |
|---|---|---|
| **Profesional / técnico** | Preciso, terminología, sin adornos | "Déficit de 25 g de proteína para tu objetivo diario. Sugerencia: 130 g de pechuga cubre 27 g." |
| **Entrenador exigente** | Retador, empuja disciplina | "Te faltan 25 g y no vas a dejarlos hoy. Pechuga o huevos, tú decides — pero se cierran." |
| **Cercano / motivador** | Cálido, celebra, anima | "¡Casi lo tienes! Solo 25 g de proteína; unos huevos con tu cena y cierras un gran día." |
| **Tranquilo / empático** | Sin presión, comprensivo | "Vas bien. Si te apetece, unos 25 g de proteína redondean el día; si no, mañana seguimos." |
| **Analítico / datos** | Números, tendencias, comparativas | "Proteína hoy: 115/140 g (82%). Media 7d: 88%. +25 g = 130 g de pechuga → 100% y racha 11 días." |

**Regla dura de seguridad:** ningún tono debilita los límites. "Entrenador exigente" **no** empuja déficits agresivos, ni presiona a un diabético/embarazada; los guardrails de §7 y los topes de seguridad (BMR·1.1, <1%/sem) son invariantes al tono. El tono modula palabras, no la nutrición.

## A3. Consejo del día (tip diario personalizado — potencial viral)

Un tip diario **100% personalizado**, generado con el contexto del usuario — jamás una frase genérica.
- **Cómo se genera:** al abrir la app o en el push AM, toma el objeto de contexto (perfil + `tendencias` + `memoria.hechos_clave` + `hoy` + `proximo` entreno + especialista + tono). Devuelve 1-2 frases específicas y accionables.
- **Selección de foco (rota, sin repetir):** usa la memoria para **no repetir** lo reciente; rota entre hidratación, un favorito, un micro/macro pendiente, un hábito objetivo, meal-prep, o timing peri-entreno.
- **Formato:** 1-2 frases + micro-CTA opcional. **Compartible** (tarjeta diseñada con Rams, sin PII) → palanca de viralidad.
- **Ejemplos (anclados, no genéricos):**
  - "Llevas 3 días con la proteína corta en el desayuno; un huevo extra y arrancas con 12 g más."
  - "Mañana toca tirada larga: sube hoy los carbos y no los dejes para la noche."
  - "Te encanta el pozole — pídelo con más pollo y verdura y cabe justo en tu meta de hoy."
- **Costo:** ~700 tok in (cacheados) / 200 out ≈ **$0.0015/día ≈ $0.045/mes** en Haiku. **Se puede fusionar con el feedback AM** (§5) para 0 costo extra (misma llamada, mismo contexto cacheado).

## A4. Memoria permanente (refuerzo)

La memoria (§3) es lo que hace que **cada** especialista, el feedback AM/PM (§5), la motivación (§6) y el consejo del día (A3) suenen a "meses acompañándote": todos leen `memoria.hechos_clave` + `tendencias` para **referenciar el pasado** ("hace 3 semanas…") y **no repetir** (tips, sugerencias, preguntas ya resueltas). Debe recordar de forma permanente: objetivos e historial, preferencias y **favoritos**, intolerancias/alergias/enfermedades, **lesiones**, hábitos y horarios, **progreso** (peso/adherencia/PRs) y **compromisos abiertos**. Cambiar de especialista o de tono **no borra** la memoria — es del usuario, no del coach.

## A5. Ejemplos aterrizados — feedback AM/PM y preguntas al nutricionista IA

**Feedback AM/PM** (tono = el elegido; datos = objeto de contexto):
- AM: "Dormiste 6 h y hoy toca fuerza de piernas — desayuna con carbos y proteína 2 h antes. Meta: 140 g de proteína, 2.5 L de agua."
- PM: "Día 88/100: calorías y proteína en meta, faltó agua. Mañana: cierra 2.5 L y repite la proteína. Racha: 11 días."

**Q&A del nutricionista IA** (cada respuesta usa macros pendientes + restricciones + despensa + país):
- *"¿Qué ceno?"* → "Te quedan 480 kcal y 30 g de proteína. Salmón con verduras o unos huevos al gusto — ambos cierran el día. ¿Te lo registro?"
- *"Me faltan 40 g de proteína."* → "Fácil: 150 g de pechuga (33 g) + un yogur griego (10 g) y lo pasas. O si prefieres vegetal, 200 g de tofu firme."
- *"Estoy en el aeropuerto."* → "Busca algo con proteína magra y bajo en azúcar: sándwich de pollo/pavo sin salsas, yogur griego, o fruta + puño de nueces. Evita el pan dulce y los jugos. ¿Con cuál vas y te lo registro?"
- *"Solo tengo huevos y arroz."* → "Perfecto para tus pendientes: 3 huevos + 1 taza de arroz cocido ≈ 21 g proteína / ~45 g carbos / ~450 kcal, justo lo que te falta. Échale verdura si tienes. ¿Lo registro?"

*(En especialistas clínicos/etapas sensibles, toda respuesta lleva disclaimer y, ante síntomas/medicación, deriva — §7. El tono nunca relaja esto.)*

**Costo del adendum:** los overlays de especialista/dieta/personalidad **no** suman costo relevante (comparten contexto cacheado). El consejo del día añade ~$0.05/mes (o $0 si se fusiona con el AM). El total por usuario/mes (§8) se mantiene ~20 MXN.

## Coordinación del adendum
- **Rams (skm3lj3d):** selector de especialista (3 ejes: especialista × dieta × personalidad), selector de tono con preview, tarjeta compartible del consejo del día (viralidad, sin PII), y disclaimers/consentimiento en clínicos/etapas.
- **Drucker (6rllfvd6):** qué especialistas van en Ola 1 (no médicos) vs diferidos (clínicos/etapas), y si la personalidad/consejo del día son gancho Free o valor Premium.
