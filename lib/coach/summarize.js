// Coach · Historial — RESUMEN PROGRESIVO (cierra el GAP 2: coach_summaries se leía pero nunca se
// escribía). Cuando el hilo supera la ventana verbatim, condensamos SOLO el DELTA (los mensajes
// aún-no-resumidos que quedan por DEBAJO de la ventana reciente) con Haiku, hacemos merge con el
// resumen previo y avanzamos upto_message_id. Disparo PEREZOSO (cada MIN_DELTA_RESUMIR mensajes de
// overflow) → un turno normal sin overflow NO llama al modelo (0 gasto extra).
//
// El resumen es CONTEXTO INTERNO del coach (memoria de la conversación): no es save_memory ni pasa
// por esDatoDeSalud, y NO alimenta recomendaciones de comida por sí solo (esas siguen filtradas por
// safety.js). Mantiene el mismo encuadre (sin culpa/restricción/peso).

export const VENTANA_RECIENTE = 14;    // turnos verbatim que SIEMPRE quedan fuera del resumen (= HISTORY_LIMIT)
export const MIN_DELTA_RESUMIR = 8;    // nº de mensajes de overflow para disparar (perezoso)

// PURA y testeable: dado el hilo cronológico (ASC), el upto_message_id ya resumido y el tamaño de la
// ventana reciente, devuelve { delta, nuevoUpto }.
//   delta = mensajes AÚN NO resumidos (después de uptoId) y por DEBAJO de la ventana reciente.
//   nuevoUpto = id del último mensaje del delta (nueva marca de agua), o el uptoId previo si no hay.
export function seleccionarDelta(mensajes, uptoId, ventana = VENTANA_RECIENTE) {
  const arr = Array.isArray(mensajes) ? mensajes : [];
  const total = arr.length;
  const finVentana = Math.max(0, total - ventana); // índice donde arranca la ventana reciente (exclusivo para el delta)
  const uptoIdx = uptoId ? arr.findIndex((m) => m.id === uptoId) : -1;
  const start = uptoIdx + 1;                        // primer mensaje no resumido
  const delta = start < finVentana ? arr.slice(start, finVentana) : [];
  const nuevoUpto = delta.length ? delta[delta.length - 1].id : (uptoId || null);
  return { delta, nuevoUpto };
}

// Convierte los turnos del delta a texto plano para el prompt del resumidor.
function deltaATexto(delta) {
  return (delta || [])
    .map((m) => `${m.role === 'user' ? 'Usuario' : 'Coach'}: ${textoDe(m.content)}`)
    .join('\n');
}
// El content del asistente se guarda como JSON de la card; extraemos el titular/texto legible.
function textoDe(content) {
  const s = String(content ?? '');
  if (!s.startsWith('{')) return s;
  try {
    const o = JSON.parse(s);
    return o.titular || o.mensaje || (Array.isArray(o.bloques) ? o.bloques.map((b) => b.texto || '').join(' ') : '') || s;
  } catch {
    return s;
  }
}

// Llama a Haiku para condensar (resumen previo + delta) en UN resumen de memoria. Devuelve texto o
// lanza si la API falla. El caller hace reserva/reembolso/fallback.
export async function redactarResumen({ anthropic, model, resumenPrevio, delta }) {
  const system =
    'Eres la memoria de un coach nutricional. Condensa la conversación en UN resumen breve para que el ' +
    'coach recuerde al usuario entre sesiones. Incluye: preferencias, rechazos, compromisos, temas hablados o ' +
    'enseñados, y decisiones. REGLAS: integra el resumen previo con los mensajes nuevos en un solo texto; ' +
    'español, tercera persona, máximo 120 palabras; NO incluyas las cifras del día (kcal/macros puntuales, esas ' +
    'las da el motor); mismo encuadre saludable (sin culpa, sin restricción, sin foco en el peso). Devuelve SOLO el resumen.';
  const user =
    `RESUMEN PREVIO (puede estar vacío):\n${resumenPrevio || '(vacío)'}\n\n` +
    `MENSAJES NUEVOS A INTEGRAR:\n${deltaATexto(delta)}`;
  const r = await anthropic.messages.create({
    model,
    max_tokens: 300,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const parts = Array.isArray(r?.content) ? r.content : [];
  return parts.map((p) => (p?.type === 'text' ? p.text : '')).join('').trim();
}

// ORQUESTA el mantenimiento del resumen con dependencias INYECTADAS (testeable sin red/DB):
//   deps.leerMensajes()  → hilo ASC [{id, role, content}]
//   deps.leerUpto()      → upto_message_id previo | null
//   deps.leerResumen()   → resumen previo | ''
//   deps.reservar()      → { allowed, reason }  (metering)
//   deps.reembolsar()    → revierte la reserva
//   deps.redactar(prev, delta) → texto del nuevo resumen (Haiku)
//   deps.guardar(resumen, nuevoUpto) → upsert coach_summaries
// Devuelve { via:'resumen'|'skip', motivo? }. NUNCA lanza (degrada a skip → solo-cola, deploy-safe).
export async function mantenerResumen(deps, { ventana = VENTANA_RECIENTE, minDelta = MIN_DELTA_RESUMIR } = {}) {
  try {
    const mensajes = await deps.leerMensajes();
    const upto = await deps.leerUpto();
    const { delta, nuevoUpto } = seleccionarDelta(mensajes, upto, ventana);
    if (delta.length < minDelta) return { via: 'skip', motivo: 'sin_overflow' }; // turno normal → 0 IA
    const gate = await deps.reservar();
    if (!gate?.allowed) return { via: 'skip', motivo: gate?.reason || 'no_reserva' }; // kill/cap → 0 llamada al modelo
    try {
      const previo = await deps.leerResumen();
      const nuevo = await deps.redactar(previo, delta);
      if (!nuevo || !nuevo.trim()) { await deps.reembolsar(); return { via: 'skip', motivo: 'vacio' }; }
      await deps.guardar(nuevo.trim(), nuevoUpto);
      return { via: 'resumen', upto: nuevoUpto };
    } catch {
      await deps.reembolsar();
      return { via: 'skip', motivo: 'error' };
    }
  } catch {
    return { via: 'skip', motivo: 'error_lectura' }; // deploy-safe: sin tabla / fallo → solo-cola
  }
}
