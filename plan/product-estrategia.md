# Estrategia de Producto y Monetización — Registro Calórico IA

**Autor:** Product Manager (agente Drucker Product) · **Sprint 1 — Diagnóstico** · Fecha: 2026-07-24

Basado en lectura del código real: `lib/analyze.js`, `lib/db.js`, `app/api/analyze/route.js`, `README.md`, `package.json`. **No se modificó código.**

---

## Hallazgos técnicos que condicionan la monetización

1. **Sin control de consumo:** `app/api/analyze/route.js` no tiene auth, ni rate-limiting, ni conteo de uso por usuario. Hoy cada foto = 1 llamada a vision API **sin tope**. Esto es el bloqueo #1 para cualquier freemium: **no se puede limitar el plan gratis** hasta que exista login + contador.
2. **Multi-proveedor ya listo:** `lib/analyze.js` soporta OpenAI (`gpt-4o-mini`) y Grok (xAI) con el mismo formato. Palanca de costo/negociación desde el día 1.
3. **Optimización de costo ya hecha:** las imágenes se reducen a máx. 1280px en el navegador y `max_tokens: 700`. El costo por foto ya es bajo.
4. **Feature de valor diferenciado:** el reanálisis con corrección del usuario (`correction.feedback` en `lib/analyze.js:129`) — "son 2 tacos de pastor" — es un gancho premium natural.
5. **Prompt ya sesgado a cocina mexicana** (`SYSTEM_PROMPT`, `lib/analyze.js:88-100`): la ventaja LatAm ya está semilla en el producto.

---

## (1) Análisis competitivo

| App | Qué hace | Precio aprox. (USD) | Debilidad para LatAm |
|---|---|---|---|
| **Cal AI** | Foto → calorías/macros con IA. El líder del "foto-first". | ~$29–70/año (promo agresiva) | 100% en inglés, comida US; no reconoce bien platillos mexicanos. |
| **MyFitnessPal** | Base de datos enorme + escaneo de código de barras. Poco foto-IA. | ~$19.99/mes o ~$80/año | Caro para LatAm, UX pesada, registro manual tedioso. |
| **Yazio** | Plan de dietas + ayuno + recetas. | ~$40/año (~$8.33/mes anual) | Enfoque europeo; comida latina limitada. |
| **Foodvisor** | Foto-IA + coaching. | ~$60–100/año | Base de alimentos francesa/US; nada de comida mexicana. |

**El hueco (nuestra tesis):** ninguno está optimizado para **español nativo + comida mexicana/latina** (tacos, pozole, tamales, antojitos, porciones y marcas locales). Somos el **"Cal AI en español para la comida que sí comemos"**, con precio ajustado al poder adquisitivo de MX/LatAm. Esa es la única razón por la que alguien nos elegiría sobre Cal AI.

---

## (2) Modelo freemium con números

### Costo real por foto (estimado)
Con `gpt-4o-mini` + imagen ≤1280px + 700 tokens salida: **≈ $0.003–0.006 USD por análisis** (uso $0.005 USD ≈ **$0.09 MXN** como cifra de trabajo, TC 18). Con `gpt-4o` completo sería ~8–10x más → **mantener mini como default y ofrecer gpt-4o solo como "análisis de precisión" premium.**

### Tiers

| | **Gratis** | **Premium** |
|---|---|---|
| Análisis con foto | **10 / mes** (o 3/día) | **hasta 300 / mes** ("ilimitado justo") |
| Registro manual | Ilimitado | Ilimitado |
| Historial | 7 días (ya existe la gráfica) | Ilimitado + export CSV |
| Reanálisis con corrección | No | Sí (`correction.feedback`) |
| Modelo de precisión (gpt-4o) | No | Sí, opcional |
| Metas de macros y objetivos | Solo meta calórica | Macros + ayuno + peso objetivo |

### Precio sugerido

| Plan | MXN | USD |
|---|---|---|
| Mensual | **$99/mes** | **$4.99/mes** |
| Anual (2 meses gratis) | **$799/año** (~$66/mes) | **$39.99/año** |

Precio deliberadamente **por debajo de MyFitnessPal** y en línea con Cal AI/Yazio anual, pero cobrado en MXN → menor fricción psicológica en LatAm.

### Cómo el precio cubre el costo (margen)
- **Usuario Premium (peor caso, 300 análisis/mes):** 300 × $0.005 = **$1.50 USD costo IA/mes**.
- Precio mensual $4.99 − 30% comisión de tienda (App/Play) = **$3.49 neto** → margen bruto **$1.99 (~57%)**.
- Cobrando por **web/Stripe (~3%)**: $4.84 neto − $1.50 = **$3.34 (~69% margen)**. → **Priorizar cobro web.**
- El usuario premium **promedio** hará ~30–60 análisis/mes (no 300) → costo real ~$0.15–0.30 → **margen >90%**.
- **Costo del plan gratis:** 10 análisis × $0.005 = **$0.05 USD/mes por free** (~$0.90 MXN). Sostenible siempre que el límite se **haga cumplir** (requiere el contador — ver roadmap). Es el mayor riesgo si no se implementa.

---

## (3) Roadmap por fases (5 features prioritarias c/u)

### Fase 0 — MVP monetizable (habilitar cobro)
1. **Auth + multiusuario** (resuelve el blocker de monousuario) — Clerk/Auth.js.
2. **Migrar storage a la nube** (Postgres/Neon + fotos en S3/R2) — resuelve el blocker SQLite/disco en Vercel.
3. **Contador de análisis por usuario + límite** (habilita el freemium; hoy no existe).
4. **Integrar pagos** (Stripe web primero).
5. **Onboarding corto** (meta calórica + objetivo) para activar rápido.

### Fase 1 — Beta (validar retención)
1. Registro manual + búsqueda de alimentos frecuentes (reduce dependencia de IA = baja costo).
2. Escaneo de **código de barras** (paridad mínima con competidores).
3. **Base de comida mexicana/latina** curada (nuestro diferenciador).
4. Recordatorios/notificaciones (empujan D1/D7).
5. Instrumentación de métricas (ver sección 4).

### Fase 2 — Premium (subir ARPU)
1. Modelo de **precisión gpt-4o** opcional.
2. Reanálisis con corrección ilimitado + memoria de platillos recurrentes.
3. Metas de macros, ayuno intermitente, seguimiento de peso.
4. Export/reportes semanales y mensuales.
5. Prueba gratis de 7 días de Premium.

### Fase 3 — Growth (adquisición y escala)
1. App móvil / PWA instalable (la cámara es el 90% del uso).
2. Referidos ("invita y gana análisis premium").
3. Contenido SEO en español (recetas + calorías de platillos mexicanos).
4. Caché/deduplicación de análisis por foto repetida (baja costo IA a escala).
5. B2B: nutriólogos/gimnasios (plan multi-cliente).

---

## (4) Las 3 métricas clave desde el día 1

1. **Retención D7** (¿vuelven a la semana?) — sin esto no hay negocio; foto-tracking sufre de abandono. Meta inicial: >25%.
2. **Conversión free→Premium** — mide si el límite de 10/mes y el gancho de valor funcionan. Meta inicial: 3–5%.
3. **Costo de IA por usuario activo (COGS/MAU)** — vigilar que el gratis no sangre margen; mantener <$0.10 USD/free y <$0.50/premium.

*(Bonus a instrumentar: análisis por usuario/día y % de reanálisis con corrección — señal de precisión percibida.)*

---

## Recomendación (TL;DR)
El producto tiene **product-market fit potencial en el nicho español/mexicano**, pero **hoy es imposible monetizar**: falta auth, storage en nube y contador de uso. **Prioridad absoluta = Fase 0.** El costo por foto (~$0.005 USD) hace el freemium **muy rentable** (margen >90% en el usuario promedio) siempre que el límite del plan gratis se **haga cumplir**. Precio de entrada **$99 MXN/mes** o **$799 MXN/año**, cobrado **por web** para maximizar margen. Diferenciador único a defender: **comida mexicana/latina + español nativo**.
