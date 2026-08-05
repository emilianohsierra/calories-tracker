# Fuentes Externas de Datos de Productos — Track-Calories (mercado MX) · v2 ampliada

> Objetivo: evaluar fuentes de datos de productos (barcode, nutrición, imagen, marca, ingredientes) priorizando **cobertura MEXICANA por código de barras**, para alimentar el `ProductSearchService` del CTO (gkmi48v7), que se parametriza por una **lista ordenada de adapters** — este doc define ese orden.
> Autor: Ada Research (d4bsvfz7).

## ⚠️ Nota de verificación (honestidad de datos)
- **Verificado** en docs oficiales/terceros: existencia de API, tiers, límites y cláusulas de licencia citadas.
- **NO verificable en vivo:** conteo exacto de productos MX por fuente; precios/límites cambian sin aviso; inclusión explícita de MX en FatSecret. Marcado *(verificar)* donde aplica.
- **Regla del brief cumplida:** NO propongo scraping de fuentes que lo prohíben (retailers MX, Edamam, etc.).

---

## 1) TABLA COMPARATIVA

| Fuente | (a) Cobertura MX por barcode | (b) Licencia: ¿cachear+REDISTRIBUIR en DB? ¿imágenes? ¿scraping? | (c) Rate limit / precio / API key | (d) Completitud de campos (kcal/macros/fibra/azúcar/sodio/saturada + alérgenos + ingredientes) | (e) Imágenes |
|--------|------------------------------|------------------------------------------------------------------|-----------------------------------|-----------------------------------------------------------------------------------------------|--------------|
| **Open Food Facts (OFF)** | **Alta (la mejor gratis).** Sección MX dedicada; colaborativo, calidad variable *(conteo exacto verificar en `mx.openfoodfacts.org/product-count`)* | **Datos: ODbL** → cachear+redistribuir **SÍ**, pero **share-alike**: si redistribuyes la DB combinada, debe publicarse como open data (⚠️ matiz clave). Atribución obligatoria. **Imágenes: CC-BY-SA 3.0** (usar con atribución). No scraping: hay API + dumps | **Gratis, sin API key.** Pide User-Agent; regla "1 call = 1 scan real"; bulk vía **dumps** | **Completa** (según producto): kcal, macros, **saturada, azúcar, fibra, sodio/sal**, **ingredientes**, **alérgenos estructurados** (taxonomía), Nutri-Score/NOVA | **Sí** (CC-BY-SA) |
| **USDA FoodData Central** | **Baja para MX.** Enfoque EE.UU.; branded trae GTIN/UPC pero **sin endpoint de búsqueda por barcode** | **CC0 (dominio público)** → cachear+redistribuir **SÍ, sin restricción** ni atribución. Sin scraping (API) | **1,000 req/hora/IP** (bloqueo 1h). Gratis, **API key data.gov** | Macro/micros muy detallados, porciones, ingredientes (branded). Alérgenos no estructurados | **Casi no** |
| **Nutritionix (Syndigo)** | Media; soporte español. MX no cuantificado *(verificar)* | Almacenar **solo con licencia de datos de pago** (bulk permite guardar). Sin ella, no DB propia | **Sin tier gratis público.** ~$50–$2,000+/mes | Nutrición completa, porciones, restaurantes fuerte | Limitadas |
| **Edamam** | Global 700k+ UPC/EAN; MX no cuantificado | **❌ Prohíbe** scrapear/copiar/guardar. Caching solo en pago y **solo 4 macros + foodId + label + imagen**, tras password. No construir DB | Basic gratis: **1,000/día, 50/min** | Solo macros básicos garantizados; ingredientes limitados | Limitadas (no redistribuibles) |
| **FatSecret Platform** | Barcode global **>90%**, 58 países/26 idiomas. **MX no confirmado** *(verificar)*; **free tier = solo dataset US** | **❌ Para DB propia:** ToS **no permite almacenamiento local/custom**; solo caching temporal. Imágenes provistas pero no para construir DB | Basic **5,000 calls/día**; Premier Free (startups/nonprofits, US-only) | Nutrición completa; barcode; buena estructura | **Sí**, .png 72/400/1024 (pero no almacenable) |
| **Chomp (chompthis.com)** | 875k productos branded (mayormente US). MX no cuantificado *(verificar)* | Cachear **durante suscripción SÍ**, pero **al terminar debes borrar** datos crudos/caché (los registros generados por usuario se conservan). **No es DB propia perpetua** | **$299/mes + $0.001/MAU** (requiere user_id por billing). API key | **Fuerte:** nutrición, **ingredientes**, **alérgenos**, diet labels, barcode | Sí |
| **Barcode Lookup** | Amplio global, enfoque retail/e-commerce; MX parcial | Retención según plan *(verificar ToS)*. Catálogo retail, no nutrición | De pago (trial limitado). API key | Nombre, marca, categoría, **imagen**; **nutrición ausente/parcial** | **Sí** |
| **Datakick** | — | **❌ MUERTO** (cerró marzo 2020). El wrapper ya no funciona | N/A | N/A | N/A |
| **GS1 México (Verified by GS1)** | **Autoritativa para barcodes MX**: valida GTIN, dueño de la licencia, estado activo/inactivo, info básica del producto | Uso vía API **requiere membresía GS1 México activa** (de pago). Es validación/propiedad, no un feed nutricional redistribuible | **API bajo membresía** (contactar GS1 MX). No es gratis | **NO nutrición.** Sí: GTIN, marca, **presentación/descripción básica**, propietario | Limitadas/no |
| **Retailers MX (Walmart/Soriana/Chedraui)** | Catálogo MX real, pero… | **❌ Sin API pública** (Walmart solo partners/suppliers; Soriana/Chedraui sin API). Scraping de sus sitios viola ToS → **descartado por el brief** | N/A pública | Nombre, precio, imagen (vía catálogo); **nutrición no estructurada** | Sí (pero no accesible legalmente por API) |

---

## 2) ORDEN DE PRIORIDAD PARA MX (barcode-first) + qué descartar

**Adapters del `ProductSearchService`, en orden (barcode como llave):**

1. **`LocalDbAdapter`** — nuestra DB propia (poblada con OFF + USDA). Primer hit, latencia cero.
2. **`OpenFoodFactsAdapter`** (live API) — **fuente primaria MX**. Único gratis que permite **almacenar datos + imágenes** legalmente y con mejor cobertura mexicana. Al resolver, se persiste en Local DB.
3. **`BarcodeIdentifyAdapter`** (UPCitemdb → Barcode Lookup) — **fallback de IDENTIFICACIÓN** cuando OFF no tiene el barcode: resuelve nombre/marca/imagen para no dejar al usuario sin resultado + **encola contribución de vuelta a OFF**. (No aporta nutrición.)
4. **`ChompAdapter`** (opcional, de pago) — **fallback de NUTRICIÓN** en vivo para barcodes ausentes en OFF, con ingredientes/alérgenos. Ojo: borrar caché al terminar contrato → no redistribuible.
5. **`Gs1MxVerifyAdapter`** (opcional, membresía) — **validación autoritativa** de GTIN/presentación MX (no nutrición). Se activa solo si hay membresía GS1 México.

**Enriquecimiento (no adapter de barcode, corre en batch):**
- **`UsdaEnrichmentJob`** (CC0) — completa macros/micros de genéricos/importados con datos de dominio público, sin ataduras de licencia.

**DESCARTAR (por licencia/costo/estado):**
- **Datakick** → muerto (2020).
- **Edamam** → ToS prohíbe almacenar/copiar (no sirve para DB propia).
- **Spoonacular** → caché máx 1h + borrar todo al cancelar.
- **FatSecret** → sin almacenamiento local permitido; free tier solo US.
- **Nutritionix** → sin tier gratis; solo con licencia de datos de pago.
- **Retailers MX (Walmart/Soriana/Chedraui)** → sin API pública; scraping prohibido por ToS.
- (**Chomp** y **GS1 MX** NO se descartan, pero entran solo como **lookup/validación en vivo de pago**, nunca como fuente redistribuible en nuestro dump.)

**Regla de arquitectura por licencia (crítica para el CTO):** solo **OFF (ODbL)** y **USDA (CC0)** pueden persistirse y formar el dump propio. Todo lo demás (Chomp, GS1, UPCitemdb) se usa en **tiempo real** y se cachea únicamente lo que su ToS permite, **aislado** del dataset redistribuible para no "contaminar" la licencia. El share-alike de ODbL implica: uso interno en la app = OK; **redistribuir** la DB combinada obliga a abrirla → revisar con legal antes de exponer un dump público.

---

## 3) ¿Qué fuente desambigua mejor las PRESENTACIONES mexicanas?

Contexto: en MX una misma marca tiene muchas presentaciones (Coca-Cola 355ml / 600ml / 2L; Sabritas 45g / familiar), y **cada presentación = un código de barras distinto**. Desambiguar = mapear barcode → presentación exacta (cantidad neta / gramaje).

- **Autoritativa: GS1 México (Verified by GS1).** Es el emisor de los GTIN en México → la fuente de verdad sobre **qué presentación corresponde a cada barcode** y quién es el dueño de la licencia. **Pero** requiere membresía de pago y **no da nutrición**. Ideal para *validar/corregir* presentaciones, no para poblar nutrición.
- **Práctica y gratis: Open Food Facts.** Cada barcode en OFF es una entrada por presentación e incluye **quantity / net weight / serving size**, lo que ya desambigua a nivel de producto-presentación en el mercado mexicano sin costo. Es la opción operativa por defecto.

**Recomendación de desambiguación:** usar **OFF como desambiguador por defecto** (barcode→presentación con cantidad/porción, gratis y almacenable) y, si el negocio lo justifica, añadir **GS1 México Verified como validador autoritativo** para casos de conflicto o catálogo premium.

---

## Reporte
**Nombre:** Ada Research (d4bsvfz7)
**Objetivo:** ampliar la evaluación a 10 fuentes y entregar tabla + orden de adapters + desambiguador de presentaciones MX.
**Tareas:** documentadas cobertura MX, licencia (cachear/redistribuir/imágenes/scraping), rate/precio/key, completitud de campos e imágenes por fuente; definido el orden del `ProductSearchService`.
**Hallazgos:** OFF sigue siendo la única base gratis que permite **almacenar datos+imágenes** para MX (ODbL share-alike). USDA (CC0) es el mejor enriquecedor legal. Chomp y GS1 MX son valiosos pero **solo como lookup/validación de pago** (no redistribuibles). Datakick está muerto; Edamam/Spoonacular/FatSecret/Nutritionix/retailers se descartan para DB propia.
**Problemas:** conteos MX exactos e inclusión de MX en FatSecret no verificables en vivo (marcado). GS1 MX y Chomp implican costo/membresía.
**Riesgos:** share-alike de ODbL al redistribuir; "contaminación" de licencia si se mezclan fuentes restrictivas en el dump → mitigado con la regla de aislamiento por licencia.
**Métricas:** correr prueba de 100–200 barcodes MX reales (Bimbo/Lala/Sabritas/Barcel/Coca-Cola presentaciones) → medir hit-rate OFF + completitud de saturada/fibra/azúcar/sodio + % presentaciones bien desambiguadas.
**Siguiente paso:** el CTO cablea los adapters en el orden definido; correr la prueba de cobertura para calibrar cuándo activar los fallbacks de pago (Chomp/GS1).
**Recomendación:** orden final de adapters = **LocalDB → OFF → UPCitemdb/BarcodeLookup (ID) → Chomp (nutrición, opcional pago) → GS1 MX (validación, opcional membresía)**, con **USDA como job de enriquecimiento**. Persistir solo OFF+USDA; el resto, lookup en vivo aislado.

---

## Fuentes
- [Open Food Facts — Data, API & SDKs](https://world.openfoodfacts.org/data)
- [Open Food Facts México — contador](https://mx.openfoodfacts.org/product-count)
- [USDA FoodData Central — API Guide](https://fdc.nal.usda.gov/api-guide)
- [FatSecret Platform API — editions](https://platform.fatsecret.com/api-editions)
- [Chomp Food API — License Information](https://chompthis.com/api/terms.php)
- [Chomp — RapidAPI pricing](https://rapidapi.com/chomp/api/chomp-food-nutrition-database-v2/pricing)
- [Datakick (gtinsearch.org) — estado/API](https://gtinsearch.org/api)
- [GS1 México — Verified by GS1](https://www.gs1mexico.org/verified)
- [GS1 México — preguntas frecuentes](https://www.gs1mexico.org/preguntas-frecuentes)
- [Edamam — Food Database API](https://developer.edamam.com/food-database-api)
- [Walmart I/O — API reference](https://walmart.io/apirefservices)
