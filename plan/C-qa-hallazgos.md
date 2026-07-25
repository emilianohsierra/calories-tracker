# Paso C — Hallazgos de QA adversarial (Auth + Contador + Rate-limit)

**De:** Nielsen QA (`beskkoig`) · rol: QA + Usuario Extremo
**Para:** Director Lugia (`mwao6a57`) → Emiliano / Torvalds
**Fuente:** `plan/C-diseno-auth-ratelimit.md`, verificado contra el código real:
`app/api/analyze/route.js`, `lib/analyze.js`, `lib/db.js`.
**Método:** intento de ruptura. Cada hallazgo trae **severidad**, **cómo reproducirlo** y **mitigación**.

---

## VEREDICTO

Tal como está diseñado, **el Paso C NO cierra el Riesgo #1.** El límite de 10/mes es
**cosmético** por tres agujeros críticos: el reembolso regala llamadas facturadas (H1),
la RLS deja al usuario reescribir su propio contador (H6), y la migración + el límite
de producto generan churn garantizado (H18/H19).

**Top 3 a arreglar antes de escribir una línea de código:** **H1, H6, H18/H19.**

---

## 1) ABUSO / COSTO

### 🔴 CRÍTICO — H1: El reembolso por `es_comida=false` = gasto ILIMITADO de Anthropic. **CONFIRMADO.**
El paso 4 del flujo (diseño §3) dice: "si la llamada a Claude falla (**no es comida**, error
de API, etc.) → decrementar". Esto es el bug central: `es_comida=false` **NO es un fallo** —
es una respuesta **exitosa y ya facturada** por Anthropic. La imagen se envió, se consumieron
tokens de input (imagen de hasta 8 MB), Claude respondió. Reembolsar eso hace que el contador
nunca suba.
- **Reproducir:** loop de `POST /api/analyze` subiendo una foto de no-comida (una pared, un
  screenshot, un gato). Cada request: reserva (count → +1) → Claude responde `es_comida=false`
  (facturado) → la ruta devuelve 422 + reembolso (count → −1). El contador se queda en 0 para
  siempre. Gasto de Anthropic sin tope. El límite de 10/mes no aplica.
- **Mitigación:** **cobrar toda llamada que Anthropic facture**, sea comida o no. Reembolsar
  SOLO cuando no hubo cobro real: fallo *antes* de la request (falta API key `NO_API_KEY`,
  401 key inválida, error de red/timeout previo, 5xx de Anthropic sin billing, 429 de
  rate-limit de Anthropic). Para lograrlo, `lib/analyze.js` debe devolver una señal explícita
  `billed: true/false`; el reembolso en `app/api/analyze/route.js` depende de ESA señal, no del
  `catch` genérico. `es_comida=false` = **se cobra**.

### 🔴 CRÍTICO — H2: El reanálisis/corrección multiplica llamadas a Claude sin control.
`app/api/analyze/route.js` atiende también las correcciones: los campos `feedback` + `previous`
(controlados 100% por el cliente) disparan una **segunda** llamada a Claude
(`lib/analyze.js:153`). El diseño no define si el reanálisis consume crédito.
- **Reproducir:** `POST /api/analyze` con `feedback="corrige"` y un `previous` cualquiera, en loop.
  - Si el reanálisis **no** cuenta → análisis ilimitados gratis (bypass total del límite).
  - Si **sí** cuenta → el usuario legítimo afinando un platillo quema su mes en una sesión (ver H12).
- **Mitigación:** decidir explícitamente. Recomendado: **cada llamada a Claude cuenta** (incluida
  la corrección), y se muestra el costo en UI antes de gastarlo. La reserva debe ocurrir en TODA
  ruta que invoque a Claude.

### 🔴 CRÍTICO — H3: Farmeo de cuentas (confirm-email OFF) = 10 análisis gratis por email falso.
VB-1 desactiva la confirmación de correo. La anon key permite `signUp` desde el navegador. Sin
verificación ni captcha, un script crea N cuentas con emails basura, cada una con 10 créditos
frescos.
- **Reproducir:** bucle `supabase.auth.signUp({ email: rand()+'@x.com', password })`; por cada
  cuenta, 10 análisis. 1000 cuentas = 10.000 análisis.
- **Mitigación:** captcha en signup (Cloudflare Turnstile, soportado por Supabase Auth),
  rate-limit de signup por IP, y **tope global de gasto** (H4). En local no importa; **antes de
  exponer la URL pública es bloqueante.**

### 🟠 ALTO — H4: No hay tope global de gasto ni kill-switch.
Todo el modelo confía en la contabilidad por-usuario. Cualquier bypass (H1/H2/H3) o bug tiene
**radio de explosión ilimitado** sobre el crédito de Anthropic. No existe cap agregado ni alerta.
- **Reproducir:** cualquiera de H1–H3 corre sin freno hasta agotar el saldo.
- **Mitigación:** contador global mensual (una fila/tabla) + límite duro configurable +
  alerta al llegar a X%. Es el airbag cuando falla lo demás.

### 🟡 MEDIO — H5: Sin downscale, cada análisis cuesta el máximo posible.
`MAX_BYTES = 8 MB` en `app/api/analyze/route.js:8`. Anthropic factura por tokens de imagen;
imágenes enormes = más tokens. 10/mes × 8 MB × 100k usuarios es dinero real aun sin abuso.
- **Reproducir:** mandar siempre imágenes al máximo de resolución/peso.
- **Mitigación:** redimensionar server-side antes de enviar a Claude (además acelera la respuesta).

---

## 2) SEGURIDAD (RLS / consumir_analisis / race conditions)

### 🔴 CRÍTICO — H6: El cliente llama tablas y RPC directo con la anon key.
El modelo de seguridad es "anon key + RLS". PostgREST expone **toda** tabla y RPC al JWT del
usuario. La sección 3 dice "cada usuario solo ve/**escribe** sus filas" — eso es exactamente el
error para un contador:
- **H6a — Auto-reset del contador:** con su propio JWT, `UPDATE usage_counters SET count=0`
  sobre su fila → RLS lo permite → límite reseteado a voluntad → ilimitado.
- **H6b — Auto-upgrade de plan:** `UPDATE profiles SET plan='pro'` sobre su fila.
- **H6c — Límite falsificado:** si `consumir_analisis(limite int)` toma el límite del caller,
  el usuario llama la RPC directo: `consumir_analisis(999999)`.
- **Reproducir:** con el JWT visible en el navegador:
  `supabase.from('usage_counters').update({count:0})` o
  `supabase.rpc('consumir_analisis',{limite:999999})`.
- **Mitigación:** RLS de `usage_counters` y de `profiles.plan` = **SELECT propio permitido,
  INSERT/UPDATE/DELETE DENEGADO** al rol autenticado. La ÚNICA mutación del contador viene de
  `consumir_analisis` (SECURITY DEFINER). El límite se resuelve **dentro** de la función leyendo
  `profiles.plan` por `auth.uid()`; **ignorar cualquier argumento de límite del cliente.**

### 🔴 CRÍTICO — H7: `consumir_analisis` SECURITY DEFINER — search_path e identidad.
Una función DEFINER corre como owner (salta RLS). Dos fallos clásicos:
- **Sin `SET search_path = ''`** (o `pg_catalog`) → search_path injection / privilege escalation.
- **Si el `user_id` llega por parámetro** en vez de `auth.uid()` interno → un usuario
  incrementa/decrementa el contador de **otro** o se auto-exime.
- **Reproducir:** llamar la RPC pasando el `user_id` de otra cuenta (si es argumento); o explotar
  un `search_path` mutable si la función referencia tablas sin esquema.
- **Mitigación:** la función DEFINER debe (1) fijar `search_path`, (2) derivar el usuario de
  `auth.uid()` internamente, (3) hacer chequeo + incremento en **una sola** sentencia atómica:
  `INSERT ... ON CONFLICT (user_id,period) DO UPDATE SET count = usage_counters.count + 1
  WHERE usage_counters.count < limite RETURNING ...` (no read-then-write).

### 🟠 ALTO — H8: Validar el JWT, no confiar en la cookie.
El gate debe usar `supabase.auth.getUser()` (valida la firma del JWT contra Supabase) y **no**
`getSession()` (confía en la cookie tal cual). En una ruta API que recibe POST de clientes
no-navegador, esto importa.
- **Reproducir:** mandar una cookie de sesión manipulada/expirada; con `getSession()` podría pasar
  el gate sin validación real.
- **Mitigación:** en `app/api/analyze/route.js` usar `getUser()`; 401 si no hay usuario verificado.

### 🟠 ALTO — H9: Race y underflow en el reembolso.
`count = count - 1` sin candado ni clamp: reembolsos concurrentes, o un reembolso sin reserva
correspondiente, empujan `count` a **negativo** → créditos extra gratis. Además, si la reserva
ocurre 23:59 del 31-jul y el reembolso 00:00 del 1-ago, se decrementa el periodo `2026-08`
equivocado (por el reset por `YYYY-MM`).
- **Reproducir:** disparar N análisis concurrentes que fallen (o cruzar el cambio de mes con una
  request lenta) y observar `count < 0` o el periodo nuevo decrementado.
- **Mitigación:** reembolso atómico con `GREATEST(count-1, 0)`, **scoped al mismo periodo que
  reservó** (pasar el periodo/idempotency-token de la reserva, no recalcular "ahora"), idempotente
  por request.

---

## 3) UX / CONFUSIÓN

### 🟠 ALTO — H10: Muro de login en el primer uso mata la activación.
Un usuario que quiere "tomarle foto a mi comida y ver calorías" choca contra `/login` antes de ver
**ningún** valor. Sin demo ni modo invitado. Churn máximo en la boca del embudo.
- **Reproducir:** abrir la app recién desplegada → redirección inmediata a `/login` → el usuario
  se va sin probar nada.
- **Mitigación:** permitir 1–3 análisis anónimos (Supabase anonymous sign-in) antes de pedir
  email, o un preview del valor.

### 🟠 ALTO — H11: Sin recuperación de contraseña + email sin verificar = cuenta perdida.
El diseño no menciona "olvidé mi contraseña". Con confirm-email OFF, el reset iría a un correo
no verificado/falso. Y el propio doc nota que el SMTP gratis de Supabase limita ~2–3 correos/hora
→ el flujo de reset es **inservible** a escala. Usuario olvida la contraseña → pierde cuenta e
historial → reseña de 1 estrella.
- **Reproducir:** registrarse, cerrar sesión, olvidar la contraseña → no hay ruta de recuperación.
- **Mitigación:** flujo de reset con proveedor SMTP real (Resend/SendGrid) antes de exponer;
  requiere reactivar verificación de email.

### 🟡 MEDIO — H12: El reanálisis quema créditos en silencio + 429 sin fecha de reset.
Ligado a H2: afinar un platillo puede gastar 3–4 créditos sin aviso. Y el 429 "llegaste a tu
límite de 10" no dice **cuándo** se reinicia ni ofrece salida.
- **Reproducir:** corregir un análisis 3 veces y ver el contador caer sin advertencia; o llegar
  al 429 y no saber cuándo vuelve el acceso.
- **Mitigación:** mostrar "restantes" y decrementarlo visiblemente; en el 429, indicar
  "se reinicia el 1 de agosto" + alternativa (registro manual sin IA, ver H19).

### 🟡 MEDIO — H13: Reset por mes calendario percibido como injusto + ambigüedad de timezone.
Quien se registra el 30-jul recibe 10 para 2 días y el 1-ago "resetea": se siente estafado. Y
`YYYY-MM` ¿en qué zona horaria se calcula? Si es UTC, un usuario en UTC-7 ve el reset a las 5pm de
su último día.
- **Reproducir:** registrarse a fin de mes; observar el reset "temprano". Comparar el corte de
  periodo entre servidor UTC y cliente local.
- **Mitigación:** considerar ventana rodante de 30 días o desde el signup; definir explícitamente
  la timezone del periodo.

---

## 4) ESCALA 100k

### 🟠 ALTO — H14: Pool de conexiones Postgres en serverless.
100k usuarios + una RPC por análisis: cada instancia serverless abre conexiones y satura Postgres
sin pooler.
- **Reproducir:** carga concurrente alta → errores "too many connections".
- **Mitigación:** usar el **connection pooler** de Supabase (puerto 6543, PgBouncer), no la
  conexión directa.

### 🟠 ALTO — H15: SMTP gratis (2–3/hora) no escala.
No sirve para signups verificados ni resets a escala (bloquea la mitigación de H3 y de H11).
- **Reproducir:** intentar 100 signups/resets por hora → correos encolados/perdidos.
- **Mitigación:** proveedor de email real desde antes del lanzamiento público.

### 🟠 ALTO — H16: Fotos en disco (R5) no corren en serverless.
`fs.writeFile` en `app/api/analyze/route.js:87` y el served desde disco en
`app/api/uploads/[name]/route.js` no funcionan en Vercel. Bloqueante de deploy real (ya
reconocido en el diseño como R5).
- **Reproducir:** desplegar en Vercel y analizar → la foto no persiste / 500.
- **Mitigación:** mover a Supabase Storage (Paso D/E).

### 🟡 MEDIO — H17: Sin tope global, un actor drena el presupuesto de todos.
A 100k usuarios, un bug o un abusador (H1–H3) agota el crédito para toda la base.
- **Mitigación:** el circuit-breaker de H4 es más urgente cuanto más grande el userbase.

---

## 5) CHURN / RESEÑA 1-ESTRELLA

### 🔴 CRÍTICO — H18: Pérdida de datos en la migración SQLite → Postgres.
`lib/db.js` guarda `meals`/`settings` **sin `user_id`**, monousuario. Al migrar (Paso 5), el
historial existente no tiene a quién asignarse → tras la actualización, el usuario abre la app y
**su historial desapareció**. Churn instantáneo + desconfianza.
- **Reproducir:** tener comidas registradas en SQLite, aplicar la migración, entrar con una cuenta
  nueva → el historial no aparece.
- **Mitigación:** script de migración que asigne los `meals` existentes a la primera cuenta creada
  (o pantalla "reclamar tu historial"). Probarlo antes de tocar producción.

### 🔴 CRÍTICO — H19: 10 análisis/MES es inusable para un tracker de comida.
Nadie lo marcó, pero es la bomba de churn más grande: se comen 3+ comidas al día → **10/mes
alcanza para ~3 días**. Un "calorie tracker" que deja registrar 10 comidas al mes no es un tracker;
es una demo. Reseñas de 1 estrella garantizadas ("se acabó a los 3 días").
- **Reproducir:** usar la app como se supone (registrar cada comida) → límite agotado en ~3 días.
- **Mitigación:** separar "análisis con IA" (lo caro) de "registro de comida". Cuando se agote el
  límite de IA, permitir **registro manual gratis** (título + macros a mano). Así el producto
  sigue siendo usable y el límite solo aplica al costo real (Claude). Reconsiderar el número: 10
  es bajísimo para el caso de uso diario.

---

## Mapa hallazgo → pregunta del brief
- **Vector de abuso/costo del reembolso:** H1 (CONFIRMADO), H2, H3, H4, H5.
- **Seguridad RLS / consumir_analisis / race conditions:** H6, H7, H8, H9.
- **UX (login wall, olvido de contraseña, 401/429):** H10, H11, H12, H13.
- **Escala 100k:** H14, H15, H16, H17.
- **Churn / 1-estrella:** H18, H19 (+ H10, H11, H12).
