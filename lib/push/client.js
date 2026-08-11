'use client';

// Coach · Proactividad Fase 2 — helpers de CLIENTE para el web push (para que Rams los use en un
// botón "Activar avisos"). Feature-detecta y degrada con gracia; nunca rompe si el navegador no
// soporta push. La suscripción real necesita un gesto del usuario (permiso del SO) → la dispara la
// UI de Rams llamando a suscribirPush().

export function pushSoportado() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// iOS: el push SOLO llega si la PWA está INSTALADA (Agregar a inicio) en iOS 16.4+. En Safari
// normal no funciona. Detectamos "standalone" para avisar al usuario.
export function esStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function esIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export async function registrarSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    // ?v=<commit> bust-ea la URL del SW en cada deploy → el navegador detecta versión nueva aunque
    // el binario del SW no cambie (combinado con Cache-Control no-cache del /sw.js).
    const v = process.env.NEXT_PUBLIC_COMMIT_SHA || '';
    return await navigator.serviceWorker.register(v ? `/sw.js?v=${v}` : '/sw.js');
  } catch {
    return null;
  }
}

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// Suscribe este navegador al push y guarda la suscripción en el server.
// Devuelve { ok, motivo? }: 'no-soportado' | 'ios-instalar' | 'sin-permiso' | 'sin-vapid' | 'error'.
export async function suscribirPush() {
  if (!pushSoportado()) {
    return { ok: false, motivo: esIOS() && !esStandalone() ? 'ios-instalar' : 'no-soportado' };
  }
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, motivo: 'sin-vapid' };

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, motivo: 'sin-permiso' };

  const reg = (await navigator.serviceWorker.getRegistration()) || (await registrarSW());
  if (!reg) return { ok: false, motivo: 'error' };
  await navigator.serviceWorker.ready;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(vapid),
  });
  const json = sub.toJSON();
  const res = await fetch('/api/coach/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return res.ok ? { ok: true } : { ok: false, motivo: 'error' };
}

// Cancela la suscripción de este navegador (y la borra en el server).
export async function desuscribirPush() {
  if (!('serviceWorker' in navigator)) return { ok: true };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* noop */ }
  await fetch('/api/coach/push/subscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  return { ok: true };
}
