'use client';

import { useEffect } from 'react';
import { registrarSW } from '@/lib/push/client';

// Registra el service worker de forma PASIVA al cargar (sin pedir permiso ni suscribir: eso lo hace
// la UI de Rams con un gesto del usuario). Además gestiona el AUTO-UPDATE anti-stale:
//  · si aparece un SW nuevo, se le pide activar ya (skipWaiting) y, cuando toma control
//    (controllerchange), se hace UN reload suave → el usuario queda en la última versión sin
//    limpiar cache ni reinstalar la PWA a mano.
//  · NO recarga en la PRIMERA instalación (cuando aún no había SW controlando) para no molestar.
// Deploy-safe: si el navegador no soporta SW, no hace nada.
export default function PushRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;

    // ¿había ya un SW controlando esta página al cargar? Si no, es primera instalación → no recargar.
    const habiaControlador = !!navigator.serviceWorker.controller;
    let recargado = false;

    const pedirSkip = (worker) => worker && worker.postMessage && worker.postMessage({ type: 'SKIP_WAITING' });

    registrarSW().then((reg) => {
      if (!reg) return;
      if (reg.waiting) pedirSkip(reg.waiting); // ya hay uno esperando → actívalo
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) pedirSkip(nuevo);
        });
      });
    });

    const onControllerChange = () => {
      if (recargado || !habiaControlador) return; // primera instalación → sin reload
      recargado = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
