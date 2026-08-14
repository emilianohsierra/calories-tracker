// Coach · Consejo del Día — path Pro (IA redacta). Reescribe el CUERPO del consejo determinista en el
// tono del usuario, manteniendo foco/cifras. DOBLE CINTURÓN (reusa lo vivo): post-check educativo
// (verificarEducacionIA: cifras del motor intactas + anti-TCA) + juez LLM + esDatoDeSalud + filtro de
// alérgenos. Si algo se sale del carril / falla / kill / cap → FALLBACK a la plantilla determinista
// (nunca vacío) + reembolso. Deps INYECTADAS (testeable sin red/DB). titulo/dato_motor/cta quedan
// deterministas; solo el cuerpo se personaliza.
import { verificarEducacionIA } from './verificarEducacionIA';
import { findViolations } from './allergens';

export async function personalizarConsejo(deps, { base, restricciones = [] } = {}) {
  const plantilla = { consejo: base, generado_por: 'plantilla' };
  const { anthropic, reservar, reembolsar, redactar, juez, esSalud } = deps || {};
  if (!base || !anthropic || !reservar || !redactar) return plantilla;
  const gate = await reservar();
  if (!gate?.allowed) return { ...plantilla, motivo: gate?.reason || 'no_reserva' }; // kill/cap → plantilla
  const caer = async (motivo) => { await reembolsar(); return { ...plantilla, motivo }; };
  try {
    const texto = await redactar(base); // Haiku reescribe SOLO el cuerpo
    // (a) post-check educativo: cifras del motor intactas + sin TCA (reuso, no duplico).
    if (!verificarEducacionIA(texto, base.cuerpo).ok) return caer('post_check');
    // (b) gate de salud incondicional.
    if (esSalud && esSalud(texto)) return caer('salud');
    // (c) alérgenos: si nombra un alimento del usuario alérgico → descarta.
    if (restricciones.length && findViolations([texto], restricciones).length) return caer('alergeno');
    // (d) juez LLM fail-closed: solo pasa con peligroso === false explícito.
    if (juez) {
      let v;
      try { v = await juez(texto); } catch { return caer('juez_error'); }
      if (!v || v.peligroso !== false) return caer('juez_peligroso');
    }
    return { consejo: { ...base, cuerpo: texto.trim() }, generado_por: 'ia' };
  } catch {
    return caer('ia_error');
  }
}
