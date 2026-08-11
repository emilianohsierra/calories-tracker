'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { suscribirPush, desuscribirPush, pushSoportado } from '@/lib/push/client';

// Botón "Activar avisos" (web push). Usa los helpers del CTO (no reimplementa PushManager).
// Maneja el caveat iOS: motivo 'ios-instalar' → instrucción de agregar a inicio.
const MOTIVO_MSG = {
  'ios-instalar': 'Agrega la app a tu pantalla de inicio para recibir avisos.',
  'no-soportado': 'Tu navegador no soporta avisos push.',
  'sin-vapid': 'Los avisos no están configurados todavía.',
  'sin-permiso': 'No diste permiso para los avisos. Puedes activarlo en los ajustes del navegador.',
  error: 'No se pudo activar. Inténtalo de nuevo.',
};

export default function PushToggle() {
  const [estado, setEstado] = useState('cargando'); // cargando | on | off | working
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!pushSoportado()) { if (vivo) setEstado('off'); return; }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && (await reg.pushManager.getSubscription());
        if (vivo) setEstado(sub ? 'on' : 'off');
      } catch {
        if (vivo) setEstado('off');
      }
    })();
    return () => { vivo = false; };
  }, []);

  const activar = async () => {
    setEstado('working');
    setMotivo('');
    const r = await suscribirPush();
    if (r.ok) { setEstado('on'); return; }
    setEstado('off');
    setMotivo(r.motivo || 'error');
  };

  const desactivar = async () => {
    setEstado('working');
    setMotivo('');
    await desuscribirPush();
    setEstado('off');
  };

  if (estado === 'on') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s2)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--brand-tint)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--brand-strong)' }}>
          <Icon name="check" size={16} /> Avisos activados
        </span>
        <button type="button" className="link-btn" onClick={desactivar}>Desactivar</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        type="button"
        className="btn btn-primary"
        onClick={activar}
        disabled={estado === 'working' || estado === 'cargando'}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' }}
      >
        <Icon name="bell" size={18} /> {estado === 'working' ? 'Activando…' : 'Activar avisos'}
      </button>
      {motivo && (
        <p className="c-subtitle" role={motivo === 'sin-permiso' || motivo === 'error' ? 'alert' : undefined} style={{ margin: 0, color: 'var(--text-2)' }}>
          {MOTIVO_MSG[motivo] || MOTIVO_MSG.error}
        </p>
      )}
    </div>
  );
}
