import { useEffect, useRef } from 'react';

// Accesibilidad de modales, extraída del patrón ya probado en UpgradeModal:
//  - foco inicial al diálogo (anuncia su aria-label; el contenedor debe tener tabIndex={-1})
//  - trampa de foco con Tab / Shift+Tab
//  - cierre con Escape (con guard opcional, p.ej. no cerrar durante un checkout)
//  - scroll-lock del body
//  - retorno de foco al elemento previo al desmontar
// Soporta modales ANIDADOS: sólo el modal SUPERIOR de la pila responde a Escape/Tab, y el
// scroll-lock se mantiene mientras haya al menos un modal abierto.
//
// Uso: const ref = useModalA11y(onClose); …  <div className="modal" ref={ref} tabIndex={-1} …>
//      Guard opcional: useModalA11y(onClose, () => !busyRef.current)  // false → no cierra
let stack = [];

export function useModalA11y(onClose, closeGuard) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  const guardRef = useRef(closeGuard);
  onCloseRef.current = onClose;
  guardRef.current = closeGuard;

  useEffect(() => {
    const el = ref.current;
    const id = {};
    const prevActive = typeof document !== 'undefined' ? document.activeElement : null;
    if (stack.length === 0 && typeof document !== 'undefined') document.body.style.overflow = 'hidden';
    stack.push(id);

    const focusables = () =>
      el
        ? Array.from(el.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          ))
        : [];

    el?.focus?.(); // foco inicial al diálogo (A8)

    const onKey = (e) => {
      if (stack[stack.length - 1] !== id) return; // sólo el modal superior
      if (e.key === 'Escape') {
        if (guardRef.current && !guardRef.current()) return; // guard (p.ej. busy)
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); el.focus?.(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack = stack.filter((x) => x !== id);
      if (stack.length === 0 && typeof document !== 'undefined') document.body.style.overflow = '';
      prevActive?.focus?.();
    };
  }, []);

  return ref;
}
