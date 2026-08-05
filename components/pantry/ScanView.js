'use client';

import { useEffect, useRef, useState } from 'react';

// Escanear código de barras. Approach: BarcodeDetector nativa (Android/Chrome) + fallback
// a ENTRADA MANUAL del número (iOS/no soportado). Al leer → GET /api/pantry/search?code=
// → precarga producto (confianza del catálogo) → onDetected(draft). onFallback → volver.
// Nota: el decoder JS para iOS (p.ej. zxing) queda como follow-up con el CTO (dependencia).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];

export default function ScanView({ onDetected, onFallback, onUseMethod }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const stoppedRef = useRef(false);
  const [phase, setPhase] = useState('init'); // init | scanning | denied | unsupported | looking | notfound | error
  const [manual, setManual] = useState('');
  const [errText, setErrText] = useState('');

  const hasCamera = typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia;
  const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const stopCamera = () => {
    stoppedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const lookup = async (code) => {
    stopCamera();
    setPhase('looking');
    setErrText('');
    try {
      const res = await fetch(`/api/pantry/search?code=${encodeURIComponent(code)}`);
      const data = await res.json().catch(() => ({}));
      const p = data.product;
      if (res.ok && p) {
        onDetected({
          product_id: p.product_id,
          nombre: p.nombre || '',
          marca: p.marca || '',
          categoria: 'otros',
          unidad: 'g',
          cantidad: '',
          nutricion: p.nutricion
            ? { kcal: p.nutricion.kcal, prot: p.nutricion.prot, carb: p.nutricion.carb, gras: p.nutricion.gras }
            : {},
          confianza: p.confianza || 'verified',
          imagen: p.imagen || '',
          codigo: code,
        });
        return;
      }
      // Sin match → dejamos que lo agregue manual, con el código anotado.
      setPhase('notfound');
    } catch (e) {
      setErrText(String(e?.message || e));
      setPhase('error');
    }
  };

  const startCamera = async () => {
    if (!hasCamera) { setPhase('unsupported'); return; }
    if (!hasDetector) { setPhase('unsupported'); return; } // sin decoder → entrada manual
    stoppedRef.current = false;
    setPhase('init');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setPhase('scanning');
      const detector = new window.BarcodeDetector({ formats: FORMATS });
      const tick = async () => {
        if (stoppedRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length) { lookup(codes[0].rawValue); return; }
        } catch {
          // frame ilegible: seguir intentando
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') setPhase('denied');
      else { setErrText(String(err?.message || err)); setPhase('error'); }
    }
  };

  useEffect(() => {
    startCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = () => {
    const code = manual.replace(/[^0-9A-Za-z]/g, '');
    if (code) lookup(code);
  };

  // Bloque de entrada manual (fallback y "no soportado").
  const ManualEntry = ({ title }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <p className="c-subtitle" style={{ margin: 0 }}>{title}</p>
      <div className="field">
        <label htmlFor="scan-code">Código de barras</label>
        <input id="scan-code" type="text" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="p. ej. 7501055310333" />
      </div>
      <button type="button" className="btn btn-primary" onClick={submitManual} disabled={!manual.trim()}>Buscar código</button>
      <button type="button" className="link-btn" onClick={onFallback}>‹ Otro método</button>
    </div>
  );

  if (phase === 'unsupported') return <ManualEntry title="Tu dispositivo no puede escanear aquí. Escribe el código de barras:" />;

  if (phase === 'denied') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        <p className="c-subtitle" role="alert" style={{ margin: 0 }}>
          No diste permiso a la cámara. Actívalo en los ajustes del navegador, o escribe el código.
        </p>
        <button type="button" className="btn btn-ghost" onClick={startCamera}>Reintentar cámara</button>
        <ManualEntry title="O escribe el código de barras:" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        <p className="c-subtitle" role="alert" style={{ margin: 0 }}>No pude leer el código. Inténtalo de nuevo.</p>
        <button type="button" className="btn btn-ghost" onClick={startCamera}>Reintentar</button>
        <button type="button" className="link-btn" onClick={onFallback}>‹ Otro método</button>
      </div>
    );
  }

  if (phase === 'notfound') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        <p className="c-subtitle" style={{ margin: 0 }}>No encontré ese producto en el catálogo. Prueba con la etiqueta o agrégalo a mano.</p>
        {onUseMethod && (
          <button type="button" className="btn btn-primary" onClick={() => onUseMethod('photo')}>Foto de etiqueta</button>
        )}
        <button type="button" className="btn btn-ghost" onClick={() => onDetected({ confianza: 'user', codigo: manual })}>Agregar manual</button>
        <button type="button" className="link-btn" onClick={() => { setPhase('init'); startCamera(); }}>Escanear otro</button>
        <button type="button" className="link-btn" onClick={onFallback}>‹ Otro método</button>
      </div>
    );
  }

  // scanning / init / looking → preview con guía de encuadre
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-2)' }}>
        <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para escanear" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {/* Guía de encuadre */}
        <div aria-hidden="true" style={{ position: 'absolute', inset: '22% 12%', border: '2px solid var(--brand)', borderRadius: 'var(--r-md)', boxShadow: '0 0 0 100vmax rgba(0,0,0,0.28)' }} />
        <div aria-hidden="true" style={{ position: 'absolute', left: '12%', right: '12%', top: '50%', height: 2, background: 'var(--brand)', opacity: 0.9 }} />
      </div>
      <p className="c-subtitle" aria-live="polite" style={{ margin: 0, textAlign: 'center' }}>
        {phase === 'looking' ? 'Buscando el producto…' : 'Apunta al código de barras'}
      </p>
      <button type="button" className="link-btn" onClick={onFallback}>‹ Otro método</button>
    </div>
  );
}
