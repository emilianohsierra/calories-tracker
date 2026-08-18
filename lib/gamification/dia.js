// Gamificación V1 — OBJETIVO DEL DÍA + SIGUIENTE MEJOR ACCIÓN (§22/§23). PURO, determinista, del estado
// real (pendientes del motor). Objetivos ADITIVOS (registrar/proteína/agua/aprender), JAMÁS "comer menos".
import { RANGO } from './config';

// estado: { n_comidas, prot, protTarget, agua, aguaMeta, leccionHoy }. Devuelve objetivos con `hecho`.
export function objetivosDelDia({ n_comidas = 0, prot = null, protTarget = null, agua = null, aguaMeta = null, leccionHoy = false } = {}) {
  const objetivos = [
    { id: 'registrar', label: 'Registra una comida', hecho: Number(n_comidas) > 0, accion: 'registrar' },
  ];
  if (Number(protTarget) > 0) {
    objetivos.push({ id: 'proteina', label: `Llega a tu proteína (${Math.round(protTarget)} g)`, hecho: Number(prot) >= RANGO.PROT_META * Number(protTarget), accion: 'coach' });
  }
  if (Number(aguaMeta) > 0) {
    objetivos.push({ id: 'agua', label: 'Toma tu agua del día', hecho: Number(agua) >= Number(aguaMeta), accion: 'checkin' });
  }
  objetivos.push({ id: 'aprender', label: 'Aprende algo nuevo', hecho: !!leccionHoy, accion: 'leccion' });
  return objetivos;
}

const CTA_LABEL = { registrar: 'Registrar comida', coach: 'Ver qué comer', checkin: 'Registrar agua', leccion: 'Aprender algo', despensa: 'Ver despensa' };

// Siguiente mejor acción = el primer objetivo pendiente (§23). null si el día está completo.
export function siguienteAccion(objetivos = []) {
  const pend = (objetivos || []).find((o) => !o.hecho);
  if (!pend) return null;
  return { titulo: pend.label, cta: { label: CTA_LABEL[pend.accion] || 'Ir', accion: pend.accion } };
}

export function progresoDia(objetivos = []) {
  const total = objetivos.length;
  const hechas = objetivos.filter((o) => o.hecho).length;
  return { hechas, total };
}
