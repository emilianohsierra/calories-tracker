# Base de Datos de Productos Propia — Fases del DELTA nuevo

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Alcance:** SOLO el delta nuevo (los 10 ítems del brief). **No repite** el MVP V1 de despensa (`plan/despensa-producto-mvp.md`, ya vivo/en construcción) ni el gating de escaneo (`plan/despensa-escaneo-gating.md`).
**Carriles:** Ada evalúa *qué* fuentes; CTO diseña la arquitectura del `ProductSearchService`; aquí defino **el orden por fases verificables, el Free/Pro y la postura de costo**, priorizando el WOW.

> **La tesis (por qué esto importa):** la DB propia es un **foso que se auto-construye**. Cada escaneo que falla y el usuario resuelve → un producto nuevo verificable para *todos los demás*. Entre más usuarios, mejor cobertura MX → mejor WOW → más usuarios. Ningún competidor gringo tiene esa DB latina creciendo sola. **El activo es la DB; la monetización sigue en la capa de coach/recomendaciones, no en cobrar por buscar un producto.**

**WOW que ordena las fases:** `escanear → producto real con foto + nutrición → despensa → coach`.

---

## Principio de monetización para TODO el delta
- **Buscar / escanear / contribuir a la DB = SIEMPRE Free e ilimitado.** Es la herramienta y el motor del foso; poner un muro aquí frenaría el crecimiento del activo. (Excepción ya decidida: foto de etiqueta comparte el cap de visión `analisis` 10/mes — es costo de IA, no de DB.)
- **Lo Pro sigue siendo el acompañamiento:** recomendaciones ilimitadas (`despensa_reco`), y **sustituciones** (D5) como gancho Pro/V2.
- La DB **no** es un tier; es infraestructura Free-facing que hace mejor todo lo demás.

---

## Fase D1 — Espina de la DB propia *(sin esto, "multi-fuente" no existe)*
**Objetivo:** que todo escaneo/búsqueda pase por un servicio único y sepamos cuán confiable es cada match.
| Ítem del brief | Qué entra |
|---|---|
| (8) **`ProductSearchService` formal** | Ruta única **DB propia → cache → API externa** (multi-fuente). Todo lookup pasa por aquí. |
| (3) **`confidence_score` 0-1** | Cada match trae score → decide auto-aceptar vs pedir confirmación/disambiguación (D3). |
| (9) **Campos nuevos** | `grasas_saturadas`, `subcategory`, `sku`, `package_type`. Baratos (schema), habilitan salud/coach (saturadas), sustituciones (subcategory) y match (sku/package). |
**Free/Pro:** todo Free (infra). **Costo:** el servicio **minimiza llamadas externas** (cache agresivo → producto servido desde DB/cache ≈ $0); la variable de costo es la API externa, que solo se llama en *miss*.
**Criterio verificable:** un barcode/búsqueda entra por `ProductSearchService`, responde con `{producto, source, confidence_score}`; un hit en DB/cache **no** llama a API externa (medible en logs).

## Fase D2 — La DB crece con el usuario *(el corazón del brief; el network effect)*
**Objetivo:** cuando el escaneo falla (cobertura MX baja hoy), el usuario **crea el producto** y eso **alimenta la DB para todos**.
| Ítem | Qué entra |
|---|---|
| (4) **`user_created` vs `verified`** | Producto marcado por procedencia: creado-por-usuario vs verificado. Flujo de "producto personalizado" cuando no existe. |
| (2) **`product_images`** | Múltiples imágenes por producto (foto del empaque/etiqueta que sube el usuario) → "producto real **con foto**" del WOW. |
| (7) **Update strategy + procedencia/versión** | Refrescar sin sobrescribir: cada producto guarda `source`, `version`, `created_by`; una actualización de fuente **no pisa** una corrección de usuario sin regla explícita. |
**Free/Pro:** contribuir (crear/foto/corregir) **Free e ilimitado** — es lo que construye el foso; incluso conviene incentivarlo. **Costo:** almacenamiento de `product_images` (reducir a ≤1280px como las fotos de comida; Supabase Storage barato; dedup de imágenes idénticas). Sin costo de IA por contribuir.
**Criterio verificable:** un escaneo que falla → flujo de "crear producto" con foto → el producto queda en la DB con `user_created`+procedencia y **aparece en el siguiente escaneo de otro usuario** (con `confidence` acorde hasta verificarse).

## Fase D3 — Match correcto *(calidad del escaneo/búsqueda cuando hay volumen)*
**Objetivo:** que multi-fuente + user-created no generen basura ni ambigüedad.
| Ítem | Qué entra |
|---|---|
| (5) **Dedup por nombre+marca+presentación** | Hoy solo por barcode; añadir dedup semántico (mismo producto sin código, o de varias fuentes) → un registro canónico. |
| (6) **Disambiguation UI ("¿cuál producto es?")** | Cuando hay varios resultados/confianza media → el usuario elige; su elección **sube el confidence** y alimenta el dedup. |
**Free/Pro:** Free. **Costo:** ≈ $0 (lógica en DB/cliente).
**Criterio verificable:** dos entradas del mismo producto (distinta fuente / sin barcode) colapsan a un canónico; ante 2+ candidatos, la UI pide elegir y la elección persiste.

## Fase D4 — Más fuentes MX *(ampliar cobertura, cuando la espina existe)*
**Objetivo:** subir el hit-rate del escaneo con fuentes adicionales para México.
| Ítem | Qué entra |
|---|---|
| (1) **Fuentes externas adicionales MX** | Integrar las que **Ada** apruebe, **detrás del `ProductSearchService`** (D1), con su `source`/procedencia (D2) y dedup (D3). |
**Por qué después de D1-D3, no antes:** meter fuentes en un esquema sin servicio único, procedencia ni dedup = data sucia difícil de limpiar. Además Ada **aún las evalúa**. Cuando su evaluación cierre **y** la espina esté lista, se enchufan una por una.
**Free/Pro:** Free (cobertura). **Costo:** la variable real del delta — depende de cada fuente (Ada dimensiona costo/licencia por llamada). Mitigación ya diseñada: cache agresivo (D1) → cada producto se paga ~1 vez y luego se sirve gratis.
**Criterio verificable:** una fuente nueva entra sin cambiar el contrato del servicio; su `source` es rastreable; el hit-rate de escaneo MX sube (métrica abajo).

## Fase D5 — Sustituciones *(diferido de V1, gancho Pro)*
**Objetivo:** "no tienes crema → usa yogur" — acompañamiento Pro sobre una DB ya rica.
| Ítem | Qué entra |
|---|---|
| (10) **`product_alternatives`** | Tabla de equivalencias/sustituciones; usa `subcategory` (D1) + la DB madura. |
**Free/Pro:** **Pro** (acompañamiento; alineado con `despensa-gating.md`, marcado "Próximamente" hasta shippear). **Costo:** IA solo al *proponer* (dentro de `despensa_reco`/coach), no en la tabla.
**Criterio verificable:** ante un ingrediente ausente, el coach ofrece 1-3 alternativas válidas de la misma subcategoría, respetando filtros duros (alérgenos).

---

## Secuencia y encaje
```
Despensa V1 (texto + barcode OFF + "¿qué puedo comer?") — EN CONSTRUCCIÓN
  └─► D1 espina (ProductSearchService + confidence + campos)
        └─► D2 crece-con-usuario (user_created + images + procedencia)  ← el foso
              └─► D3 match (dedup + disambiguation)
                    └─► D4 más fuentes MX (Ada) — cuando su eval cierre
                          └─► D5 sustituciones (Pro/V2)
```
- **D1+D2 son la prioridad** — juntos ya entregan el WOW completo ("escanear → si falla, lo creo con foto → queda real para todos") y encienden el network effect. D3 llega cuando haya volumen; D4 cuando Ada cierre; D5 es Pro diferido.
- **Reconcilia con el roadmap vivo:** esto es la maduración de la **capa de datos** bajo la Despensa (R2.5). No compite con R2 (loop diario) ni R3 (proactividad); es infraestructura que hace mejor la despensa y el coach.

## Métrica de éxito del delta
- **Hit-rate de escaneo** (% de barcodes/búsquedas que devuelven producto real sin que el usuario lo cree). Sube con D2 (aporte) y D4 (fuentes). Meta de arranque: >50% MX, creciendo.
- **Tasa de contribución** (% de misses que el usuario resuelve creando el producto) — mide el motor del foso. Meta >30%.
- **Crecimiento de la DB propia** (productos nuevos/semana aportados por usuarios) — el activo compuesto.
- **% de productos verificados** (de user_created → verified) — salud/calidad de la DB.
- **Costo externo por producto nuevo** (llamadas API / productos añadidos) — debe bajar con cache y aporte de usuarios.

## Qué NO entra en este delta (evitar hervir el océano)
- ❌ Precios, tiendas, lista de compras adaptativa (siguen en V2 del brief de despensa).
- ❌ BD mexicana "completa" comprada de golpe — la construimos por aporte + fuentes evaluadas, no de un volcado caro.
- ❌ Verificación humana a escala / moderación pesada — en D2/D3 basta procedencia + confidence + dedup; moderación formal es posterior.
- ❌ Sustituciones antes de D5.

## Handoffs
- **Ada:** evalúa fuentes MX (costo/licencia/cobertura/legal) para D4; dimensiona el costo variable.
- **CTO:** arquitectura del `ProductSearchService` (D1), esquema de procedencia/versión (D2/D7) y dedup (D3); reusa cache y Storage existentes.
- **Rams:** flujo de "crear producto" + subir foto (D2) y la UI de disambiguation (D3) — de baja fricción, porque son el motor del foso.
- **Lugia:** D1+D2 es la apuesta del delta (WOW + network effect); D4 espera a Ada; D5 es Pro diferido.

## TL;DR
Faseo el delta en 5: **D1 espina** (`ProductSearchService` DB→cache→API + `confidence_score` + campos saturadas/subcategory/sku/package), **D2 crece-con-usuario** (`user_created`/verified + `product_images` + procedencia/versión) = el **network effect que construye el foso**, **D3 match** (dedup por nombre+marca+presentación + disambiguation UI), **D4 más fuentes MX** (Ada, cuando su eval cierre y detrás de la espina), **D5 sustituciones** (Pro/V2). **D1+D2 primero** — juntos entregan el WOW y encienden el crecimiento. **Todo el buscar/escanear/contribuir es Free** (la DB es foso, no tier); Pro sigue en coach/recos/sustituciones. Costo controlado por cache + aporte de usuarios; la variable real son las fuentes externas (Ada dimensiona). Métrica clave: hit-rate de escaneo y tasa de contribución.

---

# Faseo TÉCNICO (CTO) — brief Fase 2 → migraciones SQL + módulos de código

> Complementa el faseo de PRODUCTO de arriba (D1–D5, Drucker). Aquí mapeo las **Fases 3–7 del brief
> nuevo** a artefactos concretos. Cada fase = 1 migración SQL **aditiva idempotente** (la corre Emiliano)
> + módulos de código puros/testeables, **deployable y verificable por separado**. Detalle de esquema:
> `plan/producto-db-arquitectura.md` §12. Fuentes almacenables: OFF+USDA (**[Ada]** confirma); umbrales
> NOM y clasificación de riesgo de aditivos: **[Ada]**.

### Fase 3 — Barcode MVP · ✅ **YA HECHA** (en producción)
- SQL: `supabase/producto-db.sql` (products+columnas, product_nutrition+saturated_fat/source_updated_at, product_images, product_alternatives, external_fetch_log, brands_norm_trgm). **Corrida.**
- Código: `lib/pantry/product-search.js` (cache-first DB→OFF→id externa), `lib/pantry/off.js` (fetchOFF + cacheOFF + **searchOFFByName vía Search-a-licious**), `lib/pantry/product-brain.js` (dedupKey/confidence/decideMatch/pickBestSource), `app/api/pantry/search|products`, `sources.js` (UPCitemdb/BarcodeLookup id-only). Búsqueda por nombre vía OFF **ya viva**.
- Verificable: barcode/nombre entran por el servicio; hit en DB no llama externo; `{match,confidence,source}`.

### Fase 4 — Nombre + normalización + MX  *(el grueso del delta técnico)*
- **Migración `producto-db-fase4.sql`:** `products += country, nutri_score, nova_group, data_quality, data_quality_score`; `brands += country`; `product_nutrition += trans_fat_g, serving_size, serving_unit`. Checks idempotentes (A–E, 1–4, enum calidad, 0..1). Sin tocar existentes.
- **Código (módulos puros NUEVOS):** `lib/pantry/nutrition-normalize.js` (esquema canónico + `toCanonical` + `perServing` + interfaz `SourceAdapter`); `lib/pantry/country.js` (prefijo GS1→país); `lib/pantry/quality.js` (`calidadDe`→score+level). **Integración:** `localFuzzy` usa `similarity()` (§12.5); ranking bonifica `country=userCountry` (default MX); `cacheOFF` puebla country/nutri_score/nova/data_quality_score.
- Verificable: "mayonesa" ordena por calidad/país; un producto MX (750…) rankea sobre uno ajeno; `data_quality` visible; tests de las funciones puras.

### Fase 5 — OCR + no-encontrados + creación  *(mayormente YA, + capas de dato)*
- **YA:** OCR `leerEtiqueta`, `crearProductoUsuario` (is_user_created), `product_images`, miss con "Agregar el tuyo" precargado. **En producción.**
- **Migración `producto-db-fase5.sql`:** `product_ingredients(product_id, ingredient, position, source)`; `product_additives(product_id, additive_code, name, source[, nivel_riesgo])` — `nivel_riesgo` **SOLO si [Ada] confirma fuente libre**, si no se omite. RLS catálogo append (igual patrón).
- **Código:** `lib/pantry/nom051.js` (sellos PUROS, **[Ada] umbrales**) → se expone en el shape del producto (compute-al-vuelo); parseo opcional de ingredientes desde OCR/OFF.
- Verificable: producto con ingredientes/aditivos rastreables; sellos NOM reproducibles por test contra la etiqueta; sin umbrales de Ada, el módulo queda inerte (no inventa).

### Fase 6 — Despensa + Coach + Recetas  *(integración, reuso)*
- Sin esquema nuevo de DB de productos (recetas viven fuera de este catálogo). **Reuso:** la despensa y `¿qué puedo comer?` ya consumen `ProductSearchService`/`readItemsParaMatching`; el coach usa `filtrarDespensaSegura`. Se enriquecen con `nutri_score/nova/sellos/data_quality` ya disponibles (Fases 4–5) para mejores recomendaciones.
- Verificable: el coach cita calidad/sellos del producto; nada nuevo que migrar aquí.

### Fase 7 — Lista de compras + Sustituciones  *(Pro/diferido)*
- **YA (tabla):** `shopping_lists/shopping_list_items` (despensa.sql) y `product_alternatives` (Fase 0) **creadas**.
- **Código:** activar el feature de sustituciones (coach propone alternativas de misma `subcategory`, respetando alérgenos duros vía `safety.js`), poblar `product_alternatives`. Gating Pro (`plan/despensa-gating.md`).
- Verificable: ante ingrediente ausente, 1–3 alternativas válidas mismas subcategoría/filtros.

## Orden recomendado y dependencias
```
Fase 3 ✅ (base viva)
  └─► Fase 4  (columnas + normalización + MX + calidad + fuzzy)   ← PRIORIDAD del delta técnico
        ├─► Fase 5  (ingredientes/aditivos + NOM)  [Ada: umbrales/riesgo]
        └─► (USDA como 2º adapter — [Ada] licencia/orden)
              └─► Fase 6 (integración coach, reuso)
                    └─► Fase 7 (sustituciones, Pro)
```
- **Fase 4 es el bloque técnico central** (habilita nivel Yuka: nutri-score/nova/calidad/multi-país/fuzzy real). **Fase 5** añade el dato fino (ingredientes/aditivos/sellos) y depende de **[Ada]**. USDA entra como **2º adapter** cuando Ada cierre licencia/orden — sin cambiar el contrato del servicio.
- Cada migración es aditiva/idempotente/deploy-safe; el código nuevo son **funciones puras testeables** + integración en el servicio existente. **No** se toca Stripe ni `safety.js`.

## Campos/umbrales dependientes de Ada (marcados)
- Orden y licencia de **fuentes** (USDA y otras MX) — [Ada].
- **Umbrales NOM-051** para `nom051.js` — [Ada] (sin ellos el módulo no se activa).
- **`product_additives.nivel_riesgo`** — sólo si hay **fuente libre** de clasificación — [Ada]; si no, se omite (no inventar riesgo).
- Licencia de imágenes de fuentes ≠ OFF antes de enlazarlas — [Ada].

## Backlog (no bloqueante)
- **L2 (Slowking, gate NOM-051):** la negación a nivel token puede **sub-marcar** casos como "azúcar sin refinar" (el token contiene `sin` → se descarta aunque el azúcar sea real). Dirección segura (nunca sobre-marca). Refinamiento futuro: distinguir "sin \<nutriente\> añadido/a" (negación real) de "\<algo\> sin refinar/sin \<otra cosa\>". No bloquea Fase 5.
