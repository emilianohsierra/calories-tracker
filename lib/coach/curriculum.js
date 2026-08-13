// Coach · Educación — CURRICULUM (config versionada, NO tabla). Contenido de Karpathy
// (plan/educacion-nutricional-cerebro.md). Se edita con PRs (revisión de Karpathy). Es DATA + unos
// selectores puros; deploy-safe (sin la columna de nivel, todo cae a 'basico').
//
// PRINCIPIOS (Karpathy): enseñar solo lo necesario para el nivel; contenido correcto basado en
// evidencia, contexto México; SIN mitos; NO demonizar alimentos; TCA-safe (añadir, no restringir).
// ⚠️ Los textos marcados con [QA-Karpathy] extrapolan del doc y deben revisarse en QA de contenido.

export const NIVELES = ['principiante', 'basico', 'intermedio', 'avanzado'];
export const NIVEL_DEFAULT = 'basico';
export const idxNivel = (n) => Math.max(0, NIVELES.indexOf(NIVELES.includes(n) ? n : NIVEL_DEFAULT));

// ── Enseñanza adaptativa: MISMA idea, 4 profundidades (Karpathy §4). El motor elige por nivel. ──
// 'deficit' es verbatim del doc; 'proteina'/'calidad' se autoran fieles al doc (marcados QA).
export const EXPLICACIONES = {
  deficit: {
    concepto: 'deficit',
    titulo: 'Por qué un déficit',
    principiante: 'Si tu cuerpo gasta cierta energía y comes un poco menos, usa tu grasa guardada para completar. Eso es un déficit. No es pasar hambre, es comer un poco menos de forma sostenible.',
    basico: 'Déficit = comer menos calorías de las que gastas (tu mantenimiento). Con eso bajas grasa; mantén la proteína alta para no perder músculo.',
    intermedio: 'Un déficit del 15–20% de tu TDEE te hace perder ~0.5–1% de peso por semana. Prioriza proteína (~1.8–2.2 g/kg) para preservar masa magra; los carbohidratos sostienen tu entrenamiento.',
    avanzado: 'El balance energético es el driver; a un déficit del 15–20% del TDEE, la partición la modulan proteína alta (preservación de MLG), entrenamiento de fuerza y adherencia. Los diet breaks periódicos mitigan la adaptación metabólica.',
  },
  proteina: {
    concepto: 'proteina',
    titulo: 'Por qué priorizamos la proteína',
    principiante: 'La proteína te llena más tiempo y cuida tu músculo mientras bajas grasa. Por eso te la priorizamos.',
    basico: 'La proteína hace dos cosas clave: te sacia y protege tu músculo mientras bajas grasa. Está en huevo, atún, pollo, frijol, lácteos.',
    intermedio: 'Más proteína preserva masa magra en déficit, sacia (gestiona el hambre) y tiene mayor efecto térmico (TEF). Rango útil ~1.8–2.2 g/kg cuando bajas grasa. [QA-Karpathy]',
    avanzado: 'La proteína alta protege la MLG en déficit (síntesis proteica + señalización), maximiza saciedad y TEF; con techo práctico ~2.2 g/kg — más no da más músculo. La distribución en 3–4 tomas es un afinado menor frente al total diario. [QA-Karpathy]',
  },
  macros: {
    concepto: 'macros',
    titulo: 'Cómo funcionan tus macros',
    principiante: 'Tus macros son proteína, carbohidratos y grasa: de ahí sale tu energía y con qué se mantiene tu cuerpo. Tu meta reparte esas tres para tu objetivo.',
    basico: 'Los macronutrientes (proteína, carbohidratos, grasa) aportan las calorías y sus funciones: la proteína cuida el músculo y sacia, los carbohidratos son combustible, la grasa es hormonal. Tu meta ya los reparte.',
    intermedio: 'Tus calorías vienen de tres macros: proteína (~4 kcal/g, preserva masa magra y sacia), carbohidratos (~4 kcal/g, combustible del entrenamiento) y grasa (~9 kcal/g, mínimo hormonal). El reparto lo fija tu objetivo. [QA-Karpathy]',
    avanzado: 'El total calórico gobierna el peso; el reparto de macros modula composición y rendimiento: proteína alta preserva masa magra y aporta saciedad/TEF, los carbohidratos sostienen el trabajo intenso, la grasa cubre lo hormonal. Ajustas dentro de tus calorías. [QA-Karpathy]',
  },
  calidad_sin_culpa: {
    concepto: 'calidad_sin_culpa',
    titulo: 'Calidad sin culpa',
    principiante: 'No hay alimentos prohibidos. Un taco no arruina nada; lo que cuenta es tu patrón general. Un ajuste fácil: agrega verdura y proteína, no quites lo que te gusta.',
    basico: 'La calidad se juzga por tu patrón general, no por un alimento aislado. Un ultraprocesado ocasional en una buena dieta no es problema. Marco: añadir (verdura, proteína, agua), no prohibir.',
    intermedio: 'La densidad nutricional y el patrón mandan sobre el alimento aislado. Los sellos NOM-051 marcan EXCESO de calorías, azúcares, grasas saturadas, grasas trans o sodio — son señal de moderación, no un veneno. En México: maíz nixtamalizado y frijol aportan fibra; swaps dentro de tu comida, no contra ella. [QA-Karpathy]',
    avanzado: 'La calidad se evalúa por patrón, contexto y densidad nutricional, no por dogma NOVA. Los sellos son heurística de etiqueta frontal, no juicio moral; el problema es el azúcar añadido/sodio en exceso sostenido, no un alimento puntual. Individualiza sobre la cultura alimentaria (comida corrida, tacos). [QA-Karpathy]',
  },
};

// ── Micro-lecciones + quiz (MVP: 3). Formato corto: idea + por qué + acción a SUS datos + quiz. ──
// `cuerpo(ctx)` inyecta cifras REALES del motor (nunca inventa). El quiz refuerza el "por qué".
export const LECCIONES = {
  proteina: {
    concepto: 'proteina',
    titulo: 'Por qué priorizamos tu proteína',
    // ancla a datos reales: proteína pendiente del día (del motor).
    cuerpo: ({ protConsumida, protObjetivo } = {}) => {
      const base = 'La proteína hace dos cosas clave: te mantiene lleno más tiempo y protege tu músculo mientras bajas grasa. Por eso te la priorizamos.';
      if (protObjetivo > 0 && protConsumida != null) {
        const falta = Math.max(0, Math.round(protObjetivo - protConsumida));
        if (falta > 0) return `${base} Hoy llevas ${Math.round(protConsumida)} de ${Math.round(protObjetivo)} g — te faltan ${falta} g; una lata de atún o unos huevos te acercan.`;
      }
      return base;
    },
    quiz: {
      pregunta: '¿Para qué sirve sobre todo la proteína cuando bajas grasa?',
      opciones: ['Darte energía rápida', 'Preservar músculo y saciar', 'Hidratarte'],
      correcta: 1,
      feedback: 'Preservar músculo y saciar: por eso la priorizamos en déficit.',
    },
  },
  deficit: {
    concepto: 'deficit',
    titulo: 'Bajar grasa no es pasar hambre',
    cuerpo: ({ kcalObjetivo } = {}) => {
      const base = 'Bajar grasa no es pasar hambre: es comer un poco menos de lo que gastas, de forma sostenible. Tu cuerpo completa con la grasa guardada.';
      return kcalObjetivo > 0 ? `${base} Tu meta de hoy (${Math.round(kcalObjetivo)} kcal) ya está calculada para eso, sin extremos.` : base;
    },
    quiz: {
      pregunta: 'Un déficit sano es…',
      opciones: ['No comer', 'Comer un poco menos de lo que gastas', 'Solo ensaladas'],
      correcta: 1,
      feedback: 'Comer un poco menos de lo que gastas, sostenible — no privarte.',
    },
  },
  calidad_sin_culpa: {
    concepto: 'calidad_sin_culpa',
    titulo: 'Calidad sin culpa (a la mexicana)',
    cuerpo: () => 'No hay alimentos prohibidos. Un taco no arruina nada; lo que cuenta es tu patrón general. ¿Un ajuste fácil? Agrega verdura y proteína a tus comidas — no quites lo que te gusta.',
    quiz: {
      pregunta: '¿Qué importa más para tu salud?',
      opciones: ['Evitar por completo un alimento', 'Tu patrón general y el contexto', 'Comer solo "natural"'],
      correcta: 1,
      feedback: 'Tu patrón general y el contexto — no un alimento aislado.',
    },
  },
};

export const CONCEPTOS_MVP = Object.keys(LECCIONES);

// ── Evaluación de nivel: 2 preguntas de verificación (Drucker: 2–4; MVP=2) con señales por banda ──
// (rúbrica determinista de Karpathy §1, anclas 0–3). El scoring vive en lib/coach/nivel.js.
// ⚠️ Las señales son un blocklist/keyword-set: Karpathy debe afinarlas en QA de contenido.
export const PREGUNTAS_NIVEL = [
  {
    id: 'deficit',
    pregunta: '¿Qué es un déficit calórico?',
    // banda 0 = idea equivocada; 1 = correcta simple; 2 = correcta con matiz; 3 = precisa/cuantifica.
    senales: {
      0: ['no comer', 'no comas', 'dejar de comer', 'saltarse', 'saltar comida', 'menos veces', 'solo ensalada', 'ayun', 'pasar hambre'],
      1: ['comer menos', 'menos de lo que', 'menos calorias', 'menos kcal', 'quemas', 'gastas'],
      2: ['tdee', 'mantenimiento', 'sostenible', 'proteina', 'musculo', 'masa magra'],
      // Fix rúbrica (Karpathy): tokens con '%' para que "como 2000 kcal" NO se clasifique avanzado
      // por el substring desnudo '20'.
      3: ['15%', '20%', '0.5', '1%', 'por ciento', 'porcentaje', 'particion', 'balance energetico'],
    },
  },
  {
    id: 'proteina',
    pregunta: '¿Para qué sirve la proteína?',
    senales: {
      0: ['energia rapida', 'engorda', 'no sirve', 'solo para gym', 'dana el rinon'],
      1: ['musculo', 'construir', 'reparar', 'crecer'],
      2: ['saciar', 'saciedad', 'llena', 'preservar', 'mantener musculo', 'bajar grasa'],
      3: ['masa magra', 'mlg', 'tef', 'efecto termico', 'g/kg', 'sintesis'],
    },
  },
];

// Conjunto de conceptos EXPLICABLES por el "¿Por qué?" (whitelist para el chip).
export const CONCEPTOS_EXPLICABLES = Object.keys(EXPLICACIONES);

// Detecta un concepto WHITELISTEADO desde texto libre (o null). Determinista. Se usa tanto en el
// cliente (para que la tarjeta mande un concepto, NO su texto) como en el server (pregunta libre).
export function conceptoDeTexto(str) {
  const t = String(str || '').toLowerCase();
  if (/(proteina|proteína)/.test(t)) return 'proteina';
  if (/(deficit|déficit|superavit|superávit|bajar de grasa|bajar grasa|adelgaz)/.test(t)) return 'deficit';
  if (/(macro|caloria|calorías|caloría|kcal)/.test(t)) return 'macros';
  if (/(sello|etiqueta|nom-?051|calidad|ultraprocesad|nutri-?score)/.test(t)) return 'calidad_sin_culpa';
  return null;
}

// Selector puro: explicación de un concepto al nivel dado (cae a 'basico' si falta).
export function explicacionDe(concepto, nivel) {
  const e = EXPLICACIONES[concepto];
  if (!e) return null;
  const n = NIVELES.includes(nivel) ? nivel : NIVEL_DEFAULT;
  return { concepto, titulo: e.titulo, texto: e[n] || e[NIVEL_DEFAULT], nivel: n };
}

// Selector puro: la lección de un concepto (o null).
export function leccionDe(concepto) {
  return LECCIONES[concepto] || null;
}
