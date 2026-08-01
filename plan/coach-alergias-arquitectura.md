# Captura de alergias/intolerancias — arquitectura HERMÉTICA (regla dura)

**Autor:** Torvalds (CTO) · **Para:** Lugia (Director) · **Origen:** dirección de Lugia + QA de seguridad de Nielsen · **Fecha:** 2026-07-31
**Estado:** DISEÑO obligatorio. **Ningún slice que capture alergias/intolerancias se despliega sin este diseño implementado + QA de seguridad.**

## 0. Por qué el keyword-filter NO basta
`lib/coach/allergens.js` (`findViolations`, endurecido y desplegado en `d7c2266`) es hermético para **genéricos, categorías, plurales y sinónimos** ("queso", "lácteos", "nueces", "mariscos"). Pero un filtro por keyword/substring **NUNCA** será 100% hermético contra **NOMBRES DE PRODUCTO**, porque no contienen la palabra del alérgeno:
- **Lácteos:** mozzarella, cheddar, manchego, parmesano, brie, feta, gruyere, ricotta, mascarpone…
- **Gluten:** baguette, croissant, cerveza, focaccia, pretzel, cuscús, bulgur, panko, salsa de soya (¡trigo!)…
- **Imitación / oculto:** surimi (pescado), mayonesa (huevo), pesto (lácteo+fruto seco), marisco en caldos/fondos…

Ampliar el léxico ("whack-a-mole") reduce el hueco pero no lo cierra. **La solución hermética es estructural, no más léxico.**

## 1. Solución hermética: ETIQUETAS DE ALÉRGENO POR INGREDIENTE (structured) + código
Cuando el coach GENERA comida (grounding de `generar_cena`, `cambiar_plan`, planes), la tool de generación debe emitir, **por cada ingrediente, sus etiquetas de alérgeno** en un enum cerrado — no texto libre. El **código** filtra por esas etiquetas; el keyword-filter queda como **co-guarda** (segunda barrera), nunca como única defensa.

### 1.1 Enum de alérgenos (cerrado, estable)
`lacteo · gluten · huevo · mani · frutos_secos · marisco · pescado · soya · ajonjoli · ninguno`
(alineado con los `GROUPS` de `allergens.js`; una sola fuente de verdad de nombres de grupo.)

### 1.2 Schema de generación (tools `proponer_opciones` / plan)
Cada opción lleva ingredientes ETIQUETADOS:
```json
{ "titulo": "...", "kcal": 0, "prot_g": 0, "carb_g": 0, "gras_g": 0, "tiempo_min": 0, "costo": "$",
  "ingredientes": [
    { "nombre": "mozzarella", "alergenos": ["lacteo"] },
    { "nombre": "baguette",   "alergenos": ["gluten"] },
    { "nombre": "pollo",      "alergenos": ["ninguno"] }
  ] }
```
El system prompt del generador incluye la instrucción dura: "Por cada ingrediente declara TODOS sus alérgenos del enum; si es un producto (mozzarella, surimi, baguette…) etiqueta el alérgeno subyacente; ante duda, etiquétalo (no lo dejes en 'ninguno')."

### 1.3 Filtro en código (doble barrera)
En el ejecutor, una opción se DESCARTA si:
1. **Por etiqueta (primaria):** algún ingrediente tiene una etiqueta de alérgeno ∈ restricciones del usuario. (Cierra nombres de producto.)
2. **Por keyword (co-guarda):** `findViolations(nombresDeIngrediente, restricciones)` marca algo. (Cierra el caso en que el modelo NO etiquetó bien.)
Si **cualquiera** de las dos marca → fuera. Belt-and-suspenders: hermético aunque una capa falle.

### 1.4 Léxico ampliado (co-guarda, no única defensa)
Añadir a `allergens.js` los nombres de producto comunes por grupo (backlog inmediato del slice):
- **lacteo:** mozzarella, cheddar, manchego, parmesano, brie, feta, gruyere, ricotta, mascarpone, gouda, provolone, panela(*), oaxaca, cotija.
- **gluten:** baguette, croissant, cerveza, focaccia, pretzel, cuscus, bulgur, panko, seitan, cuscús, pan de caja.
- **marisco/pescado imitación:** surimi. **huevo:** mayonesa. **fruto seco/lacteo:** pesto.
(*) Refinar falsos positivos (word-boundary / lista de excepciones tipo `panela` vs `pan`) también en este slice, con datos reales (queda del backlog aprobado).

## 2. Captura del dato (flujo seguro)
- **Origen:** onboarding/perfil (formulario) y/o el chat (`save_memory` de Karpathy §4.7: si el tipo es alergia/intolerancia, NO se guarda como memoria suelta → se enruta a `restricciones_duras` del perfil **con confirmación explícita** de la persona; es dato de salud, no preferencia).
- **Persistencia:** `nutrition_profiles.allergies` / `.intolerances` (ya consumidas por `assembleContext` → `ctx.profile`). Guardar los términos que la persona declara (genéricos o productos); el filtro los normaliza/expande.
- **Confirmación:** toda escritura a restricciones duras se CONFIRMA en UI (es salud). Rams: tarjeta de confirmación de alergia antes de escribir.

## 3. Tests de seguridad obligatorios (antes de deploy del slice)
- **Nombres de producto:** dado `restriccion=lacteo`, una opción con `mozzarella/cheddar/manchego` se descarta (por etiqueta y, si el modelo la puso, también por keyword).
- **Gluten producto:** `baguette/croissant/cerveza` con `restriccion=gluten` → fuera.
- **Imitación/oculto:** `surimi` (pescado), `mayonesa` (huevo) → fuera con la restricción correspondiente.
- **Modelo no etiqueta:** si `alergenos:["ninguno"]` está mal puesto en `queso`, la co-guarda por keyword igual lo descarta.
- **No-listado seguro:** comida sin el alérgeno pasa (sin falsos negativos ni exclusión total).
- **Ambas capas:** test que desactiva una capa y verifica que la otra sigue cerrando el caso.

## 4. Regla dura (no negociable)
1. Ningún slice de captura de alergias se despliega sin (1.2)+(1.3) implementados y (3) en verde + QA de seguridad de Nielsen.
2. El enum de alérgenos y los `GROUPS` de `allergens.js` comparten una sola fuente de nombres.
3. El keyword-filter es co-guarda permanente, no se elimina al añadir etiquetas.
