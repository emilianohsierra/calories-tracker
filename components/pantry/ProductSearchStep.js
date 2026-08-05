'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import ProductResultCard from '@/components/pantry/ProductResultCard';
import ProductMiss from '@/components/pantry/ProductMiss';
import { searchProduct, productToDraft } from '@/lib/pantry/productSearch';

// Paso "Buscar" del Producto-DB. Input → ProductSearchService → auto | disambiguation | miss.
// onPick(draft) → Confirmar. onUseMethod(method) → cambia de vía (foto de etiqueta / manual).
export default function ProductSearchStep({ onPick, onUseMethod, onBack }) {
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | searching | result
  const [result, setResult] = useState(null);

  const run = async () => {
    const query = q.trim();
    if (!query) return;
    setPhase('searching');
    const r = await searchProduct(query);
    setResult(r);
    setPhase('result');
  };

  const miss = (
    <ProductMiss
      onEtiqueta={() => onUseMethod?.('photo')}
      onManual={() => onPick?.({ confianza: 'user', nombre: q.trim() })}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div role="search" style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', padding: '0 var(--s4)', minHeight: 'var(--touch)', borderRadius: 'var(--r-pill)', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <span aria-hidden="true" style={{ color: 'var(--text-3)', display: 'inline-flex' }}><Icon name="search" size={18} /></span>
        <input
          type="text"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="Nombre o marca del producto…"
          aria-label="Buscar producto en el catálogo"
          style={{ flex: 1, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 15, outline: 'none', minWidth: 0 }}
        />
        <button type="button" className="link-btn" onClick={run} disabled={!q.trim()}>Buscar</button>
      </div>

      {phase === 'searching' && (
        <p className="c-subtitle" aria-live="polite" style={{ textAlign: 'center', margin: 'var(--s3) 0' }}>Buscando en el catálogo…</p>
      )}

      {phase === 'result' && result?.match === 'auto' && result.producto && (
        <ProductResultCard
          product={result.producto}
          variant="full"
          onAdd={(p) => onPick?.(productToDraft(p))}
          onEdit={(p) => onPick?.(productToDraft(p))}
          onComplete={(mode) => (mode === 'foto' ? onUseMethod?.('photo') : onPick?.(productToDraft(result.producto)))}
        />
      )}

      {phase === 'result' && result?.match === 'disambiguation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
          <p className="c-subtitle" style={{ margin: '0 0 2px' }}>¿Cuál producto es?</p>
          {(result.candidatos || []).map((c) => (
            <ProductResultCard key={c.product_id} product={c} variant="compact" onSelect={(p) => onPick?.(productToDraft(p))} />
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => setResult({ match: 'miss' })}>Ninguno de estos</button>
        </div>
      )}

      {phase === 'result' && result?.match === 'miss' && miss}

      <button type="button" className="link-btn" onClick={onBack}>‹ Otro método</button>
    </div>
  );
}
