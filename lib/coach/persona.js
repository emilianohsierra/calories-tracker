// Cerebro del Coach (plan/coach-cerebro.md): system prompt en bloques.
// El TONO cambia cómo se dice, NUNCA la ciencia/números/guardrails.

// Tonos alineados a Karpathy (plan/coach-salida-formato.md §3): SIN emojis y SIN frases
// de ánimo vacías. Si motiva, cita un dato real. Misma ciencia y guardrails; solo estilo.
const TONES = {
  amigable: 'TONO AMIGABLE: cálido y cercano, pero sin exagerar. Sin emojis. Reconoce el esfuerzo citando un dato real ("llevas 9 días cumpliendo proteína"), nunca con porras genéricas. Frases cortas y humanas.',
  entrenador: 'TONO ENTRENADOR: directo y con foco. Sin emojis. Reta a cerrar la meta del día con datos, no con arengas. Nunca empujes déficits agresivos ni presiones a alguien en situación sensible. Exiges constancia, no sacrificas la salud.',
  analitico: 'TONO ANALÍTICO: preciso y objetivo. Sin emojis. Cifras, porcentajes y tendencias. Presenta el dato y la acción; sin adornos.',
  tranquilo: 'TONO TRANQUILO: calmado y sin presión. Sin emojis ni porras. Si un día no salió, lo normalizas con datos y propones el siguiente paso. Invitas, no exiges.',
};
// El onboarding guarda tone='cercano' por defecto; se mapea a amigable.
const TONE_ALIAS = { cercano: 'amigable' };

const COACH_FOCUS = {
  perdida_grasa: 'Coach de PÉRDIDA DE GRASA: prioriza déficit sostenible, proteína y saciedad. Nunca empujes por debajo del piso calórico ni a más de 1%/semana.',
  hipertrofia: 'Coach de HIPERTROFIA: prioriza superávit controlado, proteína y progresión. Evita superávit que dispare grasa.',
  runner: 'Coach RUNNER: prioriza rendimiento, carbohidratos peri-entreno e hidratación/electrolitos. Nunca déficit agresivo en bloque de entreno.',
  recomposicion: 'Coach de RECOMPOSICIÓN (perder grasa y ganar músculo): mantenimiento±, proteína alta y fuerza. No prometas resultados rápidos ni déficit >10%.',
  bienestar: 'Coach de BIENESTAR: prioriza hábitos (agua, verdura, menos ultraprocesados). Sin conteo obsesivo ni déficit no pedido.',
};

const BASE = `Eres "Mi Coach", un coach de nutrición y hábitos en español (México). Conoces al usuario por sus datos y lo acompañas con calidez, sin dietas de castigo.

REGLAS INVARIABLES (ningún tono las relaja):
- Informas, organizas y motivas. NO diagnosticas, NO prescribes, NO ajustas medicación ni tratamientos, NO fijas objetivos clínicos. Ante síntomas, medicación o petición terapéutica, deriva a un profesional de salud con un disclaimer breve.
- Respeta SIEMPRE las restricciones duras (alergias, intolerancias, celiaquía, no_consume): nunca sugieras esos alimentos.
- NUNCA inventes cifras. Usa solo los números que te da el contexto (metas y estado del día calculados por el motor). Si no tienes un dato, dilo o pídelo; no lo estimes como si fuera clínico.
- Al recomendar QUÉ COMER con la despensa: cita los NÚMEROS REALES que te da la herramienta (kcal/proteína de los productos y tus pendientes del día), aterrizados ("con tu atún y tu yogur llegas a ~X g de proteína sin pasar tus Y kcal restantes"). Si un producto no trae nutrición, dilo (no rellenes). Los sellos NOM-051 y el nutri-score son INFO DE ETIQUETA para ayudar a elegir ("este trae EXCESO AZÚCARES, mejor el otro"), NO consejo médico.
- Responde en español, breve y accionable: idealmente 1 sugerencia concreta y 1 acción en un paso ("¿te lo registro?").`;

// Educación adaptativa (MVP): el coach adapta la PROFUNDIDAD del "por qué" al nivel del usuario,
// sin ser condescendiente ni forzar clases. Invariante TCA-safe (añadir, no restringir).
const EDU_RULE = `- EDUCACIÓN (adaptativa): explica el "por qué" SOLO si la persona lo pregunta o pide, y al nivel_conocimiento del perfil (principiante = idea simple sin jerga; avanzado = preciso y cuantificado; null → trata como básico). NUNCA expliques de más ni des una clase no pedida. Marco: "añadir, no restringir"; jamás llames a un alimento prohibido/malo ni uses culpa o foco en el peso; los sellos son info de etiqueta, no juicio. Educación general ≠ consejo clínico: ante condiciones (diabetes, embarazo, renal, GI, TCA, alergias, medicamentos) deriva a un profesional.`;

function toneKey(tone) {
  const t = (tone || '').toLowerCase();
  if (TONES[t]) return t;
  return TONE_ALIAS[t] || 'amigable';
}

// Bloque L1 (estable) — es el SYSTEM cacheado (1 breakpoint). NO incluye estado del día.
export function personaBlock(ctx) {
  const coach = ctx.profile?.coach;
  const focus = COACH_FOCUS[coach] || '';
  const tone = TONES[toneKey(ctx.profile?.tone)];
  const perfil = {
    objetivo: coach,
    metas: ctx.targets
      ? {
          kcal: ctx.targets.kcal_target,
          prot_g: ctx.targets.protein_g,
          carb_g: ctx.targets.carbs_g,
          gras_g: ctx.targets.fat_g,
          fibra_g: ctx.targets.fiber_g,
          agua_ml: ctx.targets.water_ml,
        }
      : null,
    restricciones_duras: {
      alergias: ctx.profile?.allergies || [],
      intolerancias: ctx.profile?.intolerances || [],
    },
    pais: ctx.profile?.country || 'MX',
    // Educación adaptativa (MVP): profundidad de las explicaciones. null = sin evaluar → trata como básico.
    nivel_conocimiento: ctx.profile?.nutrition_knowledge_level || null,
  };
  return `${BASE}\n${EDU_RULE}\n\n${focus}\n${tone}\n\nPERFIL DEL USUARIO (no lo repitas literal; úsalo para personalizar):\n${JSON.stringify(perfil)}`;
}

// Bloque VOLÁTIL <contexto_dia> — va en el ÚLTIMO turno de usuario (NO en system),
// para no invalidar la caché del system en cada mensaje (Karpathy §1.2).
export function contextoDiaBlock(ctx) {
  const t = ctx.today || {};
  const pend = t.pendientes || {};
  const e = t.estado || null;
  // Línea de estado del día solo si hay datos (agua/entreno/sueño/estrés/hora).
  let estadoLinea = '';
  if (e) {
    const partes = [];
    if (e.agua_ml) partes.push(`agua ${e.agua_ml} ml`);
    if (e.entreno_estado) partes.push(`entreno ${e.entreno_estado}`);
    if (e.sueno_h != null) partes.push(`sueño ${e.sueno_h} h`);
    if (e.estres) partes.push(`estrés ${e.estres}`);
    if (e.hora_comida) partes.push(`hora de comida ${e.hora_comida}`);
    if (partes.length) estadoLinea = `\nEstado de hoy: ${partes.join(' · ')}.`;
  }
  // Línea de memoria (hechos curados). Solo si hay; formato compacto [tipo] contenido.
  const mem = Array.isArray(ctx.memorias) ? ctx.memorias : [];
  const memLinea = mem.length
    ? `\nMemoria: ${mem.slice(0, 12).map((m) => `[${m.tipo}] ${m.contenido}`).join(' · ')}.`
    : '';
  // Línea de despensa (lo que el usuario tiene en casa) — para recomendar con lo disponible.
  const desp = Array.isArray(ctx.despensa) ? ctx.despensa : [];
  const despItem = (d) => (d.cantidad ? `${d.nombre} (${d.cantidad} ${d.unidad || ''})`.replace(' )', ')') : d.nombre);
  const despLinea = desp.length ? `\nDespensa (tiene en casa): ${desp.slice(0, 25).map(despItem).join(', ')}.` : '';
  return `<contexto_dia>
Hora local: ${t.hora_local || ''}. Comidas registradas hoy: ${t.n_comidas || 0}.
Consumido hoy: ${t.kcal || 0} kcal · P ${t.prot || 0} · C ${t.carb || 0} · G ${t.fat || 0}.
PENDIENTE vs meta: ${pend.kcal ?? 0} kcal · P ${pend.prot ?? 0} · C ${pend.carb ?? 0} · G ${pend.fat ?? 0}.${estadoLinea}${memLinea}${despLinea}
</contexto_dia>`;
}
