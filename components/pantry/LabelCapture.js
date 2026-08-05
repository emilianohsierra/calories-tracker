'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { downscaleImage } from '@/lib/image';
import { normalizeNutricion, imageOf } from '@/lib/pantry/constants';

// Foto de etiqueta → POST /api/pantry/label → campos extraídos EDITABLES (confianza 'ai').
// 429 (cap agotado) → onPaywall. Sin soporte/errores → mensaje + reintento / otro método.
// Reusa el patrón de cámara de AddMealModal (input file capture) → funciona en iOS.
export default function LabelCapture({ onExtracted, onPaywall, onFallback }) {
  const fileRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | reading | error

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhase('reading');
    let blob;
    try {
      blob = await downscaleImage(file);
    } catch {
      setPhase('error');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('image', blob, 'etiqueta.jpg');
      const res = await fetch('/api/pantry/label', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        // La foto de etiqueta COMPARTE el cap de fotos (feature 'analisis'). Leemos
        // data.feature del payload (no hardcodear) para que UpgradeModal muestre el copy correcto.
        onPaywall?.({ variant: data.variant || 'limit', feature: data.feature || 'analisis', usage: data.usage || null });
        return;
      }
      if (res.status === 422) { // la foto no es una etiqueta nutricional
        setPhase('notlabel');
        return;
      }
      // Contrato CTO: 200 { label:{ ...campos, procedencia:'estimado_ia', confirmado:false }, restantes }
      const l = data.label || data.product; // tolera ambas por si acaso
      if (!res.ok || !l) {
        setPhase('error');
        return;
      }
      onExtracted({
        nombre: l.nombre || '',
        marca: l.marca || '',
        categoria: l.categoria || 'otros',
        unidad: l.unidad || 'g',
        cantidad: '',
        nutricion: normalizeNutricion(l.nutricion || l), // fibra/azúcar/sodio/porción incluidos
        confianza: 'ai', // procedencia estimado_ia → badge estimado-IA en Confirmar
        imagen: imageOf(l), // foto del producto (OFF) si el match la trae
      });
    } catch {
      setPhase('error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)', alignItems: 'stretch' }}>
      {phase === 'error' && (
        <p className="c-subtitle" role="alert" style={{ margin: 0 }}>No pude leer la etiqueta. Toma otra foto o agrégalo manual.</p>
      )}
      {phase === 'notlabel' && (
        <p className="c-subtitle" role="alert" style={{ margin: 0 }}>Esto no parece una etiqueta nutricional. Enfoca el panel de información y vuelve a intentar.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--s3)', padding: 'var(--s5) var(--s4)', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', background: 'var(--surface-2)', color: 'var(--text-2)' }}>
        <span style={{ color: 'var(--brand-strong)' }}><Icon name="camera" size={28} /></span>
        <p className="c-subtitle" style={{ margin: 0, textAlign: 'center' }}>
          {phase === 'reading' ? 'Leyendo la etiqueta…' : 'Fotografía el panel nutricional de la etiqueta, bien iluminado y enfocado.'}
        </p>
      </div>

      <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={phase === 'reading'} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="camera" size={18} /> {phase === 'reading' ? 'Procesando…' : 'Tomar foto de la etiqueta'}
      </button>
      <button type="button" className="link-btn" onClick={onFallback} disabled={phase === 'reading'}>‹ Otro método</button>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
    </div>
  );
}
