# Paso C — Diseño v2: Auth + Contador + Rate-limit (base del freemium)

**De:** Torvalds (CTO) · **Para:** Lugia (Director) → Emiliano
**Estado:** v2 tras la auditoría **Nielsen QA** (`plan/C-qa-hallazgos.md`, 19 hallazgos). La v1 **no cerraba el Riesgo #1**; esta v2 incorpora los fixes NO NEGOCIABLES.
**Decisiones aprobadas por el Director:** Ruta A secuenciada · email+password con confirm-email OFF (MVP) · anon key + RLS (sin service_role en runtime).
**Entregable acompañante:** `supabase/schema.sql` (tablas, RLS exactas y funciones `consumir_analisis` / `reembolsar_analisis`). 🔶 = pido tu visto bueno.

---

## 0) Qué cambió vs v1 (resumen para Emiliano)

El límite de 10/mes en v1 era **cosmético**: se podía vaciar el crédito de Anthropic por tres agujeros. v2 los tapa:
1. **El reembolso ya no regala llamadas facturadas** (H1). Se cobra toda llamada que Anthropic facture (incluida "no es comida").
2. **El usuario ya no puede resetear su propio contador ni auto-subirse de plan** (H6). La RLS solo permite LEER; la única mutación viene de una función blindada del servidor.
3. **El límite solo aplica a la IA; el registro manual de comida es gratis e ilimitado** (H19). Así la app sigue siendo un tracker usable aunque se acabe la cuota.

---

## 1) Método de auth — **Email + Password** (confirm-email OFF en MVP) — *aprobado*

Sin cambios respecto a v1. Es lo más simple y testeable en localhost; OAuth Google queda como mejora aditiva futura. La QA marcó riesgos asociados que **no bloquean el MVP local pero SÍ el lanzamiento público** (los listo en §6): farmeo de cuentas con emails falsos (H3), recuperación de contraseña inservible con SMTP gratis (H11/H15), y muro de login que mata activación (H10). Mitigación de esos = captcha + SMTP real + modo demo, agendados para el pre-lanzamiento, no para C.

---

## 2) Secuenciación — **Ruta A secuenciada** — *aprobado*

Migrar todo a Postgres dentro de C, en pasos chicos, con el arreglo de seguridad primero. **Ajuste por QA (H18): NO migramos la data de SQLite** — es solo de prueba. **Empezamos limpio en Postgres**; la UI no debe sorprender con historial vacío (mensaje "aún no registras comidas"). Esto elimina el riesgo de "mi historial desapareció".

---

## 3) Protección de `/api/analyze` server-side (reescrito con los fixes)

**Flujo del route handler (orden exacto):**

1. **Auth (H8):** `supabase.auth.getUser()` — valida la firma del JWT contra Supabase (NO `getSession()`, que confía en la cookie tal cual). Sin usuario verificado → **401**.
2. **request_id:** la ruta genera `const requestId = crypto.randomUUID()` (token de idempotencia para reserva/reembolso).
3. **Reserva atómica (H4/H6/H7):** `supabase.rpc('consumir_analisis', { p_request_id: requestId })`. La función:
   - deriva el usuario de `auth.uid()` **interno** (no por parámetro),
   - resuelve el límite **adentro** leyendo `profiles.plan` + `app_config` (ignora cualquier límite que mande el cliente),
   - hace chequeo+incremento por-usuario **y** global (airbag) en sentencias atómicas,
   - devuelve `{ allowed, remaining, period, reason }`.
   Si `allowed = false` → **429** con mensaje según `reason` (límite de usuario, tope global o kill-switch) **+ fecha de reset** ("se reinicia el 1 de {próximo mes}") **+ alternativa: registro manual gratis** (H12/H19).
4. **Llamar a Claude** (`analyzeFoodImage`). Aplica a la ruta inicial **y** a la de corrección `feedback`/`previous` — **toda** llamada a Claude pasó por la reserva del paso 3 (H2), porque la reserva es incondicional al inicio del POST.
5. **Reembolso condicionado por señal `billed` (H1) — el fix central:**
   - `lib/analyze.js` devuelve `billed: true` cuando Anthropic respondió (200), **incluido `es_comida=false`** (fue facturado: se enviaron tokens de imagen).
   - Solo se reembolsa (`supabase.rpc('reembolsar_analisis', { p_request_id: requestId })`) cuando **NO hubo cobro real**: `NO_API_KEY`, 401 (key inválida), error de red/timeout **previo** a la request, 5xx o 429 de Anthropic. Estos errores llevan `err.billed = false`.
   - `es_comida=false` → la ruta responde 422 pero **NO reembolsa** (se cobra).
   - Caso borde: un 200 con respuesta malformada (sin `tool_use`) **sí se facturó** → ese error lleva `err.billed = true` → **no** se reembolsa.
   - El reembolso es atómico `GREATEST(count-1,0)`, scoped al **mismo periodo** de la reserva (guardado en el ledger `usage_events`) e idempotente por `request_id` (H9): sin underflow ni decremento del periodo equivocado al cruzar fin de mes.

**Cliente PostgREST (H14):** todas las queries y RPC van por `@supabase/supabase-js` (PostgREST + pooler), **nunca** conexiones directas de Postgres → evita `too many connections` en serverless.

**Reset mensual sin cron:** contador llaveado por periodo `YYYY-MM` en zona **America/Mexico_City** (timezone fija para evitar la ambigüedad que marcó H13). Al cambiar de mes, la llave cambia y arranca en 0 solo.

🔶 **VB-3 (v2):** ¿Confirmas la política de facturación de H1 (cobrar todo lo que Anthropic facture, incl. `es_comida=false`; reembolsar solo fallos pre-facturación con señal `billed`)?

---

## 3-bis) Airbag global + kill-switch (H4) y config server-side

- `global_usage` = una fila por mes con el total agregado de TODA la base. La función bloquea al superar `app_config.global_monthly_cap`. Es la red cuando algo se escapa (bug o abuso).
- `kill_switch` en `app_config`: `update ... set kill_switch = true;` apaga TODA la IA al instante, **sin redeploy**. Obligatorio antes de exponer la URL pública.
- **`app_config` es la fuente de verdad de la aplicación de límites** (tabla bloqueada por RLS, solo la lee la función DEFINER). Esto es lo que hace imposible falsificar el límite desde el cliente (H6c).

🔶 **VB-CONFIG (reinterpretación de H4/H19 que necesito validar):** el número de límite **debe** vivir server-side y no en un valor que el cliente pueda pasar. Por eso el valor **efectivo de aplicación** vive en `app_config` (DB), que es un **parámetro** (no hardcode). La env `FREE_ANALYSIS_LIMIT` la usa la ruta **solo para mostrar** "te quedan N" en la UI y como valor de referencia para sembrar `app_config`. Recomiendo mantener ambos en sync (o incluso operar solo desde `app_config`, que además permite cambiar el kill-switch sin redeploy). ¿Lo apruebas así?

---

## 4) Testeable en localhost

Igual que v1 (Supabase hosted, funciona desde `localhost:7350`):
1. Pegar `supabase/schema.sql` en el SQL Editor y correrlo.
2. Authentication → Providers → Email → **Confirm email OFF**.
3. Crear usuario de prueba en `/login` o en el dashboard (Add user).
4. `npm run dev` → login → cookies de sesión (middleware con `@supabase/ssr`).
5. Probar rate-limit: bajar `app_config.free_limit` a 2, hacer 3 análisis → el 3º devuelve 429. Probar registro manual: sigue funcionando aunque el límite IA esté agotado. Probar reembolso: forzar un fallo pre-facturación (borrar `ANTHROPIC_API_KEY`) → el contador no sube.

---

## 5) Variables de entorno — checklist EXACTO

```
# --- Claude (Anthropic) --- (ya existe)
ANTHROPIC_API_KEY=sk-ant-...
#ANTHROPIC_MODEL=claude-haiku-4-5

# --- Supabase --- (Dashboard → Project Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...   # "anon / public" key

# --- Freemium ---
# Valor de límite free para MOSTRAR en la UI y sembrar app_config.
# La APLICACIÓN real del límite vive en la tabla app_config (server-side, ver VB-CONFIG).
FREE_ANALYSIS_LIMIT=10
```
- `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: **obligatorias**. La anon key es segura de exponer porque la protección real es RLS.
- **NO se usa `SUPABASE_SERVICE_ROLE_KEY`** en runtime — *aprobado (VB-4)*.

---

## 6) Archivos a crear / modificar

**Crear:**
- `supabase/schema.sql` — ✅ **ya entregado** (tablas, RLS, funciones DEFINER).
- `lib/supabase/client.js` — cliente navegador (`createBrowserClient`).
- `lib/supabase/server.js` — cliente servidor con cookies (`createServerClient`).
- `middleware.js` — refresca sesión y protege rutas (redirige a `/login`).
- `app/login/page.js` — formulario login/registro email+password + logout.
- `lib/usage.js` — helpers `consumir_analisis` / `reembolsar_analisis` vía `supabase.rpc`.

**Modificar:**
- `lib/analyze.js` — **devolver `billed: true/false`** (éxito y `es_comida=false` → billed; errores pre-facturación → `err.billed=false`; 200 malformado → `err.billed=true`). *(único cambio a este archivo; la migración de IA de B queda intacta.)*
- `app/api/analyze/route.js` — `getUser()` (401) + `request_id` + `consumir_analisis` (429) + reembolso condicionado por `billed`.
- `app/page.js` — redirigir a `/login`; mostrar créditos restantes; botón salir; estado "sin comidas aún".
- `components/AddMealModal.js` — mostrar el costo (1 análisis) antes de gastar y en el reanálisis (H2/H12); ofrecer "guardar manual" (sin IA).
- `package.json` — agregar `@supabase/ssr` y `@supabase/supabase-js`.
- `.env.local.example` — agregar las vars de Supabase + `FREE_ANALYSIS_LIMIT`.
- **(tras checkpoint VB-5)** `lib/db.js`, `app/api/meals/route.js`, `app/api/meals/[id]/route.js`, `app/api/settings/route.js`, `app/api/summary/route.js` — pasar a Supabase con `user_id` (vía supabase-js, H14); quitar `better-sqlite3`. **Sin migrar data (H18).**

---

## 7) Orden de implementación (pasos pequeños, cada uno testeable)

**Bloque de seguridad (cierra el Riesgo #1):**
- **Paso 0** — Deps + env + `lib/supabase/*` + correr `supabase/schema.sql`. *(schema ya listo; a la espera de tu revisión.)*
- **Paso 1** — `/login` + `middleware.js` + logout; gate en `app/page.js`.
- **Paso 2** — Auth-gate en `/api/analyze` con `getUser()` (401).
- **Paso 3** — `lib/analyze.js` devuelve `billed`; `/api/analyze` reserva + 429 + reembolso condicionado; UI muestra restantes, costo y opción manual. *(Aquí quedan cerrados H1, H2, H4, H6, H7, H8, H9, H19.)*

🔶 **VB-5 (CHECKPOINT):** Riesgo #1 cerrado. ¿Seguimos a la migración de datos (Pasos 4-6) o cortamos C aquí?

**Bloque deploy-ready (Ruta A):**
- **Paso 4** — Migrar `settings` a Postgres (por usuario).
- **Paso 5** — Migrar `meals` a Postgres (`user_id`, índice `(user_id, date)`); actualizar rutas; quitar `better-sqlite3`. **Empezar limpio, sin migrar SQLite (H18).**
- **Paso 6** — Env vars en Vercel + deploy.

---

## 8) Riesgos y su estado en v2

| # | Hallazgo | Estado en v2 |
|---|---|---|
| H1 | Reembolso regala llamadas facturadas | **Cerrado** — señal `billed`; `es_comida=false` se cobra |
| H2 | Reanálisis multiplica llamadas | **Cerrado** — reserva incondicional cubre corrección; UI muestra costo |
| H6 | Cliente reescribe su contador / auto-upgrade | **Cerrado** — RLS solo-SELECT; mutación solo por función DEFINER |
| H7 | DEFINER: search_path / identidad / atomicidad | **Cerrado** — `search_path=''`, `auth.uid()` interno, upsert atómico |
| H8 | Validar JWT | **Cerrado** — `getUser()` |
| H9 | Race/underflow en reembolso | **Cerrado** — `GREATEST(count-1,0)`, ledger por periodo, idempotente |
| H4/H17 | Sin tope global / kill-switch | **Cerrado** — `global_usage` + `global_monthly_cap` + `kill_switch` |
| H14 | Pool de conexiones | **Cerrado** — supabase-js/PostgREST (sin conexión directa) |
| H18 | Pérdida de datos en migración | **Cerrado** — no se migra SQLite; empezar limpio |
| H19 | 10/mes inusable como tracker | **Cerrado** — límite solo a IA; registro manual gratis e ilimitado |
| H3 | Farmeo de cuentas (confirm-email OFF) | **Diferido a pre-lanzamiento** — captcha + airbag H4 ya cubre el gasto |
| H10 | Muro de login mata activación | **Diferido** — modo demo / anonymous sign-in |
| H11/H15 | Reset de contraseña + SMTP gratis | **Diferido** — SMTP real (Resend/SendGrid) |
| H5 | Sin downscale, costo máximo por análisis | **Nota**: ya hay `downscaleImage` en cliente; validar server-side en Paso D |
| **H16/R5** | **Fotos en disco no corren en serverless** | **Fuera de C** — Supabase Storage = **Paso D** (último bloqueante de deploy real) |

> **"Deploy-ready" honesto:** con C v2 + Ruta A, la app queda lista en **datos + seguridad + costo**. El **último bloqueante** para Vercel siguen siendo las **fotos** (H16/R5) → **Paso D: Supabase Storage**.

---

## 8-bis) Deuda técnica / escala (NO construir ahora — anotado a propósito)

Dos puntos a resolver **antes de escalar** (funcionan perfecto en MVP; no bloquean C):
- **Retención/limpieza de `usage_events`:** crece 1 fila por análisis y nunca se purga. A gran escala hay que agregar un job de limpieza (borrar filas de periodos ya cerrados, p.ej. > 60 días) o particionar por periodo. Hoy es intrascendente.
- **Contención de la fila única `global_usage`:** el airbag incrementa **una sola fila** por mes; bajo altísima concurrencia esa fila se vuelve un punto de contención (lock por fila serializa los análisis). Mitigación futura: contador "sharded" (N filas por periodo que se suman) o mover el airbag a un contador aproximado. Para el volumen actual y del MVP no es problema.

## 9) Puntos que necesitan tu VB
- **VB-3 (v2):** política de facturación H1 (cobrar lo facturado, reembolsar solo pre-facturación por señal `billed`).
- **VB-CONFIG:** límite efectivo en `app_config` (server-side) + `FREE_ANALYSIS_LIMIT` env solo para UI/seed.
- **VB-5:** checkpoint tras cerrar el Riesgo #1 (seguir a migración o cortar C).
- **VB-6:** fotos/Storage como Paso D (recomendado) o dentro de C.
- **Revisión del `supabase/schema.sql`** antes de que toque app code (como pediste).
