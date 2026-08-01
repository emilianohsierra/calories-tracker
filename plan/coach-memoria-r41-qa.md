# QA focalizado — Coach R4-1: memoria (`save_memory` + inyección)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Revisión por código + `vitest` (56/56) + prueba EN VIVO del guard de salud.**
Archivos: `lib/coach/actions.js` (`guardarMemoria`), `supabase/coach-memoria.sql`,
`lib/coach/context.js`, `lib/coach/persona.js`, `app/api/coach/chat/route.js`, `app/coach/page.js`.

---

## VEREDICTO: ⚠️ 1 HALLAZGO MAYOR en el GUARD DE SALUD (crítico) — el resto ✅

Los puntos 2–6 pasan. Pero el **guard de salud (punto 1, crítico)** tiene **bypasses concretos**,
incluido **uno de tus casos explícitos** ("no puedo comer gluten") y la grafía correcta "celíaco".
El mecanismo es correcto (rechaza con `es_salud`, no escribe, el enum excluye alergias), pero la
**detección** (`SALUD_RE`) es incompleta. Recomiendo cerrarlo **antes** del deploy: es la barrera
que debe ser fiable y el fix es chico.

---

## (1) GUARD DE SALUD — ⚠️ mecanismo ✅, detección con huecos (MAYOR)

**Mecanismo (correcto):** `guardarMemoria` → si `SALUD_RE.test(contenido)` → `{ok:false,
error:'es_salud'}` y **NO escribe** (no llega a `coach_memories`). El enum `MEM_TIPOS`
(favorito/rechazo/lesion/compromiso/preferencia/hecho_clave) **no** incluye alergias, y el
`description` de la tool lo prohíbe. Sin puerta trasera por el tipo. ✔

**PERO `SALUD_RE = /alergi|alergic|alérgic|intoleran|celiac|celiaqu/i` es keyword-only y se aplica
al texto CRUDO (sin normalizar acentos). Probado en vivo:**

| Frase | ¿Bloquea? | |
|---|---|---|
| "soy alérgico/alergico a nueces" | ✅ sí | ok |
| "intolerante a la lactosa" | ✅ sí | ok |
| "soy celiaco" (sin acento) | ✅ sí | ok |
| **"no puedo comer gluten"** (tu caso #2) | **❌ NO** | se guardaría como memoria |
| **"soy celíaco"** (grafía CORRECTA con acento) | **❌ NO** | `celíac` ≠ `celiac` (no normaliza acento) |
| "no puedo comer lácteos" | ❌ NO | bypass |
| "el gluten me cae mal" / "me hace daño el trigo" | ❌ NO | bypass |
| "soy sensible al gluten" | ❌ NO | bypass |
| "no tolero los lácteos" | ❌ NO | irónico: "no tolero" no matchea "intoleran" |
| "el maní me manda al hospital" / "no como gluten por salud" | ❌ NO | bypass |

**Consecuencia:** una restricción de salud descrita **sin la palabra clave** (o "celíaco" bien
escrito) se guarda como `rechazo`/`preferencia` y se inyecta al contexto como preferencia blanda —
**no** como restricción dura. Es exactamente la "puerta trasera" que el guard debe cerrar: el
dato NO pasaría por el (futuro) flujo de restricciones ni por el filtro hermético.

**Atenuante (por qué no es catástrofe HOY):** no existe aún flujo de captura de restricciones ni
`restr` poblado (siempre `[]`), y el hecho igual se inyecta al prompt (el modelo lo ve y evita el
alimento como guarda blanda). Pero por diseño la barrera debe ser fiable, y una caso tuyo falla.

**Mitigación (chica):**
1. Correr `SALUD_RE` sobre el texto **normalizado** (sin acentos) → arregla "celíaco"/"celíaca".
2. Añadir patrones de restricción-por-frase: `no (puedo|debo|como) …`, `me (cae mal|hace daño|manda
   al hospital)`, `sensible a`, `no tolero`, combinados con los términos/grupos de alérgenos
   (reusar el léxico de `allergens.js`).
3. Test de seguridad con estas frases (hoy no existen).

## (2) SAVE + DEDUPE — ✅
`upsert onConflict('user_id,tipo,norm')` + `unique(user_id,tipo,norm)` en el SQL (dedupe a nivel BD).
`normMem` = minúsculas + sin acentos + espacios colapsados → repetir "no me gusta el brócoli" (mismo
`norm`) **actualiza**, no duplica. `caducidad_dias>0` → `caduca_en = addDaysStr(hoy, dias)` (clamp
3650). Direct-write; confirma vía `responder` (`toolResult ok`).

## (3) INYECCIÓN — ✅
`context.js` lee `coach_memories` con `activa=true AND (caduca_en is null OR caduca_en >= hoy)`,
`order updated_at desc`, **limit 12**. `persona.js` inyecta `Memoria: [tipo] contenido · …` en
`<contexto_dia>` → el coach las conoce y no re-pregunta. Caducadas/inactivas quedan excluidas por el
filtro. ✔

## (4) RLS — ✅
`coach_memories` RLS `select/insert/update` propias por `auth.uid()`; **`revoke all from anon`** +
`grant … to authenticated` (corrigieron la nota de consistencia de sub-3). Sin política DELETE
(soft-delete vía `activa`). Solo el propio usuario.

## (5) DEPLOY-SAFE sin el SQL — ✅
Lectura en `Promise.all`: supabase-js resuelve `{data:null}` si falta la tabla → `memorias || []` →
vacío, no lanza. Escritura: `upsert` falla → `{ok:false, error:'db'}` (sin throw) → el loop fuerza
`responder` → el chat responde. Con el SQL sin correr, el chat sigue vivo.

## (6) NO-REGRESIÓN — ✅
Una acción por turno: `canAct = !guardado && !estimate && !actualizado && !opciones && !planChange &&
!memoria`; dispatch foto>texto>cena>plan>ctx>memoria. Branches previos sin cambios. cap/reembolso/
personalidad/rediseño intactos; `context.js`/`persona.js` solo añaden lectura+línea de memoria;
`app/coach/page.js` = bump BUILD. No toca meals/profiles/targets/stripe.

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · Guard de salud: mecanismo (es_salud, no escribe, enum excluye alergias) | ✅ |
| 1 · Guard de salud: detección (colar alergia por frase) | ❌ **MAYOR** — "no puedo comer gluten" (tu caso), "celíaco" (acento) y frases sin keyword se cuelan |
| 2 · Save + dedupe (unique/norm) + caducidad + confirma | ✅ |
| 3 · Inyección activas/no-caducadas limit 12; caducadas/inactivas no | ✅ |
| 4 · RLS propio + revoke anon | ✅ |
| 5 · Deploy-safe sin SQL | ✅ |
| 6 · No-regresión (una acción por turno; demás tools/cap/rediseño) | ✅ |

**Recomiendo cerrar el guard (normalizar acentos + patrones de frase) ANTES del deploy** — es la
barrera crítica y uno de tus casos falla; el fix es pequeño. Todo lo demás está LISTO. No toqué
producción.
