'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';

// Lista de compras (Fase 7). CRUD SIEMPRE Free, scoped al usuario (RLS). Lee /api/shopping-list.
export default function ListaPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [nuevo, setNuevo] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [backHref, setBackHref] = useState('/'); // N-I3: respeta el origen (coach → volver al coach)

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('from') === 'coach') setBackHref('/coach');
  }, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/shopping-list');
      if (!res.ok) throw new Error('load');
      const d = await res.json();
      setItems(Array.isArray(d.items) ? d.items : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // N-I8: los fallos (409 lista llena / 500) ya NO son silenciosos → aviso + revertir optimista.
  const agregar = async () => {
    const texto = nuevo.trim();
    if (!texto || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, origen: 'manual' }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.item) { setItems((x) => [...x, d.item]); setNuevo(''); }
      else setToast(d.error || 'No se pudo agregar. Intenta de nuevo.');
    } catch {
      setToast('No se pudo agregar. Revisa tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (it) => {
    setItems((x) => x.map((i) => (i.id === it.id ? { ...i, comprado: !i.comprado } : i))); // optimista
    try {
      const res = await fetch(`/api/shopping-list/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comprado: !it.comprado }) });
      if (!res.ok) throw new Error('patch');
    } catch { setToast('No se pudo actualizar.'); load(); } // revierte con el estado real
  };

  const quitar = async (it) => {
    setItems((x) => x.filter((i) => i.id !== it.id)); // optimista
    try {
      const res = await fetch(`/api/shopping-list/${it.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete');
    } catch { setToast('No se pudo quitar.'); load(); }
  };

  const pendientes = items.filter((i) => !i.comprado);
  const comprados = items.filter((i) => i.comprado);

  const Row = ({ it }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {/* Item 8: área táctil ≥44px (el glifo visual sigue en 24px, centrado dentro del hit-area). */}
      <button
        type="button"
        onClick={() => toggle(it)}
        aria-label={it.comprado ? 'Marcar como pendiente' : 'Marcar como comprado'}
        style={{ width: 44, height: 44, flexShrink: 0, margin: '-10px 0', border: 'none', background: 'none', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${it.comprado ? 'var(--ok)' : 'var(--border)'}`, background: it.comprado ? 'var(--ok)' : 'transparent', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {it.comprado ? <Icon name="check" size={14} /> : null}
        </span>
      </button>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--text)', textDecoration: it.comprado ? 'line-through' : 'none', opacity: it.comprado ? 0.55 : 1 }}>
        {it.texto || 'Producto'}
        {it.cantidad != null && (it.cantidad !== 1 || (it.unidad && it.unidad !== 'pieza')) ? (
          <span className="c-subtitle" style={{ marginLeft: 6 }}>{Number(it.cantidad)}{it.unidad ? ` ${it.unidad}` : ''}</span>
        ) : null}
      </span>
      <button type="button" onClick={() => quitar(it)} aria-label="Quitar" className="link-btn" style={{ color: 'var(--text-3)', width: 44, height: 44, margin: '-10px -10px -10px 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--s4)', display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
        <button type="button" className="link-btn" onClick={() => router.push(backHref)} aria-label="Volver" style={{ fontSize: 22, lineHeight: 1 }}>‹</button>
        <h1 className="c-title" style={{ margin: 0 }}>Lista de compras</h1>
      </header>

      {toast && (
        <div role="status" style={{ padding: 'var(--s2) var(--s3)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 13 }}>
          {toast}
        </div>
      )}

      <div className="field" role="search" style={{ display: 'flex', gap: 'var(--s2)' }}>
        <input
          type="text"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && agregar()}
          placeholder="Agregar un producto…"
          aria-label="Agregar producto a la lista"
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-primary" onClick={agregar} disabled={!nuevo.trim() || busy}>Agregar</button>
      </div>

      {status === 'loading' && <p className="c-subtitle">Cargando tu lista…</p>}
      {status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          <p className="c-subtitle" role="alert">No pude cargar tu lista.</p>
          <button type="button" className="btn btn-ghost" onClick={load}>Reintentar</button>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--s5) var(--s4)', color: 'var(--text-3)' }}>
          <Icon name="clipboard" size={28} />
          <p className="c-body" style={{ margin: 'var(--s2) 0 0', color: 'var(--text)' }}>Tu lista está vacía.</p>
          <p className="c-subtitle" style={{ margin: 0 }}>Agrega productos aquí o dile al coach “anota que necesito leche”.</p>
        </div>
      )}

      {status === 'ready' && pendientes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          {pendientes.map((it) => <Row key={it.id} it={it} />)}
        </div>
      )}

      {status === 'ready' && comprados.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          <p className="c-subtitle" style={{ margin: 0 }}>Comprado ({comprados.length})</p>
          {comprados.map((it) => <Row key={it.id} it={it} />)}
        </div>
      )}
    </div>
  );
}
