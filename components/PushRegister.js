'use client';

import { useEffect } from 'react';
import { registrarSW } from '@/lib/push/client';

// Registra el service worker de forma PASIVA al cargar (sin pedir permiso ni suscribir: eso lo hace
// la UI de Rams con un gesto del usuario). Así el SW ya está activo cuando el usuario acepte avisos.
// Deploy-safe: si el navegador no soporta SW, registrarSW() devuelve null sin romper.
export default function PushRegister() {
  useEffect(() => { registrarSW(); }, []);
  return null;
}
