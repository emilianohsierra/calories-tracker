# Despensa — Escaneo (código + foto de etiqueta): Gating

**Autor:** Drucker (Head of Product) · Fecha: 2026-08-01 · **Reporta:** Lugia (mwao6a57)
**Complementa:** `plan/despensa-gating.md`. Decisión rápida para relayar al CTO.

---

## (1) FOTO DE ETIQUETA → **mismo cap de fotos** (`feature='analisis'`, 10/mes Free) ✅ confirmo tu instinto
- **Es la misma economía de visión** (Claude vision), así que comparte el cap de análisis de foto. Una sola cifra que administrar, un solo modelo mental para el usuario ("análisis con foto = 10/mes"), y protege margen igual.
- **No crear `feature='etiqueta'` nuevo:** duplicaría config y superficie de costo sin beneficio; la foto de etiqueta y la foto de platillo son el mismo gasto.
- **Al agotar:** `429 variant:'limit' feature:'analisis'` (el flujo de paywall ya vivo, sin cambios).

**Matiz clave para que NO frene la adopción de la despensa:** poblar la despensa tiene **dos rutas gratis e ilimitadas** — **texto libre** (ya definido) y **código de barras** (abajo). La **foto de etiqueta es la vía de conveniencia** que comparte el cap de visión. Así el usuario nunca se queda sin poder llenar su despensa (texto + barcode ilimitados); la foto solo se usa cuando quiere comodidad y le quedan análisis. Cero dark pattern.

## (2) ESCANEAR CÓDIGO (lookup OFF, ~$0) → **SIN cap, Free ilimitado** ✅ confirmo
- Costo ≈ 0 (lookup a Open Food Facts) → **ilimitado para Free y Pro.** Gancho de adopción y **datos verificados** (mejores que la estimación) que suben la calidad y la seguridad de alérgenos.
- Sin `429`, sin muro, nunca dispara paywall.

**Dos caveats de producto (no bloquean, avisar al CTO):**
1. **Cobertura de OFF en México es floja** → muchos códigos no traerán resultado. **Fallback graciosa obligatoria:** si el código no existe en OFF → ofrecer **agregar por texto o foto de etiqueta**, nunca un callejón sin salida ni un error seco. La UX de la miss es tan importante como el hit.
2. **Alérgenos desde barcode:** los datos de OFF pueden traer alérgenos → **mostrarlos como información**, pero **NO auto-poblar restricciones/filtros** todavía: la captura de alergias sigue bloqueada hasta el filtro hermético con etiquetas (`plan/coach-alergias-arquitectura.md`, regla dura del Director). Por ahora barcode enriquece el producto en la despensa; no activa el filtro de seguridad hasta que ese slice pase QA.

---

## Contrato para el CTO (resumen)
| Vía de captura a despensa | Cap | Costo | Respuesta |
|---|---|---|---|
| **Texto libre** | ninguno (ilimitado) | ~$0 | 200 |
| **Código de barras** (OFF) | **ninguno (ilimitado)** | ~$0 | 200; miss → fallback a texto/foto |
| **Foto de etiqueta** (Claude vision) | **mismo `feature='analisis'` (10/mes Free)** | visión | 200 dentro del cap; **429 `limit`** al agotar |
| **"¿Qué puedo comer?"** (`despensa_reco`) | 3/mes Free (ya definido) | IA grounding | 429 `limit` al agotar |

- Foto de etiqueta reusa la reserva atómica del cap `analisis` **antes** de llamar a la visión (patrón vivo).
- Barcode: sin contador; solo lookup + cache opcional del resultado por código para no repetir llamadas a OFF.

## TL;DR
**(1) Foto de etiqueta = mismo cap de fotos (`analisis`, 10/mes Free)** — misma economía de visión; no crear cap nuevo. **(2) Barcode = ilimitado gratis** (costo ~0, datos verificados). La adopción de despensa queda protegida porque **texto y barcode son ilimitados**; la foto de etiqueta es la vía de conveniencia capada. Caveats: fallback graciosa cuando OFF no encuentra el código, y los alérgenos de barcode se muestran pero **no** activan el filtro de restricciones hasta el slice hermético. Consistente con R1, sin dark patterns.
