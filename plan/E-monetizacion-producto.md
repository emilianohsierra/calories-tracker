# E — Monetización: Producto y UX del Paywall

**Autor:** Product Manager (Drucker Product) · **Sprint de Monetización — frente Producto/UX** · Fecha: 2026-07-24
**Para:** CTO (implementación) · **Coordina:** Lugia (Director)

Modelo: **freemium — 10 análisis con foto gratis / mes, luego Pro.** Este doc define la *experiencia*; no toca código.

> **Regla de oro:** el registro **manual siempre es ilimitado y gratis.** El límite aplica **solo al análisis con foto (IA)**, que es lo que nos cuesta dinero. El usuario nunca se queda sin poder registrar su comida → el paywall bloquea una *comodidad*, no la *función core*. Esto evita que se sienta agresivo.

---

## (1) Experiencia del paywall — cuándo y cómo aparece

El contador es **mensual, se reinicia el día 1 de cada mes**. 3 momentos, de suave a firme:

### a) Siempre visible — Badge de saldo (no intrusivo)
- Badge pequeño junto al botón de cámara / en el header: **"7/10 análisis IA"**.
- Estado normal gris; **ámbar** cuando quedan ≤3.
- Tocar el badge abre la tabla comparativa Free vs Pro (no un bloqueo).
- Propósito: transparencia. El usuario nunca se sorprende al llegar a 0.

### b) Aviso al 80% (8/10) — recordatorio amable, una sola vez
- Toast/banner discreto **después** de guardar el 8º análisis (nunca antes de que vea su resultado):
  > "Te quedan 2 análisis con IA este mes. Con Pro son ilimitados."
- Con botón secundario "Ver Pro" y una **X para cerrar**. No bloquea. **Se muestra máximo 1 vez por mes** (guardar flag `warned_80_YYYYMM`).

### c) Al agotar los 10 — el momento del paywall (firme pero con salida)
- El usuario **igual ve funcionar el producto**: primero toma la foto y llega a la pantalla de resultado como siempre… la diferencia es que al intentar el **11º análisis** aparece el modal de límite **antes** de llamar a la IA (para no gastar la llamada).
- El modal ofrece **3 salidas claras**, en este orden:
  1. **Suscribirme a Pro** (CTA primario).
  2. **Registrar manualmente** (secundario) — "Escribe las calorías a mano, es gratis e ilimitado." → abre el formulario manual con la foto ya adjunta.
  3. **Cerrar** — "Se reinicia el 1 de [mes]. Te avisamos."

**Principios anti-agresividad:**
- Nunca interrumpir *antes* de mostrar valor (el aviso 80% es post-resultado).
- Nunca bloquear el registro manual.
- Frecuencia con tope: badge siempre, aviso 80% 1×/mes, modal solo al intentar pasar el límite.
- Sin cuentas regresivas, sin oscurecer la pantalla, sin "última oportunidad".

---

## (2) Tabla comparativa Free vs Pro

| Función | **Free** | **Pro** |
|---|---|---|
| Análisis de foto con IA | **10 / mes** | **Ilimitado** (uso justo hasta 300/mes) |
| Registro manual de comidas | Ilimitado | Ilimitado |
| Resumen diario y meta calórica | ✅ | ✅ |
| Gráfica de 7 días | ✅ | ✅ Historial completo |
| Reanálisis con corrección ("son 2 tacos") | ❌ | ✅ |
| Análisis de precisión (modelo avanzado) | ❌ | ✅ |
| Metas de macros (proteína/carbs/grasa) | Solo calorías | ✅ Completas |
| Exportar datos (CSV) | ❌ | ✅ |
| Sin anuncios / soporte prioritario | — | ✅ |

**Precio:** **$99 MXN/mes** o **$799 MXN/año** (equivale a 2 meses gratis) · ~$4.99 / $39.99 USD. Cobro por web (Stripe) para maximizar margen.

---

## (3) Copy en español

### Modal de límite alcanzado (11º intento)
- **Título:** "Llegaste a tus 10 análisis gratis del mes 🎉"
- **Cuerpo:** "Con **Pro** analizas con IA todas las comidas que quieras, sin contar. Y mientras, siempre puedes registrar a mano gratis."
- **CTA primario:** **"Hazte Pro — $99/mes"**
- **Secundario:** "Registrar a mano"
- **Terciario (link):** "Tus análisis se reinician el 1 de agosto"

### Aviso al 80%
- "Te quedan **2 análisis con IA** este mes 📸 — con Pro son ilimitados."  · Botón: "Ver Pro"

### Badge
- Normal: "**7/10** análisis IA" · Bajo: "**2/10** — quedan pocos"

### Botón de suscripción (pantalla de planes)
- Mensual: **"Suscribirme por $99/mes"**
- Anual (destacado con etiqueta "Ahorra 2 meses"): **"Suscribirme por $799/año"**
- Microcopy bajo el botón: "Cancela cuando quieras. Sin permanencia."

### Confirmación post-pago
- "¡Ya eres Pro! 🚀 Analiza sin límites. Gracias por apoyar la app."

---

## (4) Qué pasa al cancelar

**Regla:** cancelar **NO revoca Pro de inmediato.** El usuario **mantiene Pro hasta el final del periodo ya pagado**; al terminar, baja a Free automáticamente. (En Stripe: `cancel_at_period_end = true`.)

**Experiencia:**
- Al cancelar → confirmación tranquila:
  > "Listo. Seguirás siendo Pro hasta el **[fecha fin de periodo]**. Después pasarás a Free (10 análisis IA/mes). Tus datos y tu historial se conservan."
- No pedir motivo de forma obligatoria (encuesta opcional de 1 tap: "¿por qué te vas?").
- Ofrecer **una** retención suave si es plan mensual: "¿Prefieres pausar 1 mes en vez de cancelar?" (opcional, fase posterior).
- Estado en la app tras cancelar y seguir en periodo: badge "Pro (activo hasta [fecha])".
- Al vencer: baja a Free. Si excede 10/mes después, aplica el flujo normal del paywall. **Nunca se borran datos ni fotos** por bajar de plan.

**Reactivación:** si vuelve a suscribirse antes del fin de periodo, simplemente se quita el `cancel_at_period_end` (no doble cobro).

---

## Notas para el CTO (dependencias de esta UX)
- Requiere: **auth + contador mensual de análisis por usuario** (hoy `app/api/analyze/route.js` no lo tiene) y **verificar el límite ANTES de llamar a la IA** para no gastar la llamada en el 11º.
- Flags de estado por usuario/mes: `ai_count_YYYYMM`, `warned_80_YYYYMM`.
- Estados de suscripción: `free | pro_active | pro_canceling (hasta fecha) | pro_expired`.
- Fuente de verdad de la suscripción: **webhook de Stripe** (no confiar solo en el cliente).
