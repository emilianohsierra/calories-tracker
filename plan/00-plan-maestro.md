# Plan Maestro — calories-tracker

**Síntesis del Director General (Lugia)** · 2026-07-24
Fuentes: `plan/cto-despliegue.md`, `plan/product-estrategia.md`, `plan/ux-rediseno.md`, `plan/ia-precision.md`.

## Veredicto
Producto con potencial de PMF en el nicho **español + comida mexicana/latina**, pero HOY **no es lanzable ni monetizable**. Un mismo problema es a la vez bloqueo de despliegue, de monetización, de seguridad y de costo: **la API es pública, sin auth ni límite de uso.**

## 🚨 Riesgo #1 (URGENTE, antes de exponer nada)
`/api/analyze` sin auth ni rate-limit + `OPENAI_API_KEY` en el server = cualquiera con la URL puede **vaciar el saldo de OpenAI**. Detectado por CTO (crítico) y Product (blocker). Tapar ANTES de publicar.

## Decisiones de arquitectura (conflictos entre agentes, resueltos por el Director)
1. **Stack de datos: TODO Supabase** (Postgres + Auth + Storage). *Motivo:* el equipo ya domina Supabase (gestor-tareas, mini-CRM) y tiene proyecto activo → un solo proveedor, menos que aprender. *Costo:* reescribir SQL de SQLite→Postgres (solo 2 tablas). Esto **anula** la rec. del CTO (Turso) y la de Product (Neon/Clerk) por razón de negocio/aprendizaje, no técnica. **Fallback documentado:** Turso (libSQL, SQLite casi 1:1) si el rewrite a Postgres estorba.
2. **Auth: Supabase Auth** (no Clerk/Auth.js) — misma razón.
3. **Precisión IA por fases:** MVP mantiene el análisis actual (1 paso) + quick-wins baratos. El **grounding** contra BD nutricional (USDA/OFF/**SMAE mexicana**) — el foso real — va en Beta; NO bloquea el cobro.
4. **Plataforma: PWA móvil** (la cámara es el 90% del uso), gratis, sin comisión de tiendas.
5. **Cobro: web/Stripe** (no tiendas) → margen ~69-90% vs ~57% con comisión de tienda.

## Diferenciador a defender
**"Cal AI en español para la comida que sí comemos"**: comida mexicana/latina + español + precio en MXN. Se construye de verdad con la tabla nutricional mexicana (SMAE) del grounding.

## Economía
~**$0.003-0.005 USD/foto** (gpt-4o-mini; ojo: el mini NO es tan barato en visión por el multiplicador de tokens de imagen). Freemium rentable (>90% margen en usuario promedio) **si se hace cumplir el límite gratis** (requiere el contador). Precio: **Gratis 10 análisis/mes** · **Premium $99 MXN/mes** ($799/año) o **$4.99 USD**.

## Roadmap priorizado

### 🔴 SPRINT 1 — MVP monetizable (habilitar cobro + tapar la fuga)
Orden recomendado:
1. **Supabase Auth** (login) — desbloquea todo.
2. **DB → Supabase Postgres + fotos → Supabase Storage** (desbloquea Vercel).
3. **`user_id` en `meals`/`settings` + filtrar TODAS las queries** (multiusuario + privacidad).
4. **Contador de uso + rate-limit en `/api/analyze`** (mata el riesgo #1 y habilita el límite gratis).
5. **Stripe web** (checkout + webhook).

Tracks en paralelo (no dependen de la infra):
- **UX:** auto-analizar al capturar (`<15s`) + skeleton · toasts + reintento · accesibilidad base (focus-visible, contraste, targets ≥44px).
- **IA quick-wins:** `temperature:0.2` · validar coherencia energética (kcal ≈ 4/4/9) · presets de porción · rango min-max.

### 🟠 SPRINT 2 — Beta (foso + retención)
Grounding USDA + Open Food Facts + **tabla mexicana SMAE** · registro por **texto/voz** · **"Mis platillos"** (memoria, 0 costo API) · onboarding de meta · barcode · instrumentar métricas.

### 🟡 Premium / Growth
Coach conversacional Pro · upsell gpt-4o "precisión" · macros/ayuno/peso · PWA instalable · referidos · SEO en español · B2B (nutriólogos/gimnasios).

## Métricas día 1
Retención **D7 (>25%)** · conversión **free→premium (3-5%)** · **costo de IA por usuario** (<$0.10 free / <$0.50 premium).

## Salud del proyecto (1-10)
Arquitectura **6** · Código **7** · UX **5** · UI **5** · IA **5** (sin grounding) · Monetización **2** · Escalabilidad **3** · Seguridad **3** · Documentación **6** · Pruebas **1**.

## Próximo paso
Arrancar **Sprint 1** en orden 1→5, empezando por **auth + rate-limit** (tapa el riesgo #1). Requiere confirmar: (a) proyecto Supabase a usar, (b) cuenta Stripe, (c) presupuesto para infra/API.
