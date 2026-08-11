// Coach · Proactividad Fase 2 — ENVÍO de web push (server-side, con la librería web-push + VAPID).
// El cron lo llama tras crear una notificación. DEPLOY-SAFE: sin VAPID o sin la librería → no-op
// (solo queda la bandeja in-app). Devuelve los endpoints MUERTOS (410/404) para que el cron limpie.

export function vapidPublica() {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}

export function pushConfigurado() {
  return !!(process.env.VAPID_PRIVATE_KEY && vapidPublica() && process.env.VAPID_SUBJECT);
}

// Construye un "sender" real (web-push con VAPID) o null si no hay config/librería. Se aísla para
// poder inyectar un mock en tests. `sender(sub, payloadStr)` envía y lanza {statusCode} en error.
async function senderPorDefecto() {
  if (!pushConfigurado()) return null;
  let webpush;
  try {
    webpush = (await import('web-push')).default;
  } catch {
    return null; // librería ausente → no-op
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, vapidPublica(), process.env.VAPID_PRIVATE_KEY);
  return (sub, payloadStr) => webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payloadStr,
  );
}

// Envía `payload` (objeto {title, body, url, tag}) a cada suscripción. Devuelve
// { enviados:number, muertos:string[] } donde muertos = endpoints con 404/410 (para borrarlos).
// `sender` inyectable para tests; en producción se resuelve solo.
export async function enviarPush(subs, payload, { sender } = {}) {
  const lista = Array.isArray(subs) ? subs : [];
  if (!lista.length) return { enviados: 0, muertos: [] };
  const send = sender || (await senderPorDefecto());
  if (!send) return { enviados: 0, muertos: [] }; // sin VAPID/librería → se salta (solo in-app)

  const payloadStr = JSON.stringify(payload || {});
  const muertos = [];
  let enviados = 0;
  for (const sub of lista) {
    try {
      await send(sub, payloadStr);
      enviados += 1;
    } catch (e) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) muertos.push(sub.endpoint); // suscripción muerta → limpiar
      // otros errores (red, 5xx): se ignoran este tick; el push es best-effort.
    }
  }
  return { enviados, muertos };
}
