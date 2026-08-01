# QA de seguridad — `findViolations` endurecido (filtro de alérgenos)

**De:** Nielsen QA (`beskkoig`) · **Para:** Director Lugia (`mwao6a57`)
**Archivo:** `lib/coach/allergens.js` (+test). `vitest` 48/48 (allergens 11/11). **Pruebas EN VIVO**
con ~90 casos (aciertos, misses adversariales, sobre-bloqueo).

---

## VEREDICTO: ✅ LISTO-PARA-DEPLOY (hoy, latente) — pero NO 100% hermético: huecos concretos

El endurecimiento es un gran avance: **pasa TODOS los casos que enumeraste** (plurales, cada miembro
de cada categoría, sinónimos que activan grupo, acentos/mayúsculas/regional, múltiples restricciones)
con **cero misses**, no sobre-bloquea lo obvio, y con `restr` vacío devuelve `[]`. Se puede desplegar
hoy sin riesgo (nadie tiene restricciones aún). **Pero no puedo certificar "hermético":** hay una
clase concreta y común de misses —**nombres de producto**— que debe cerrarse antes de capturar
alergias.

---

## (1) HERMÉTICO — lo que pasa ✅ y lo que NO ❌

**✅ TODO lo que pediste, verificado en vivo (cero misses):**
- **Plurales:** `nueces→nuez`, `mariscos`, `almendras`, `camarones` → marcados.
- **Categorías (cada miembro):** frutos_secos (nuez, almendra, avellana, pistache/pistacho, marañón,
  anacardo, castaña, macadamia, piñón, nogal), mariscos (camarón…pulpo, calamar, almeja, mejillón,
  ostión, jaiba), lácteos (leche, queso, yogur, crema, mantequilla, lactosa, nata, requesón),
  pescado (atún, salmón, tilapia, bacalao, trucha, mero…), gluten (trigo, harina, pan, pasta, cebada,
  centeno, avena, malta, seitán) → **todos marcados**.
- **Sinónimos que activan grupo:** `lactosa→queso`, `celiaquía/celiaco→pan/trigo`, `trigo→pasta`,
  `tacc→harina`, `maní↔cacahuate`, `sésamo/ajonjolí→tahini` → marcados.
- **Acentos / mayúsculas / regional:** `FRUTOS SECOS→piñón`, `pescado→atún`, `Nueces→ALMENDRA`,
  `maní→cacahuate` → marcados.
- **Múltiples restricciones:** `[gluten,mariscos,frutos secos]` marca camarón y almendra;
  `[lácteos,huevo]` marca clara. ✔

**❌ Misses concretos (nombres de PRODUCTO que no contienen el término genérico como substring):**
- **Quesos con nombre bajo `lácteos` (12/12 MISS):** parmesano, mozzarella, cheddar, gouda, manchego,
  brie, ricotta, provolone, feta, panela, oaxaca, gruyère → **NO se marcan.** ⚠️ El más grave: los
  quesos con nombre son ubicuos (pizza=mozzarella, pasta=parmesano) y el modelo de grounding bien
  puede emitirlos en vez de "queso".
- **Productos con gluten con nombre:** baguette, croissant, cerveza, fideos, macarrones → MISS.
  (Sí marca: pan, tortilla de harina.)
- **Ingredientes ocultos / imitación:** mayonesa/merengue (huevo), surimi/kanikama (marisco) → MISS.
- *Nota:* `frutos secos` NO marca `cacahuate` — es **correcto** técnicamente (el maní es leguminosa,
  grupo `mani`), aunque muchos usuarios lo conflacionan; decisión de producto si se quiere ser
  conservador (que "frutos secos" active también `mani`).

**Diagnóstico:** el filtro es hermético para **términos genéricos + miembros listados**, pero un
enfoque por keyword/substring **nunca** será hermético contra **nombres de plato/producto** sin un
léxico de productos. La mayor ganancia real: **añadir los quesos con nombre** (lácteos es la
restricción #1) y productos de gluten comunes.

## (2) NO sobre-bloquea lo obvio — ✅
Con `restr=['frutos secos']`, NO se marcan pollo, arroz, manzana, lechuga, jitomate, frijol,
aguacate. `manzana` vs `['mani']` → `[]` (no hay falso match pese a "man"). ✔

## (3) Trade-off de falsos positivos (aceptado, solo nota) — ✅
Por substring bidireccional: `panela` se marca con `['gluten']` (contiene "pan"); `pan integral`
correctamente marcado. Sobre-marcar es inocuo por diseño (hermético > preciso). Nota, no issue.

## (4) NO-REGRESIÓN — ✅
`findViolations([...], [])` → `[]` y `findViolations([...])` (sin 2º arg) → `[]`. Como
onboarding/perfil **no** capturan alergias/intolerancias, `restr` es siempre `[]` hoy → el filtro es
no-op → **registro (sub-1/2) y generar_cena (sub-4) se comportan igual que hoy**. Sin cambios de firma
que rompan a los llamadores.

---

## Recomendación (antes de capturar alergias — no bloquea el deploy de hoy)
1. **Añadir léxico de quesos con nombre** al grupo `lacteo` (parmesano, mozzarella, cheddar, gouda,
   manchego, brie, ricotta, provolone, feta, oaxaca, gruyère, panela, manchego…) — el hueco de mayor
   impacto real.
2. Añadir productos de gluten comunes (baguette, croissant, cerveza, fideos, macarrones, pizza…).
3. Considerar léxico de imitación (surimi/kanikama→marisco; mayonesa/merengue→huevo).
4. Como un keyword-filter no puede ser exhaustivo contra nombres de producto, mantener la instrucción
   de restricciones en el prompt como co-guarda y, a futuro, evaluar que el grounding emita
   **etiquetas de alérgeno por ingrediente** (estructura) en vez de solo texto.
5. Tests de seguridad con estos nombres de producto (hoy el test cubre genéricos + un plural feliz).

---

## Resumen para el Director
| Check | Estado |
|---|---|
| 1 · Hermético: plurales/categorías/sinónimos/acentos/multi | ✅ cero misses (todo lo enumerado) |
| 1 · Hermético: nombres de producto (quesos, gluten con nombre, ocultos) | ❌ misses concretos (latente hoy) |
| 2 · No sobre-bloquea lo obvio | ✅ |
| 3 · Falsos positivos por substring (panela→pan) | ✅ aceptado (nota) |
| 4 · restr vacío → [] → sub-1/2/4 igual hoy | ✅ |

**LISTO-PARA-DEPLOY hoy** (sin riesgo activo: no hay restricciones capturadas). **Antes de recolectar
alergias**, cerrar los nombres de producto (empezando por los quesos) — es donde el filtro de salud
debe ser hermético y aún se cuela un alérgeno común. No toqué producción.
