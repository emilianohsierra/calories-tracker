# Auditoría pre-lanzamiento (QA adversarial) — calories-tracker

**De:** Nielsen QA (`beskkoig`) · rol: QA + Usuario Extremo
**Para:** Director Lugia (`mwao6a57`) → Emiliano / Torvalds
**Contexto:** despliegue PÚBLICO a Vercel. Revisado el código real: `app/api/*`,
`lib/*`, `middleware.js`, `supabase/schema.sql`, `supabase/schema-meals-settings.sql`,
`supabase/storage.sql`, `app/login/page.js`, `app/page.js`.
**Formato:** por hallazgo → **severidad** + etiqueta **[BLOQUEANTE]** (arreglar antes del
deploy público) o **[BACKLOG]** (post-lanzamiento).

---

## Estado: lo que YA está bien resuelto (no hay que tocar)

Verificado en el código, los críticos de la auditoría anterior están **correctamente cerrados**:
- **H1** (reembolso): `lib/analyze.js` marca `billed:true` en todo 200 (incluido
  `es_comida=false` y el 200-malformado); la ruta solo reembolsa cuando `billed!==true`. ✔
- **H6/H6a/H6b/H6c** (RLS): el usuario solo tiene `SELECT` propio; `usage_counters`,
  `profiles.plan`, `app_config`, `global_usage`, `usage_events` sin políticas de mutación +
  `revoke`. El límite se lee server-side de `app_config`, ignorando al cliente. ✔
- **H7** (DEFINER): `set search_path=''`, `auth.uid()` interno, chequeo+incremento atómico
  en una sola sentencia `on conflict … where count < v_limit`. ✔
- **H8** (`getUser()` no `getSession()`): en middleware y en todos los handlers. ✔
- **H9** (reembolso): `greatest(count-1,0)`, scoped al periodo del ledger `usage_events`,
  idempotente por `request_id`, con `for update`. ✔
- **H4** (airbag): `global_usage` + `global_monthly_cap` + `kill_switch`. ✔
- **H13/H19** (timezone + freemium): periodo `America/Mexico_City` consistente en SQL y JS;
  registro manual gratis e ilimitado. ✔

**Veredicto:** la base de seguridad/costo del núcleo está sólida. Los hallazgos de abajo son
lo que queda para exponerlo al mundo — hay **3 bloqueantes de negocio/UX** y varios de escala.

---

## 1) Qué puede salir mal cuando la URL sea pública (técnico / seguridad / costo)

### 🟠 P1 — [BLOQUEANTE] Re-evaluación de H3: ya NO nos quiebra la cartera, pero se convierte en un DoS del producto.
**Confirmación:** el airbag SÍ contiene el costo. Con `global_monthly_cap=5000` × ~$0.004 =
**~$20 USD/mes** es el techo de gasto de Anthropic aunque farmeen cuentas. El riesgo de "vaciar
el crédito" queda **refutado**. PERO el airbag transforma un ataque-de-costo en un
**ataque-de-disponibilidad**:
- **Reproducir:** con confirm-email OFF, sin captcha y sin rate-limit de signup, un script hace
  `supabase.auth.signUp()` de ~500 cuentas basura y consume 10 análisis c/u = 5000 → se alcanza
  `global_cap` → **TODO usuario legítimo recibe 429 `global_cap`** y se queda sin IA hasta el
  reinicio de mes. Un atacante apaga tu feature estrella para todos por ~$20 de TU dinero.
- **Autoinfligido:** el mismo muro lo pega el éxito orgánico (ver P16): 5000 análisis = ~500
  usuarios activos → el día que peguen, la app "se rompe" para todos.
- **Mitigación (antes del deploy):** (a) captcha en signup (Cloudflare Turnstile, nativo en
  Supabase Auth) **o** rate-limit de signup por IP; (b) sub-límite diario por cuenta (que 1
  cuenta no pueda vaciar su mes en minutos); (c) alerta cuando `global_usage` llegue al 80%;
  (d) right-size del cap (P16). Con esto, [BLOQUEANTE] baja a controlado.

### 🟡 P5 — [BACKLOG] El downscale es solo cliente → un cliente malicioso sube 8 MB directo.
`lib/image.js` reduce en el navegador (bien para usuarios honestos), pero un atacante hace
`POST /api/analyze` con la imagen full 8 MB: más tokens a Claude + objetos de 8 MB en Storage.
Acotado por el contador + el cap global, así que es costo marginal, no fuga.
- **Mitigación:** clamp/redimensión server-side (o rechazar > N px) antes de mandar a Claude.

### 🟡 P6 — [BACKLOG] Middleware "fail-open" si faltan las env vars.
`middleware.js:11` → si no hay `NEXT_PUBLIC_SUPABASE_*`, hace `NextResponse.next()` sin proteger.
Un deploy mal configurado en Vercel **desactiva silenciosamente el redirect a /login** (las
páginas quedan accesibles). Los handlers `/api` siguen a salvo (su `getUser()` da 401), así que
NO es fuga de datos, pero es un footgun de configuración.
- **Mitigación:** checklist de env vars en Vercel + fallar ruidoso (log/health-check) si faltan.

### ⚪ P7 — [BACKLOG] Squatting de correo (confirm-email OFF).
Cualquiera se registra con `victima@correo.com` sin probar posesión; luego el dueño real no
puede registrarse ("ya registrado"). Sin daño de datos (no se envía correo), pero molesto.
- **Mitigación:** verificación de email antes del lanzamiento amplio.

---

## 2) Dónde se confunde / se enoja un usuario (UX del flujo real)

### 🔴 P2 — [BLOQUEANTE] No hay recuperación de contraseña → bloqueo permanente de cuenta.
Confirmado: no existe flujo de reset (el brief lo reconoce). Un usuario real teclea mal su email
al registrarse o simplemente olvida la contraseña → **pierde la cuenta y TODO su historial para
siempre**, sin salida. Esto pasa el día 1 con usuarios reales, no es hipotético.
- **Reproducir:** registrarse, cerrar sesión, "olvidé mi contraseña" → no hay botón, no hay ruta.
- **Mitigación:** flujo "¿Olvidaste tu contraseña?" (`resetPasswordForEmail`) + un proveedor SMTP
  real (el SMTP gratis de Supabase, 2-3 correos/h, no sirve — ver P15/escala). Requiere reactivar
  verificación de email. **Sin esto no se lanza a público.**

### 🟠 P8 — [BLOQUEANTE-suave] `es_comida=false` cobra un análisis por comida REAL mal clasificada.
El fix de H1 es correcto en costo, pero abre un hoyo de UX: foto oscura / borrosa / platillo
inusual → Claude responde `es_comida=false` → la ruta devuelve 422 **y NO reembolsa** → el usuario
gastó 1 de sus 10 y recibió *"La imagen no parece contener comida"* sobre su propia cena. Percepción:
*"me robó un análisis por una foto de MI comida"*. Generador directo de 1-estrella y de tickets.
- **Reproducir:** subir una foto real pero difícil (poca luz) hasta que el modelo la rechace.
- **Mitigación:** no descontar los rechazos `es_comida=false` del contador visible, **o** dar 1-2
  reintentos "de gracia" por rechazo, **o** mensaje honesto: *"No la reconocí; esto no cuenta
  contra tu límite — reintenta con más luz o regístrala manual"* (y reembolsar ese caso concreto).
  Ojo: si reembolsas `es_comida=false`, reabres H1 → hazlo con tope (máx N gracias/mes/usuario).

### 🟡 P9 — [BACKLOG] Corregir a la IA gasta un crédito completo cada vez.
El fix de H2 cobra toda llamada, incluida la corrección `feedback/previous`. Correcto en costo,
pero castiga afinar: el usuario dice *"no, es pollo no res"* y le cuesta otro de sus 10. Corregir
3 veces = 3 créditos. Se siente injusto ("pago por arreglar TU error").
- **Mitigación:** avisar el costo antes de reanalizar, o 1ª corrección gratis, o que la corrección
  del mismo `request_id` no vuelva a contar.

### 🟡 P10 — [BACKLOG] Muro de login en el primer uso (sin demo).
`middleware.js` redirige a `/login` antes de mostrar valor. El visitante nuevo no prueba nada.
- **Mitigación:** 1-3 análisis anónimos (Supabase anonymous sign-in) o un preview antes del muro.

### ⚪ P11 — [BACKLOG] Contraseña mínima 6, sin confirmación de contraseña, sin medidor.
`app/login/page.js:71`. Débil pero aceptable en MVP; Supabase pone algún rate-limit de auth.

---

## 3) Errores que no estamos contemplando

### 🟠 P4 — [BACKLOG (costo/privacidad, sube a ALTO con volumen)] Fotos huérfanas de análisis descartados.
En `app/api/analyze/route.js:130` la foto se sube a Storage **antes** de que el usuario decida
guardar el platillo. Si analiza y **descarta** (no llama a `POST /api/meals`), la foto queda en el
bucket **para siempre**. `DELETE /api/meals/[id]` limpia las fotos de comidas guardadas, pero
**nadie limpia las huérfanas**. Con volumen: Storage crece sin tope (costo) y guardas fotos de
comida/gente que el usuario nunca quiso conservar (privacidad).
- **Reproducir:** analizar 10 fotos, no guardar ninguna → 10 objetos huérfanos en `{uid}/…`.
- **Mitigación:** subir la foto solo al guardar el meal, **o** job de limpieza de objetos sin fila
  `meals` que los referencie, **o** subir a carpeta temporal con expiración.

### 🟡 P12 — [BACKLOG] Reintento de POST en red móvil mala → doble cobro.
`request_id` se genera **por intento** dentro de la ruta (`crypto.randomUUID()`), no lo manda el
cliente. Si el móvil reintenta el POST tras timeout, cada intento trae un `request_id` nuevo → la
idempotencia del ledger no aplica → **se cobra 2 veces** el mismo análisis del usuario.
- **Mitigación:** que el cliente genere el `request_id` (idempotency key) y lo mande; reusarlo en
  reintentos.

### ⚪ P13 — [BACKLOG] Fallo al subir a Storage → meal se guarda sin foto, en silencio.
`analyze/route.js:135` traga el error y sigue sin imagen. El usuario luego ve el registro sin
foto sin saber por qué. Aceptable, pero conviene avisar.

---

## 4) Qué se rompe con 100.000 usuarios (escala real)

### 🟠 P15 — [BLOQUEANTE A ESCALA / BACKLOG a día 1] Fila caliente única en `global_usage`.
Cada análisis hace `UPDATE public.global_usage` sobre **la única fila del periodo** con lock de
fila (`schema.sql:199`). Con alta concurrencia, **todos los análisis se serializan** contra ese
lock → colapso de throughput y esperas. El airbag no escala en concurrencia de escritura.
- **Mitigación:** contador global **shardeado** (N filas por periodo, sumadas al leer) o agregación
  aproximada/periódica. No urge el día 1 (poco volumen), sí antes de crecer.

### 🟠 P16 — [BLOQUEANTE] `global_monthly_cap=5000` está mal dimensionado para escala.
5000 análisis/mes = ~500 usuarios activos agotando su cuota. Con tracción real se agota en horas y
**todos** ven "IA no disponible". A la vez, subirlo demasiado reabre el costo de P1.
- **Mitigación:** dimensionar el cap a tu presupuesto real de Anthropic + alerta al 80% + revisión
  antes de campañas de adquisición. Documentar el número objetivo, no dejar el default de dev.

### 🟡 P17 — [BACKLOG] Doble `getUser()` por request (middleware + handler).
El middleware corre `getUser()` en cada request (incluye `/api`) y el handler lo repite → **2
llamadas al Auth de Supabase por request** → límites de rate del Auth API + latencia extra a
escala.
- **Mitigación:** afinar el `matcher` para no correr el middleware en `/api`, o cachear la
  validación por request.

### 🟡 P18 — [BACKLOG] `usage_events` crece sin límite.
Una fila por análisis, para siempre (ledger de idempotencia). A 100k usuarios son millones de
filas/año sin limpieza.
- **Mitigación:** TTL/purga de eventos con > 60 días (ya no se reembolsan).

---

## 5) Reseñas de 1 estrella que recibiríamos (y su causa)

| Reseña textual probable | Causa (hallazgo) |
|---|---|
| *"Me cobró un análisis por una foto de MI comida y dijo que no era comida."* | **P8** |
| *"Olvidé mi contraseña y perdí mi cuenta y todo mi historial, no hay forma de recuperarla."* | **P2** |
| *"De la nada la IA dejó de funcionar y dice 'no disponible'."* | **P3 / P15 / P16** (cap global) |
| *"Corregir el análisis me gasta mis análisis del mes."* | **P9** |
| *"Solo 10 análisis al mes y no hay manera de pagar por más."* | **P1 / P19** |
| *"No puedo borrar mi cuenta ni mis fotos."* | **P4** (sin borrado de cuenta/privacidad) |

---

## 6) Qué haría NO convertir a Premium / cancelar

### 🔴 P19 — [BLOQUEANTE si el objetivo del lanzamiento es ingreso] No existe flujo de pago.
`profiles.plan` solo pasa a `'premium'` corriendo SQL a mano (`schema.sql:285`). **No hay pricing,
ni checkout, ni Stripe, ni botón "Hazme Premium".** Un usuario que agota sus 10 y QUIERE pagar…
**no puede**. La pregunta "¿qué evita convertir a Premium?" es, hoy, literalmente: *no hay forma de
convertir*. Si el propósito del deploy es monetizar, esto es el bloqueante #1.
- **Mitigación mínima:** al menos capturar intención ("Quiero Premium" → email/lista) para no
  perder al usuario caliente; idealmente checkout (Stripe) + set de `plan='premium'` server-side.

### 🟡 P20 — [BACKLOG] El 429 empuja al plan gratis, no al pago.
`limitMessage()` (bien hecho) ofrece *"regístralo manual, es gratis"* pero **no** ofrece
"hazte Premium". En el momento de máxima disposición a pagar (acaba de toparse con el límite), no
hay upsell. Conversión perdida.
- **Mitigación:** en el 429 `user_limit`, además del fallback manual, mostrar el valor de Premium
  y el CTA de pago.

### 🟡 P21 — [BACKLOG] No se comunica qué gana Premium ni cuánto falta para el límite.
`/api/usage` devuelve `remaining`, pero no hay un "te quedan 2 de 10" persistente ni una página de
beneficios. Sin ancla de valor, no hay motivo para pagar.

---

## Resumen ejecutivo — qué frena el deploy público

**BLOQUEANTES (arreglar antes de exponer la URL):**
1. **P2** — Recuperación de contraseña (usuarios reales se bloquean el día 1).
2. **P19** — Flujo de pago / captura de intención de Premium (si el objetivo es ingreso).
3. **P1 + P16** — Anti-abuso de signup (captcha/throttle) + right-size del `global_cap` + alerta:
   hoy un script (o el propio éxito) apaga la IA para todos por ~$20.
4. **P8** — Cobro por comida real mal clasificada (fix acotado; 1-estrella garantizada).

**BLOQUEANTE a escala (no día 1, sí antes de crecer):** P15 (fila caliente global).

**BACKLOG relevante:** P4 (fotos huérfanas/privacidad), P12 (doble cobro por reintento),
P9 (corrección cuesta crédito), P5/P6/P17/P18/P20/P21.

**Balance justo:** el núcleo de seguridad y costo está bien construido y el airbag hace su
trabajo (el crédito de Anthropic está protegido). Lo que falta para "internet" no es más
seguridad de datos — es **recuperación de cuenta, un camino a pagar, anti-abuso de registro y 3-4
detalles de UX/costo**. Con P1/P2/P8/P16 resueltos, el lanzamiento es defendible.
