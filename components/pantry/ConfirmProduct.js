'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ConfidenceBadge from '@/components/pantry/ConfidenceBadge';
import { CATEGORIES, UNITS, imageOf } from '@/lib/pantry/constants';

// Paso CONFIRMAR (obligatorio). Foto del producto + todos los campos editables antes de
// guardar. Si el usuario edita un dato "verificado/estimado", su confianza baja a "tuyo".
export default function ConfirmProduct({ draft, onCancel, onSave, saving = false, codigoReadOnly = false }) {
  const [form, setForm] = useState(() => ({
    nombre: '', marca: '', categoria: 'otros', cantidad: '', unidad: 'g', caduca_el: '', codigo: '',
    nutricion: { kcal: '', prot: '', carb: '', gras: '', fibra: '', azucar: '', sodio: '', porcion: '' },
    confianza: 'user', imagen: '',
    ...draft,
    nutricion: { kcal: '', prot: '', carb: '', gras: '', fibra: '', azucar: '', sodio: '', porcion: '', ...(draft?.nutricion || {}) },
  }));
  const productImg = imageOf(form);
  const photoRef = useRef(null);
  // Producto propio (lo capturó el usuario, sin match de catálogo) → puede añadir foto/código.
  const esPropio = form.confianza === 'user';

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setForm((f) => ({ ...f, imagen: URL.createObjectURL(file) })); // preview; subida real = backend V2
  };

  // Editar un campo baja la confianza a "user" si venía de catálogo/IA.
  const downgrade = (c) => (c === 'verified' || c === 'ai' ? 'user' : c);
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val, confianza: downgrade(f.confianza) }));
  const setNut = (key, val) => setForm((f) => ({ ...f, nutricion: { ...f.nutricion, [key]: val }, confianza: downgrade(f.confianza) }));

  // Item 1: cantidad OPCIONAL (no fricciona el match auto). Solo el nombre es obligatorio; si no dan
  // cantidad, default sensato = 1.
  const valid = !!form.nombre.trim();

  const save = () => {
    if (!valid || saving) return;
    const cant = Number(form.cantidad);
    onSave({
      ...form,
      nombre: form.nombre.trim(),
      marca: form.marca.trim(),
      cantidad: Number.isFinite(cant) && cant > 0 ? cant : 1,
      caduca_el: form.caduca_el || null,
      nutricion: {
        kcal: numOrNull(form.nutricion.kcal),
        prot: numOrNull(form.nutricion.prot),
        carb: numOrNull(form.nutricion.carb),
        gras: numOrNull(form.nutricion.gras),
        fibra: numOrNull(form.nutricion.fibra),
        azucar: numOrNull(form.nutricion.azucar),
        sodio: numOrNull(form.nutricion.sodio),
        porcion: numOrNull(form.nutricion.porcion),
      },
    });
  };

  return (
    <div className="form-grid" style={{ marginTop: 'var(--s2)' }}>
      {productImg ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={productImg} alt={form.nombre || 'Producto'} style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', background: 'var(--surface-2)' }} />
          {esPropio && <button type="button" className="link-btn" onClick={() => photoRef.current?.click()}>Cambiar foto</button>}
        </div>
      ) : esPropio ? (
        <button type="button" className="btn btn-ghost" onClick={() => photoRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="camera" size={16} /> Agregar foto (opcional)
        </button>
      ) : null}
      <input ref={photoRef} type="file" accept="image/*" hidden onChange={onPhoto} />
      <div className="field">
        <label htmlFor="cp-nombre">Nombre</label>
        <input id="cp-nombre" type="text" value={form.nombre} maxLength={80} onChange={(e) => set('nombre', e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="cp-marca">Marca (opcional)</label>
          <input id="cp-marca" type="text" value={form.marca} maxLength={60} onChange={(e) => set('marca', e.target.value)} />
        </div>
        <div className="field">
          {/* Item 4: en edición el código NO se persiste en el ítem (es del producto vinculado) → read-only claro. */}
          <label htmlFor="cp-codigo">Código de barras{codigoReadOnly ? '' : ' (opcional)'}</label>
          <input
            id="cp-codigo"
            type="text"
            inputMode="numeric"
            value={form.codigo || ''}
            maxLength={32}
            readOnly={codigoReadOnly}
            aria-readonly={codigoReadOnly || undefined}
            onChange={codigoReadOnly ? undefined : (e) => set('codigo', e.target.value)}
            style={codigoReadOnly ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
          />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="cp-cat">Categoría</label>
          <select id="cp-cat" value={form.categoria} onChange={(e) => set('categoria', e.target.value)}>
            {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cp-cad">Caducidad (opcional)</label>
          <input id="cp-cad" type="date" value={form.caduca_el || ''} onChange={(e) => set('caduca_el', e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="cp-cant">Cantidad</label>
          <input id="cp-cant" type="number" min="0" step="any" value={form.cantidad} onChange={(e) => set('cantidad', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cp-uni">Unidad</label>
          <select id="cp-uni" value={form.unidad} onChange={(e) => set('unidad', e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 'var(--s3)', margin: 0 }}>
        <legend className="c-subtitle" style={{ padding: '0 6px' }}>
          Nutrición {Number(form.nutricion.porcion) > 0 ? `por porción (${Math.round(Number(form.nutricion.porcion))} g)` : 'por 100 g/ml'} (opcional)
        </legend>
        <p className="c-subtitle" style={{ margin: '0 0 var(--s2)', color: 'var(--text-3)' }}>Deja lo que sepas; no inventamos valores.</p>
        <div className="form-row">
          <div className="field">
            <label htmlFor="cp-kcal">kcal</label>
            <input id="cp-kcal" type="number" min="0" step="any" value={form.nutricion.kcal} onChange={(e) => setNut('kcal', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cp-prot" style={{ color: 'var(--protein)' }}>Proteína</label>
            <input id="cp-prot" type="number" min="0" step="any" value={form.nutricion.prot} onChange={(e) => setNut('prot', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="cp-carb" style={{ color: 'var(--carbs)' }}>Carbos</label>
            <input id="cp-carb" type="number" min="0" step="any" value={form.nutricion.carb} onChange={(e) => setNut('carb', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cp-gras" style={{ color: 'var(--fat)' }}>Grasa</label>
            <input id="cp-gras" type="number" min="0" step="any" value={form.nutricion.gras} onChange={(e) => setNut('gras', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="cp-fibra" style={{ color: 'var(--fiber)' }}>Fibra (g)</label>
            <input id="cp-fibra" type="number" min="0" step="any" value={form.nutricion.fibra} onChange={(e) => setNut('fibra', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cp-azucar">Azúcar (g)</label>
            <input id="cp-azucar" type="number" min="0" step="any" value={form.nutricion.azucar} onChange={(e) => setNut('azucar', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="cp-sodio">Sodio (mg)</label>
            <input id="cp-sodio" type="number" min="0" step="any" value={form.nutricion.sodio} onChange={(e) => setNut('sodio', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cp-porcion">Porción (g)</label>
            <input id="cp-porcion" type="number" min="0" step="any" value={form.nutricion.porcion} onChange={(e) => setNut('porcion', e.target.value)} />
          </div>
        </div>
      </fieldset>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)', padding: 'var(--s2) 0' }}>
        <ConfidenceBadge level={form.confianza} />
      </div>

      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!valid || saving}>
          {saving ? 'Guardando…' : 'Guardar producto'}
        </button>
      </div>
    </div>
  );
}

function numOrNull(v) {
  const n = Number(v);
  return v === '' || Number.isNaN(n) ? null : n;
}
