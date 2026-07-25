# D.3 — Guía de despliegue a Vercel (BETA PRIVADA)

**Para:** Emiliano · **De:** Torvalds (CTO) · revisa: Lugia (Director)
**Qué es esto:** guía paso a paso para principiante. **La ejecuta Emiliano con sus propias cuentas.** El CTO NO despliega.
**Precondición:** ya corriste en Supabase los 3 SQL (`schema.sql`, `schema-meals-settings.sql`, `storage.sql`), validaste login + análisis + fotos en vivo, y confirmaste *Confirm email* OFF.

> **Antes de empezar** ten a la mano 3 valores (Supabase Dashboard → Project Settings → API, y tu consola de Anthropic):
> - `ANTHROPIC_API_KEY` (empieza con `sk-ant-`)
> - `NEXT_PUBLIC_SUPABASE_URL` (`https://xxxx.supabase.co`)
> - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (la clave **anon / public**, empieza con `eyJ...`)

---

## 1) PRE-PUSH — que NO se filtre ningún secreto

✅ **Ya verificado por el CTO en este repo:**
- `git` **NO** rastrea `.env.local` (solo `.env.local.example`, que tiene únicamente *placeholders* como `sk-ant-...`).
- `.gitignore` incluye `.env.local` y `.env`.
- La **historia del repo ya está limpia** (el Director saneó una fuga previa).

**Confirmación rápida (opcional, copia y pega en la terminal, en la carpeta del proyecto):**
```bash
# No debe listar .env.local (solo .env.local.example). Si aparece .env.local, DETENTE.
git ls-files | grep -i env

# Ver que .env.local está ignorado (debe imprimir: .gitignore:4:.env.local)
git check-ignore -v .env.local
```
Si `.env.local` apareciera rastreado (no debería): `git rm --cached .env.local` y commitea; nunca lo subas.

**Push a GitHub** (rama `main`, remoto `origin` = `github.com/emilianohsierra/calories-tracker`):
```bash
git status                 # revisa qué vas a subir; NO debe haber .env.local
git add -A
git commit -m "Auth + rate-limit + datos y fotos en Supabase (beta privada)"
git push origin main
```
> La historia ya está limpia, así que un `push` normal basta (no se necesita force-push ni reescritura).

---

## 2) VERCEL — crear cuenta e importar el repo

1. Entra a **vercel.com** → **Sign Up** → **Continue with GitHub** (usa la misma cuenta de GitHub del repo). Plan **Hobby (gratis)**.
2. Autoriza a Vercel a leer tus repos (puedes limitarlo solo a `calories-tracker`).
3. **Add New… → Project** → busca **calories-tracker** → **Import**.
4. Vercel detecta **Next.js** automáticamente. **No cambies** Build Command ni Output Directory (los deja bien solos).
5. **Antes de dar Deploy**, abre la sección **Environment Variables** (paso 3). Es más fácil ponerlas ahora.

---

## 3) ENV VARS en Vercel (exactas)

En **Environment Variables** (al importar, o luego en **Project → Settings → Environment Variables**) agrega **exactamente** estas, marcando los 3 entornos (Production, Preview, Development):

| Name | Value | Nota |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (tu clave real) | Secreta. Solo servidor. |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Pública (el prefijo `NEXT_PUBLIC_` la expone al navegador; es seguro). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` (anon / public) | Pública. La protección real es la RLS. |
| `FREE_ANALYSIS_LIMIT` | `10` | **Opcional** (solo para el texto "N restantes" en la UI). El límite REAL vive en `app_config` de Supabase. |

> ⛔ **NUNCA subas la `service_role` key a Vercel** (ni a ningún lado). La app no la usa; con ella se salta la RLS. Solo se usan las 3 de arriba.
>
> ✍️ Los nombres deben ser **idénticos** (mayúsculas incluidas). Un typo = la app no encuentra la variable.

---

## 4) DEPLOY + smoke check

1. Da **Deploy**. Espera 1–3 min. Vercel hace un build **limpio desde cero** (no arrastra el caché local de `.next`).
2. Al terminar, copia la URL pública (algo como `https://calories-tracker-xxxx.vercel.app`).
3. **Smoke check** (haz esto tú, en el navegador):
   - Abrir la URL raíz → debe **redirigir a `/login`**.
   - **Registrarte** con un correo y contraseña → entra a la app.
   - **Cerrar sesión** (botón "Salir") → vuelve a `/login`. **Iniciar sesión** de nuevo → entra.
   - Tomar/subir **una foto real** → "Analizar con IA" → aparecen calorías y macros → **Guardar** → la comida aparece en la lista **con su miniatura** (viene de Storage por URL firmada).
   - El badge **"🤖 N análisis restantes"** debe **bajar en 1** tras el análisis.
   - Cambiar la **meta de calorías** y recargar → se conserva.
4. Si algo falla, lo más común es un **typo en una env var** o **no haber corrido los 3 SQL** en Supabase. Revisa **Vercel → Deployments → (tu deploy) → Logs** para ver el error.

> Cada `git push origin main` vuelve a desplegar automáticamente. No necesitas re-hacer nada manual.

---

## 5) NOTA — esto es BETA PRIVADA

- **No promociones la URL.** Compártela solo con las personas de prueba que elijas.
- **El airbag te protege:** el tope global (`app_config.global_monthly_cap = 5000`, ~US$20/mes) frena el gasto aunque algo se escape. Kill-switch disponible: `update public.app_config set kill_switch = true;` apaga la IA al instante, sin redeploy.
- **4 bloqueantes conocidos → Sprint de Lanzamiento (NO en la beta):** pago/freemium real (P19), recuperación de contraseña (P2), anti-abuso/captcha en signup (P1/P16), y afinar el manejo de `es_comida` (P8). Se resuelven **antes de abrir al público**. En beta privada, sin promoción y con el airbag, el riesgo es bajo.

---

## 6) Riesgo Supabase / Auth (para saber, casi nada que hacer)

- **¿Vercel llega a Supabase?** Sí. El proyecto Supabase es *hosted* y expone una **API HTTPS pública**; las funciones serverless de Vercel la consumen sin problema. No hay que abrir puertos ni whitelistear IPs.
- **Redirect URLs de Supabase Auth:** para **email + password directo (lo que usa la beta) NO se necesita** configurar redirect URLs. **Anótalo para el futuro:** cuando agreguemos flujos por correo (recuperación de contraseña, magic link, OAuth Google — Sprint de Lanzamiento), habrá que ir a **Supabase → Authentication → URL Configuration** y agregar el dominio de Vercel (`https://<tu-app>.vercel.app`) en **Site URL** y **Redirect URLs**. Hoy no aplica.
- **CORS:** no requiere config; `@supabase/ssr` habla con Supabase desde el servidor de Vercel, no desde el navegador directamente para las operaciones sensibles.

---

## Checklist final (marca antes de considerar D.3 hecho)
- [ ] `git ls-files | grep env` → solo `.env.local.example`
- [ ] Los 3 SQL corridos en Supabase; *Confirm email* OFF
- [ ] `git push origin main` exitoso
- [ ] Repo importado en Vercel (Next.js autodetectado)
- [ ] 3 env vars (+ opcional `FREE_ANALYSIS_LIMIT`) puestas; **sin service_role**
- [ ] Deploy verde; URL pública abre y redirige a `/login`
- [ ] Registro + login + análisis (cuota baja) + foto visible + borrar OK
- [ ] URL **no** promocionada (beta privada)

> **El CTO no ejecuta este deploy.** Cualquier duda o error en un paso, me pasas el mensaje de Vercel → Deployments → Logs y lo diagnostico.
