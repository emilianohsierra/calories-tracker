# RE-QA de seguridad — guard de salud de memoria (`esDatoDeSalud`)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**`vitest` 73/73 (17 de seguridad).** Prueba EN VIVO de la lógica real (`ALLERGEN_TERMS` importado
de `allergens.js` + `esDatoDeSalud`/`HEALTH_SIGNALS`/`HARM_CUES`/`normMem` replicados verbatim).

---

## VEREDICTO: ✅ pasa TODO tu set enumerado — pero NO 100% hermético: 1 hueco residual concreto

El endurecimiento es enorme y correcto. **Las 12 frases de bypass que reporté ahora se rechazan**
(es_salud, no escriben), y las de GUSTO sí se guardan. Pero al probar "frases indirectas" como
pediste, encontré una **clase residual más chica**: frases que describen la reacción por **SÍNTOMA**
(sin keyword ni cue listado) todavía se cuelan. Fix trivial. Recomiendo cerrarlo antes de que la
memoria alimente restricciones/filtro; deployable hoy con el residual latente.

---

## (1) Tus 12 bypass previos → ✅ TODAS bloquean (no escriben)
`no puedo comer gluten`, `soy celíaco` (acento), `no puedo comer lácteos`, `el gluten me cae mal`,
`me hace daño el trigo`, `soy sensible al gluten`, `no tolero los lácteos`, `el maní me manda al
hospital`, `no como gluten por salud`, `intolerante a la lactosa`, `el cacahuate me da alergia`,
`soy alérgico a mariscos`. **12/12 rechazadas.**

## (2) Variantes nuevas (acentos/mayúsculas/regional/indirectas) → ✅ bloquean
`SOY CELÍACO`, `Me Inflama El Trigo`, `el camarón me hincha`, `evito el gluten porque me enferma`,
`la lactosa me da reacción`, `no puedo consumir lácteos`, `no debo comer maní`, `me da anafilaxia el
cacahuate`, `el queso me cae mal`, `soy alérgica a las nueces`, `tengo alergia al ajonjolí`, `el pan
me hace daño`, `evito los lácteos`, `soy sensible a la lactosa`. **14/14 rechazadas.**

## (3) GUSTO → ✅ NO se bloquean (se guardan)
`no me gusta el gluten`, `no me gustan los mariscos`, `no me gusta el brócoli`, `prefiero pollo a
res`, `no me encanta el pescado`, `me encanta el chocolate`, `soy vegetariano`, `odio la cebolla`.
**8/8 guardadas** (incluye los casos-trampa con término de alérgeno pero sin cue de daño).

## ⚠️ HUECO RESIDUAL concreto — frases por SÍNTOMA (bypass)
Con término de alérgeno pero un síntoma que NO está en `HARM_CUES` y sin `HEALTH_SIGNAL`:
```
❌ "el gluten no me sienta"        ❌ "me da diarrea el gluten"
❌ "el trigo me da colitis"        ❌ "la leche me da gases"
❌ "el maní me pica la garganta"   ❌ "el gluten me da migraña"
❌ "no le hago al gluten"
```
Estas describen una intolerancia real por síntoma/idiom, sin las palabras clave. Se guardarían como
`rechazo`/`preferencia`.
- **Impacto hoy: bajo/latente** — no hay flujo de captura de restricciones ni `restr` poblado, y el
  hecho igual se inyecta al contexto (`[rechazo] me da diarrea el gluten`) → el modelo lo ve y evita
  el alimento como guarda blanda. Pero por diseño la barrera debe cerrarlo.
- **Fix trivial:** añadir a `HARM_CUES`/`HEALTH_SIGNALS` los síntomas comunes: `diarrea`, `colitis`,
  `gases`, `migrana`, `nausea`, `vomito`, `urticaria`, `pica`, `no me sienta`, `no me cae`, `me
  reventa`, `me brota`. (Y opcional: `no le hago a`.)

## Nota — OVER-BLOCK (dirección segura, aceptada)
Término de alérgeno + cue genérico marca algunos comentarios de gusto: `no puedo dejar de comer
queso`, `no puedo vivir sin pan`, `el pescado está mal caro` → se rechazan como salud. Es el lado
seguro ("hermético > preciso") y consistente con tu criterio; solo lo anoto (una preferencia legítima
como "no puedo vivir sin pan" se pierde). No es defecto de seguridad.

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 12 bypass previos bloqueados | ✅ 12/12 |
| Variantes nuevas (acentos/caps/regional/indirectas) | ✅ 14/14 |
| GUSTO se guardan (no sobre-bloquea lo enumerado) | ✅ 8/8 |
| Frases por SÍNTOMA (diarrea/colitis/gases/migraña/pica/"no me sienta") | ❌ hueco residual concreto |
| Over-block allergen+cue genérico | 🟢 dirección segura (nota) |

**No es 100% hermético**, pero pasa **todo tu set enumerado** y la gran mayoría de fraseos reales.
Único hueco concreto: **frases por síntoma** — fix trivial (agregar esos cues). Recomiendo cerrarlo
antes de que la memoria alimente el flujo de restricciones/filtro; el residual es latente hoy. No
toqué producción.
