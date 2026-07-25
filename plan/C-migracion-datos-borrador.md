# Pasos 4-6 (Ruta A) — Borrador de migración de datos a Postgres

**De:** Torvalds (CTO) · **Para:** Lugia (Director)
**Estado:** BORRADOR de diseño. **No ejecutado, no cableado.** A la espera de: (1) validación en vivo del bloque de seguridad, (2) tu GO explícito.
**Acompaña a:** `supabase/schema-meals-settings.draft.sql` (⛔ no correr aún).
**Regla que respeto:** no apilar la migración de datos sobre un bloque de seguridad no probado en vivo.

---

## Precondición para arrancar (checklist de la validación en vivo)

Solo tras que esto pase limpio con el setup real de Emiliano:
1. Registro + login reales (email+password, confirm-email OFF).
2. Un análisis real **descuenta** la cuota (badge baja de 10 → 9).
3. El **11º** análisis del mes devuelve **429** con mensaje de reset + alternativa manual.
4. **RLS con 2 usuarios:** el usuario B **no** ve la cuota ni (a futuro) los datos del usuario A.

---

## Esquema propuesto (resumen; detalle en el .draft.sql)

- **`meals`**: espejo del SQLite actual + `user_id uuid`. Cambios de tipo: `date`→tipo `date`, `ingredients`→`jsonb` (el cliente deja de hacer `JSON.parse`), `created_at`→`timestamptz`. Índice **`(user_id, date)`** que cubre las 2 consultas reales (día y semana). RLS: CRUD completo **scoped a filas propias**.
- **`user_settings`** (`user_id, key, value`, PK compuesta): preferencias por usuario (hoy `calorie_goal`). **Tabla separada de `profiles` a propósito**: `profiles` sigue siendo solo-lectura para el usuario (blinda `profiles.plan`, H6b); si metiéramos `calorie_goal` en `profiles` tendríamos que permitir UPDATE y se reabriría el auto-upgrade de plan. RLS: CRUD propio.

> Diferencia clave con `usage_counters`: ese es un contador de **seguridad** (solo-SELECT, mutado únicamente por la función DEFINER). `meals`/`user_settings` son **datos del usuario** → CRUD completo pero siempre `user_id = auth.uid()`.

---

## Mapa de rutas a migrar (qué cambia en cada archivo)

Patrón común en TODAS: `getUser()` al inicio → **401** si no hay sesión; queries vía `@supabase/supabase-js` (PostgREST, H14), nunca conexión directa; filtrar/insertar por `user.id` (la RLS es el segundo cinturón).

| Archivo | Hoy (SQLite) | Después (Postgres + user_id) |
|---|---|---|
| `lib/db.js` | `getDb`, `getSetting`, `setSetting`, `getUploadsDir` | Se retiran `getDb`/`getSetting`/`setSetting` (las queries pasan a las rutas o a un `lib/data.js` que reciba `(supabase, userId)`). **`getUploadsDir` se queda** (las fotos siguen en disco hasta el Paso D). Quitar `import better-sqlite3`. |
| `app/api/meals/route.js` GET | `SELECT * FROM meals WHERE date=?` + `JSON.parse(ingredients)` + totales en JS | `getUser` → `supabase.from('meals').select('*').eq('user_id',user.id).eq('date',date).order('time').order('id')`. `ingredients` ya es array (sin `JSON.parse`). Totales en JS (igual). |
| `app/api/meals/route.js` POST | `INSERT INTO meals(...)` sin dueño | `getUser` → `insert({ user_id: user.id, ...campos })`. Mismas validaciones. `ingredients` como array (sin `JSON.stringify`). |
| `app/api/meals/[id]/route.js` DELETE | `DELETE FROM meals WHERE id=?` | `getUser` → `.delete().eq('id',id).eq('user_id',user.id)` (RLS refuerza). |
| `app/api/settings/route.js` GET/PUT | `getSetting/setSetting` global | `getUser` → `user_settings` por `user.id` (GET: select; PUT: upsert `onConflict user_id,key`). Misma validación (500–10000). |
| `app/api/summary/route.js` GET | `SUM(calories) GROUP BY date` | `getUser` → traer filas del rango (`user_id` + `date between`) y sumar en JS (opción A del draft). RPC opcional a futuro. |
| `next.config.mjs` | `serverExternalPackages: ['better-sqlite3']` | Quitar esa entrada al eliminar el paquete. |
| `package.json` | `better-sqlite3` | Quitar la dependencia. |
| `app/page.js` | estado "sin comidas" | Ya contempla lista vacía; verificar copy "aún no registras comidas" (H18: empezar limpio, no sorprender). |

**Sin script de migración de datos** (H18). La app arranca limpia en Postgres.

---

## Orden de ejecución (cuando haya GO)

- **Paso 4** — Correr `schema-meals-settings.draft.sql`. Migrar `settings` → `user_settings` (ruta settings). *Test: guardar/leer meta por usuario; usuario B tiene su propia meta.*
- **Paso 5** — Migrar `meals` (rutas meals, meals/[id], summary). Quitar `better-sqlite3` y limpiar `next.config.mjs`/`package.json`. *Test: foto→análisis→guardar→resumen intacto, por usuario; RLS: B no ve meals de A.*
- **Paso 6** — Env vars en Vercel + deploy.
- **Paso D (siguiente):** fotos a **Supabase Storage** (H16/R5) — último bloqueante real de deploy en serverless.

---

## Riesgos específicos de esta fase

| Riesgo | Mitigación |
|---|---|
| Olvidar `getUser` en una ruta → queda abierta | Checklist: las 4 rutas de datos llevan gate 401; la RLS es el segundo cinturón aunque el gate falle. |
| Una tabla sin RLS habilitada + PostgREST = abierta | El draft hace `enable row level security` en ambas tablas; verificar en el dashboard tras correrlo. |
| Cambio `ingredients` string→jsonb rompe el cliente | El cliente **deja** de hacer `JSON.parse`/`JSON.stringify`; revisar `components/MealList.js` y `AddMealModal.js` por si asumen string. |
| Fotos siguen en disco (no serverless) | Fuera de esta fase; Paso D con Storage. |

---

## Lo que NO hago hasta tu GO
- No ejecuto `schema-meals-settings.draft.sql`.
- No toco `lib/db.js` ni las rutas de datos.
- No quito `better-sqlite3`.
Todo queda como diseño para tu revisión.
