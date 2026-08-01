# RE-QA de cierre — guard de salud de memoria (fix de síntomas)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**`vitest` 88/88.** Prueba EN VIVO con la lógica REAL (`ALLERGEN_TERMS` importado de `allergens.js`
+ `esDatoDeSalud`/`HEALTH_SIGNALS`/`HARM_CUES`/`normMem` replicados verbatim del `actions.js` actual).

---

## VEREDICTO: ❌ NO cerrado / NO hermético — quedan huecos concretos (10 frases)

El fix **cerró exactamente mis 7 frases** y **no hay regresión** (gustos se guardan, alergias
bloquean). PERO en UNA pasada adversarial encontré **10 nuevas frases de síntoma/idiom por alérgeno
que se cuelan**. El espacio de síntomas es abierto → una lista enumerada de cues no llega a
hermética. **No puedo dar CERRADO.**

---

## (1) Mis 7 frases de síntoma → ✅ CERRADAS
`el gluten no me sienta`, `me da diarrea el gluten`, `el trigo me da colitis`, `la leche me da
gases`, `el maní me pica la garganta`, `el gluten me da migraña`, `no le hago al gluten` →
**7/7 es_salud=true, no escriben.** El fix hizo justo lo pedido para esas.

## (3) NO-REGRESIÓN → ✅
- **8 gusto se guardan** (no sobre-bloquea): no me gusta el gluten, no me gustan los mariscos, no me
  gusta el brócoli, prefiero pollo a res, no me encanta el pescado, me encanta el chocolate, soy
  vegetariano, odio la cebolla.
- **Alergia sigue bloqueando** (muestra 8/8): no puedo comer gluten, soy celíaco, intolerante a la
  lactosa, cacahuate me da alergia, alérgico a mariscos, sensible al gluten, me hace daño el trigo,
  el maní me manda al hospital.

## (2) HUECOS RESIDUALES CONCRETOS → ❌ 10 bypasses nuevos (una sola pasada)
Alérgeno + síntoma/idiom que NO está en `HARM_CUES` y sin `HEALTH_SIGNAL`:
```
❌ "el gluten me da reflujo"            (reflujo)
❌ "me da acidez el trigo"              (acidez)
❌ "el camarón me da comezón"          (comezon)
❌ "la leche me da retortijones"       (retortijones)
❌ "el maní me cierra la garganta"     (cierra la garganta ← ¡anafilaxia! grave)
❌ "me salen ronchas con el marisco"   (ronchas)
❌ "el trigo me da cólicos"            (colicos ← agregaron 'colitis' pero no 'colicos')
❌ "el gluten me da flatulencia"       (flatulencia ← agregaron 'gases' pero no esto)
❌ "me intoxica el marisco"            (intoxica)
❌ "el gluten no me hace bien"         (no me hace bien ← tienen 'me hace mal', no la negación)
```
El más preocupante: **"me cierra la garganta"** describe anafilaxia (reacción severa) y se cuela.

**Diagnóstico estructural:** el guard es un allow-list de cues; cada fix cierra las frases
enumeradas pero aparecen otras (reflujo, acidez, comezón, ronchas, cólicos, flatulencia,
retortijones, intoxica, "cierra la garganta", "no me hace bien"… y seguirán: sarpullido, empacho,
indigestión, "me cae pesado", "me revienta", asco…). Un keyword-filter **no** puede ser hermético
contra descripciones libres de síntomas — mismo patrón que el filtro de nombres de queso.

---

## Recomendación (decisión de riesgo tuya)
Dos caminos honestos:

**A) Whack-a-mole (rápido, NO hermético):** agregar los 10 de arriba + tail
(`reflujo, acidez, comezon, ronchas, sarpullido, colicos, flatulencia, retortijones, intoxica,
indigestion, empacho, cierra la garganta, no me hace bien, me cae pesado, me revienta`). Reduce el
hueco pero **nunca lo cierra** del todo.

**B) Postura conservadora (hermético de verdad, requiere diseño):** en vez de enumerar síntomas,
invertir — si el contenido contiene un ALLERGEN_TERM y **cualquier** contexto negativo/no-preferencia
→ es_salud; y separar el gusto con un allow-list positivo ("no me gusta/no me encanta/prefiero/
odio/detesto") en lugar de intentar listar todo lo malo. O un clasificador LLM. Es la única vía a
"CERO se cuela".

**Contexto de impacto (igual que antes, latente hoy):** no hay flujo de captura de restricciones ni
`restr` poblado, y el hecho igual se inyecta al contexto (el modelo lo ve como guarda blanda). Así
que el riesgo VIVO hoy es bajo — pero como pediste veredicto estricto **hermético/hueco**, es
**HUECO CONCRETO** (10 frases). Con opción B (o A ampliada) quedaría muchísimo mejor; hermeticidad
real solo con B.

---

## Resumen
| Check | Estado |
|---|---|
| Mis 7 frases de síntoma | ✅ 7/7 cerradas |
| No-regresión (8 gusto guardan, 26 alergia bloquean) | ✅ |
| Nuevas frases de síntoma/idiom | ❌ 10 bypasses concretos (una pasada) |
| ¿Hermético? | ❌ No — límite estructural del allow-list de cues |

**No doy CERRADO todavía.** Mis 7 y la no-regresión: perfectas. Pero hay 10 huecos concretos nuevos
y la clase es abierta; recomiendo la opción B (allow-list positivo de gustos + alérgeno⇒salvo-gusto)
para hermeticidad real. Decisión de GO es tuya dado el bajo riesgo latente. No toqué producción.
