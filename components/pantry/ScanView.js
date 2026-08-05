'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { productToDraft } from '@/lib/pantry/productSearch';

// Escanear código de barras. Cámara EN VIVO por dos motores, de mayor a menor soporte:
//  - BarcodeDetector nativa (Android/Chrome) → rápida.
//  - @zxing/browser EN VIVO (dynamic import) sobre el MISMO stream → sirve en iOS Safari, Firefox y
//    cualquier navegador SIN BarcodeDetector (antes esos caían solo a foto fija, poco fiable).
//  - TOMAR FOTO del código (zxing) y ENTRADA MANUAL como últimos recursos.
// Al leer → GET /api/pantry/search?code= → precarga producto (confianza del catálogo).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];

export default function ScanView({ onDetected, onFallback, onUseMethod }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const stoppedRef = useRef(false);
  const zxingControlsRef = useRef(null);
  const photoRef = useRef(null);
  const [phase, setPhase] = useState('init'); // init | scanning | photo | denied | looking | notfound | error | nocode
  const [manual, setManual] = useState('');
  const [errText, setErrText] = useState('');

  const hasCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  const stopCamera = () => {
    stoppedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    try { zxingControlsRef.current?.stop(); } catch { /* noop */ }
    zxingControlsRef.current = null;
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
      if (!res.ok) {
        // 5xx/4xx real del servidor → reintento, no "no encontrado" engañoso.
        setErrText(`Error ${res.status}`);
        setPhase('error');
        return;
      }
      // Shape nuevo {match, producto}; alias legacy data.product por compat.
      const p = data.producto || data.product;
      if (p) {
        onDetected({ ...productToDraft(p), codigo: p.codigo || code });
        return;
      }
      setPhase('notfound'); // miss → ofrecer etiqueta/manual
    } catch (e) {
      setErrText(String(e?.message || e));
      setPhase('error');
    }
  };

  // Decodificar el código desde una FOTO (iOS y cualquier dispositivo) con @zxing.
  const onPhotoPicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhase('looking');
    setErrText('');
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser'); // code-split
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      const code = result?.getText?.();
      if (code) { lookup(code); return; }
      setPhase('nocode');
    } catch {
      setPhase('nocode'); // no se detectó un código legible en la foto
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Formatos que la BarcodeDetector del dispositivo REALMENTE soporta (algunas Androids lanzan si
  // se pide uno no soportado). Devuelve el subconjunto usable o null → entonces usamos zxing.
  const detectorFormats = async () => {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      const f = FORMATS.filter((x) => sup.includes(x));
      return f.length ? f : null;
    } catch {
      return null;
    }
  };

  // Bucle nativo BarcodeDetector sobre el <video> ya reproduciéndose.
  const runDetectorLoop = (formats) => {
    const detector = new window.BarcodeDetector({ formats });
    const tick = async () => {
      if (stoppedRef.current || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length && codes[0].rawValue) { lookup(codes[0].rawValue); return; }
      } catch {
        // frame ilegible: seguir intentando
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  // Bucle EN VIVO con @zxing sobre el MISMO <video>/stream (iOS Safari, Firefox, sin BarcodeDetector).
  const runZxingLoop = async (video) => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser'); // code-split
    const reader = new BrowserMultiFormatReader();
    // decodeFromVideoElement decodifica frames del elemento que ya está reproduciendo NUESTRO stream
    // (no re-pide cámara). El callback recibe NotFound por frame vacío → solo actuamos ante result.
    zxingControlsRef.current = await reader.decodeFromVideoElement(video, (result) => {
      if (result && !stoppedRef.current) {
        const code = result.getText?.();
        if (code) lookup(code);
      }
    });
  };

  const startCamera = async () => {
    stoppedRef.current = false;
    setErrText('');
    if (!hasCamera) { setPhase('photo'); return; } // sin getUserMedia → foto/manual
    setPhase('init');
    try {
      // Un solo getUserMedia para ambos motores (permiso + manejo de rechazo unificado).
      // facingMode 'ideal' (no estricto): si no hay cámara trasera, no rechaza → usa la disponible.
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      if (stoppedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; } // desmontado mientras pedía permiso
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stopCamera(); setPhase('photo'); return; }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true'); // iOS: no ir a pantalla completa
      await video.play().catch(() => {});
      setPhase('scanning');

      const formats = hasDetector ? await detectorFormats() : null;
      if (formats) runDetectorLoop(formats);
      else await runZxingLoop(video); // iOS / sin BarcodeDetector usable
    } catch (err) {
      // Rechazo de permiso → pantalla amable con reintento + foto/manual (nunca en blanco).
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError' || err?.name === 'NotFoundError') {
        setPhase('denied');
      } else {
        setErrText(String(err?.message || err));
        setPhase('photo'); // cualquier otro fallo de cámara viva → foto/manual (también decodifica)
      }
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

  const PhotoAndManual = ({ title }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      {title && <p className="c-subtitle" style={{ margin: 0 }}>{title}</p>}
      <button type="button" className="btn btn-primary" onClick={() => photoRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="camera" size={18} /> Tomar foto del código
      </button>
      <div className="field">
        <label htmlFor="scan-code">O escribe el código</label>
        <input id="scan-code" type="text" inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="p. ej. 7501055310333" />
      </div>
      <button type="button" className="btn btn-ghost" onClick={submitManual} disabled={!manual.trim()}>Buscar código</button>
      <button type="button" className="link-btn" onClick={onFallback}>‹ Otro método</button>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhotoPicked} />
    </div>
  );

  if (phase === 'photo') return <PhotoAndManual title="Toma una foto del código de barras o escríbelo:" />;

  if (phase === 'denied') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        <p className="c-subtitle" role="alert" style={{ margin: 0 }}>No pudimos usar la cámara (permiso denegado o sin cámara disponible). Puedes reintentar, tomar una foto del código o escribirlo.</p>
        <button type="button" className="btn btn-ghost" onClick={startCamera}>Reintentar cámara</button>
        <PhotoAndManual />
      </div>
    );
  }

  if (phase === 'error' || phase === 'nocode') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        <p className="c-subtitle" role="alert" style={{ margin: 0 }}>
          {phase === 'nocode' ? 'No detecté un código en la foto. Acércate y que quede enfocado.' : 'No pude leer el código. Inténtalo de nuevo.'}
        </p>
        <PhotoAndManual />
      </div>
    );
  }

  if (phase === 'notfound') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
        <p className="c-subtitle" style={{ margin: 0 }}>No encontré ese producto en el catálogo. Prueba con la etiqueta o agrégalo a mano.</p>
        {onUseMethod && <button type="button" className="btn btn-primary" onClick={() => onUseMethod('photo')}>Foto de etiqueta</button>}
        <button type="button" className="btn btn-ghost" onClick={() => onDetected({ confianza: 'user', codigo: manual })}>Agregar manual</button>
        <button type="button" className="link-btn" onClick={() => setPhase('photo')}>Escanear otro</button>
        <button type="button" className="link-btn" onClick={onFallback}>‹ Otro método</button>
      </div>
    );
  }

  // scanning / init / looking → preview de cámara viva con guía + opción de foto
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-2)' }}>
        <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para escanear" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: '22% 12%', border: '2px solid var(--brand)', borderRadius: 'var(--r-md)', boxShadow: '0 0 0 100vmax rgba(0,0,0,0.28)' }} />
        <div aria-hidden="true" style={{ position: 'absolute', left: '12%', right: '12%', top: '50%', height: 2, background: 'var(--brand)', opacity: 0.9 }} />
      </div>
      <p className="c-subtitle" aria-live="polite" style={{ margin: 0, textAlign: 'center' }}>
        {phase === 'looking' ? 'Buscando el producto…' : 'Apunta al código de barras'}
      </p>
      <button type="button" className="btn btn-ghost" onClick={() => { stopCamera(); setPhase('photo'); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Icon name="camera" size={16} /> Mejor tomar una foto del código
      </button>
      <button type="button" className="link-btn" onClick={onFallback}>‹ Otro método</button>
    </div>
  );
}
