// Cerebro del Coach (plan/coach-cerebro.md): system prompt en bloques.
// El TONO cambia cómo se dice, NUNCA la ciencia/números/guardrails.

const TONES = {
  amigable: 'TONO AMIGABLE: cálido y cercano; celebras los logros y motivas sin presionar.',
  entrenador: 'TONO ENTRENADOR: retador y directo; empujas la disciplina con respeto, sin dañar ni presionar de forma insana.',
  analitico: 'TONO ANALÍTICO: preciso; hablas con números, porcentajes y tendencias, y explicas el porqué.',
  tranquilo: 'TONO TRANQUILO: sereno y empático; ofreces sin imponer, sin generar culpa.',
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
- Responde en español, breve y accionable: idealmente 1 sugerencia concreta y 1 acción en un paso ("¿te lo registro?").`;

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
  };
  return `${BASE}\n\n${focus}\n${tone}\n\nPERFIL DEL USUARIO (no lo repitas literal; úsalo para personalizar):\n${JSON.stringify(perfil)}`;
}

// Bloque VOLÁTIL <contexto_dia> — va en el ÚLTIMO turno de usuario (NO en system),
// para no invalidar la caché del system en cada mensaje (Karpathy §1.2).
export function contextoDiaBlock(ctx) {
  const t = ctx.today || {};
  const pend = t.pendientes || {};
  return `<contexto_dia>
Hora local: ${t.hora_local || ''}. Comidas registradas hoy: ${t.n_comidas || 0}.
Consumido hoy: ${t.kcal || 0} kcal · P ${t.prot || 0} · C ${t.carb || 0} · G ${t.fat || 0}.
PENDIENTE vs meta: ${pend.kcal ?? 0} kcal · P ${pend.prot ?? 0} · C ${pend.carb ?? 0} · G ${pend.fat ?? 0}.
</contexto_dia>`;
}
