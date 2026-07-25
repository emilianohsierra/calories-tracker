# Plan de Despliegue a Producción — CTO

Proyecto: calories-tracker (Next.js 15 + React 19 + better-sqlite3 + OpenAI).
Estado: diagnóstico. Sin cambios de código todavía.

---

## 1. Bloqueo confirmado: SQLite + archivos locales NO corren en Vercel

**Confirmado.** El código depende de disco local en dos puntos y ambos rompen en serverless:

- `lib/db.js:18` abre `Database(process.cwd()/data/app.db)` y usa `journal_mode = WAL`. El filesystem de Vercel es **efímero y de solo lectura** (excepto `/tmp`, que no persiste ni se comparte entre invocaciones). Cada cold start = base de datos vacía. `better-sqlite3` además es un binario nativo que hay que declarar como externo (ya está en `next.config.mjs:3`), pero eso no resuelve la persistencia.
- `app/api/analyze/route.js:87` escribe la foto con `fs.writeFile` en `data/uploads/`, y `app/api/uploads/[name]/route.js:16` la lee con `fs.readFile`. Cada foto subida se pierde en la siguiente invocación y otra instancia no la ve.

**Conclusión:** hoy la app solo funciona en un servidor persistente monoinstancia (VPS/contenedor). Para Vercel hay que externalizar DB **y** storage.

### Recomendación DB: **Turso (libSQL)**

| Criterio | Turso (libSQL) | Supabase (Postgres) |
|---|---|---|
| Migración desde SQLite | **Trivial**: libSQL es fork de SQLite, mismo SQL, mismo esquema | Requiere reescribir DDL/queries a Postgres (tipos, `AUTOINCREMENT`→`serial`, `datetime('now')`→`now()`) |
| Cliente | `@libsql/client` reemplaza `better-sqlite3` con cambios mínimos | `pg`/Prisma/supabase-js, refactor mayor |
| Free tier | Generoso (500 DBs, 9GB) | 500MB DB |
| Auth/Storage integrados | No | **Sí** (ver punto 2 y storage abajo) |

**Recomendación: Turso** para la DB. El esquema de `lib/db.js` (`meals`, `settings`) migra casi 1:1 y las queries de `app/api/meals/route.js` y `app/api/summary/route.js` apenas cambian (de API síncrona `.prepare().get()` a `await client.execute()`). Es la ruta de menor riesgo y menor esfuerzo dado que YA es SQLite.

> Matiz importante: para **Auth** recomendamos Supabase (punto 2). Es válido y común usar **Supabase Auth + Turso DB** juntos (Supabase solo emite el JWT; validamos `user_id` en nuestras queries a Turso). Si el equipo prefiere un solo proveedor para no fragmentar, la alternativa coherente es **todo Supabase** (Postgres + Auth + Storage), pagando el costo de reescribir el SQL. Mi recomendación primaria: **Turso DB + Supabase Auth + Supabase Storage**.

### Recomendación Storage de fotos: **Supabase Storage**

| Opción | A favor | En contra |
|---|---|---|
| **Supabase Storage** | Mismo proveedor que Auth; RLS por `user_id`; CDN incluido; SDK simple | Free tier 1GB |
| Vercel Blob | Integración nativa con Vercel, cero config | Más caro por GB; storage aparte del auth |
| Cloudflare R2 | Sin costo de egreso, barato a escala | Más setup (S3 API, no integra con auth) |

**Recomendación: Supabase Storage** en el arranque — se paga junto con Auth, permite políticas por usuario y reemplaza directo los dos puntos de `fs`. Migrar a **R2** más adelante cuando el volumen de fotos haga que el egreso importe (R2 no cobra egreso).

**Cambio concreto:** `app/api/analyze/route.js:85-88` deja de hacer `fs.writeFile` y sube el buffer al bucket; guarda la URL/path en la columna `image`. `app/api/uploads/[name]/route.js` se elimina o se vuelve un redirect a la URL firmada. Nota: hoy la foto se envía a OpenAI como base64 en memoria (`analyze.js:121`), así que el análisis **no depende** del disco — solo el guardado. Eso simplifica la migración.

---

## 2. Multiusuario / Auth — **Supabase Auth**

Hoy la app es **monousuario total**: no hay tabla de usuarios, ni sesión, ni `user_id`. `settings` es global (una sola meta calórica para todo el mundo) y cualquiera que llegue a la URL ve y edita los datos de todos.

**Recomendación: Supabase Auth** (el equipo ya lo domina, según el Director). Emite JWT; en Next.js se valida con middleware/`supabase-ssr` y se extrae `user_id` en cada route handler.

### Cambios de esquema
```sql
-- meals
ALTER TABLE meals ADD COLUMN user_id TEXT NOT NULL;
CREATE INDEX idx_meals_user_date ON meals(user_id, date);  -- reemplaza idx_meals_date

-- settings: hoy PK=key global. Debe ser por usuario:
-- nueva PK compuesta (user_id, key)
CREATE TABLE settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
```
- Toda query en `app/api/meals/route.js`, `app/api/meals/[id]/route.js`, `app/api/summary/route.js`, `app/api/settings/route.js` debe filtrar por `user_id = <sesión>`. Sin esto, el multiusuario es una fuga de datos.
- Storage: prefijo por usuario (`uploads/{user_id}/{uuid}.jpg`) + RLS.

---

## 3. Riesgos de seguridad actuales

| # | Riesgo | Ubicación | Severidad |
|---|---|---|---|
| 1 | **Sin autenticación**: toda la API es pública. Cualquiera lista/crea/borra comidas y dispara análisis de IA (= gasto real) | todas las rutas | **Crítica** (bloquea producción) |
| 2 | **Abuso de costo de IA**: `POST /api/analyze` no tiene rate-limit ni cuota. Un atacante quema tu saldo de OpenAI con requests masivos de imágenes de 8MB | `app/api/analyze/route.js` | **Alta** |
| 3 | `OPENAI_API_KEY` | Bien: se lee de env (`analyze.js:104`), nunca al cliente. En Vercel usar env vars del proyecto, no `.env.local` commiteado. **Verificar que `.env.local` esté en `.gitignore`** | `lib/analyze.js` | Media |
| 4 | **Validación de subida**: correcta pero superficial. Valida `file.type` (MIME declarado por el cliente, falsificable) y tamaño ≤8MB (`route.js:33-43`), pero **no valida magic bytes** ni redimensiona. Con auth el riesgo baja | `app/api/analyze/route.js:33-43` | Media |
| 5 | Límite de tamaño: 8MB por imagen está bien, pero base64 infla ~33% el payload a OpenAI (`analyze.js:121`) = más tokens/costo. Redimensionar antes de enviar (p.ej. máx 1024px) reduce costo | `lib/analyze.js:121` | Baja/Media |
| 6 | Path traversal: **mitigado** correctamente con `path.basename` en `analyze.js` (reuse) y `uploads/[name]`. OK | — | — |
| 7 | Inyección SQL: **mitigado**, todo usa prepared statements con `?`. OK | — | — |

**Prioridad de seguridad:** #1 y #2 son bloqueantes de lanzamiento (sin auth + sin rate limit = factura de OpenAI sin techo).

---

## 4. Esfuerzo estimado y orden recomendado

| # | Cambio | Esfuerzo | Depende de |
|---|---|---|---|
| 1 | **Migrar DB a Turso** (reemplazar `better-sqlite3` por `@libsql/client`, volver async las 4 rutas) | **M** | — |
| 2 | **Migrar storage a Supabase Storage** (subir buffer, guardar URL, quitar rutas `fs`) | **S/M** | — |
| 3 | **Supabase Auth** (login, middleware, sesión en route handlers) | **M** | — |
| 4 | **Esquema multiusuario** (`user_id` en meals/settings, índices, filtrar todas las queries) | **M** | 1, 3 |
| 5 | **Rate-limit / cuota en `/api/analyze`** (p.ej. Upstash Redis, N análisis/día por usuario) | **S** | 3 |
| 6 | Hardening de subida (magic bytes + resize a 1024px con sharp) | **S** | — |
| 7 | Freemium (contador de análisis, paywall, Stripe) | **L** | 3, 4, 5 |

### Orden recomendado
1. **Turso (DB)** — desbloquea Vercel, migración de menor riesgo por ser SQLite→libSQL.
2. **Supabase Storage** — desbloquea Vercel para las fotos.
3. **Supabase Auth** — habilita todo lo demás.
4. **Esquema multiusuario + filtrado por `user_id`** — convierte la app en producto real (sin esto no hay negocio ni privacidad).
5. **Rate-limit en `/api/analyze`** — protege la factura de OpenAI antes de exponer al público.
6. **Hardening de subida + resize** — seguridad y ahorro de costo de IA.
7. **Freemium/Stripe** — monetización, última capa.

**MVP desplegable en Vercel = pasos 1–5.** Pasos 6–7 son post-lanzamiento inmediato.
