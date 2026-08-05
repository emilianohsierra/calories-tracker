'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import PantryCard from '@/components/pantry/PantryCard';
import PantrySearch from '@/components/pantry/PantrySearch';
import FilterChips from '@/components/pantry/FilterChips';
import AddProductSheet from '@/components/pantry/AddProductSheet';
import PantryDetailSheet from '@/components/pantry/PantryDetailSheet';
import UpgradeModal from '@/components/UpgradeModal';
import { getPantry, addProduct, updateItem, deleteItem } from '@/lib/pantry/store';
import { daysUntil, EXPIRY_WARN_DAYS } from '@/lib/pantry/constants';

export default function DespensaPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [paywall, setPaywall] = useState(null); // { variant, feature, usage } (foto de etiqueta)

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await getPantry();
      setItems(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((it) => (filter === 'all' ? true : it.categoria === filter))
      .filter((it) => (q ? `${it.nombre} ${it.marca || ''}`.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const da = daysUntil(a.caduca_el);
        const db = daysUntil(b.caduca_el);
        if (da !== null && db !== null) return da - db;
        if (da !== null) return -1;
        if (db !== null) return 1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [items, query, filter]);

  const expiringCount = useMemo(
    () => items.filter((it) => { const d = daysUntil(it.caduca_el); return d !== null && d <= EXPIRY_WARN_DAYS; }).length,
    [items]
  );

  const onAdd = async (item) => {
    const saved = await addProduct(item);
    setItems((cur) => [saved, ...cur]);
    setToast('Agregado a tu despensa');
  };

  const onUpdate = async (id, patch) => {
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    setSelected((s) => (s && s.id === id ? { ...s, ...patch } : s));
    await updateItem(id, patch);
  };

  const onDelete = async (id) => {
    setItems((cur) => cur.filter((it) => it.id !== id));
    await deleteItem(id);
    setToast('Producto eliminado');
  };

  return (
    <main className="container">
      <header className="greeting" style={{ marginBottom: 'var(--s4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <button type="button" className="link-btn" onClick={() => router.push('/')} aria-label="Volver al inicio" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="chevronLeft" size={20} />
          </button>
          <h1 className="greeting-title" style={{ margin: 0 }}>Mi despensa</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name="plus" size={18} /> Agregar
        </button>
      </header>

      <div style={{ marginBottom: 'var(--s3)' }}>
        <PantrySearch value={query} onChange={setQuery} />
      </div>
      <div style={{ marginBottom: 'var(--s3)' }}>
        <FilterChips active={filter} onChange={setFilter} />
      </div>

      {status === 'ready' && items.length > 0 && (
        <p className="ring-caption num" style={{ margin: '0 0 var(--s3)' }}>
          {items.length} producto{items.length === 1 ? '' : 's'}
          {expiringCount > 0 ? ` · ${expiringCount} por caducar` : ''}
        </p>
      )}

      {status === 'loading' && <PantrySkeleton />}

      {status === 'error' && (
        <div className="card empty-state">
          No pude cargar tu despensa.
          <div style={{ marginTop: 'var(--s3)' }}>
            <button type="button" className="btn btn-primary" onClick={load}>Reintentar</button>
          </div>
        </div>
      )}

      {status === 'ready' && items.length === 0 && (
        <div className="card empty-state">
          <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--text)' }}>Tu despensa está vacía</p>
          Agrega lo que tienes y te digo qué cocinar.
          <div style={{ marginTop: 'var(--s4)' }}>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="plus" size={18} /> Agregar producto
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && items.length > 0 && visible.length === 0 && (
        <div className="card empty-state">
          No encontré {query ? `"${query}"` : 'productos en esta categoría'}.
          <div style={{ marginTop: 'var(--s3)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Ver todo</button>
          </div>
        </div>
      )}

      {status === 'ready' && visible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--s3)' }}>
          {visible.map((it) => (
            <PantryCard key={it.id} item={it} onOpen={setSelected} />
          ))}
        </div>
      )}

      {toast && <div className="toast" role="status" style={{ position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 60, width: 'calc(100% - 32px)', maxWidth: 448 }}>{toast}</div>}

      {adding && <AddProductSheet onClose={() => setAdding(false)} onAdd={onAdd} onPaywall={setPaywall} />}
      {selected && <PantryDetailSheet item={selected} onClose={() => setSelected(null)} onUpdate={onUpdate} onDelete={onDelete} />}
      {paywall && (
        <UpgradeModal
          variant={paywall.variant}
          feature={paywall.feature}
          usage={paywall.usage || { plan: 'free' }}
          resetLabel={paywall.usage?.resetLabel}
          onManual={() => setPaywall(null)}
          onClose={() => setPaywall(null)}
        />
      )}
    </main>
  );
}

function PantrySkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--s3)' }} aria-busy="true" aria-label="Cargando tu despensa">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden', opacity: 0.7 }}>
          <div style={{ aspectRatio: '4 / 3', background: 'var(--surface-2)' }} />
          <div style={{ padding: 'var(--s3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 12, width: '80%', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }} />
            <div style={{ height: 10, width: '50%', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
