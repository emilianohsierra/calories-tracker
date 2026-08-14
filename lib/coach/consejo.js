// Coach · Consejo del Día — núcleo DETERMINISTA (0 IA). Selección de foco (Karpathy §6) + plantillas
// (plan/consejo-del-dia-plantillas.md) rellenadas con cifras del MOTOR. Sirve para el path Free y
// como voz-base/fallback del Pro. Reglas duras: AÑADIR no restringir, cero peso/culpa/médico/mitos,
// contexto MX, cifras solo del motor (slots), cinturón de alérgenos si nombra un alimento.
import { findViolations } from './allergens';

export const FOCOS = ['bienvenida', 'sin_registro', 'racha', 'timing_entreno', 'macro_pendiente', 'favorito_despensa', 'hidratacion', 'progreso'];
// Orden para desempate (variedad por índice del día).
const ORDEN = Object.fromEntries(FOCOS.map((f, i) => [f, i]));

export const OBJETIVO_LABEL = {
  perdida_grasa: 'pérdida de grasa', hipertrofia: 'hipertrofia', recomposicion: 'recomposición',
  runner: 'correr mejor', bienestar: 'bienestar',
};

// Consejo neutro ultra-seguro (no nombra ningún alimento) — último recurso si todo lo demás
// nombrara un alérgeno. Nunca vacío.
const NEUTRO = 'Suma un buen hábito hoy: registra tu próxima comida y te acompaño con el resto.';

// ── Selección de foco (determinista). Puntúa por señales del día; excluye focos de los últimos 14
//    días; gana el de mayor peso (desempate por índice del día). Estados borde (nuevo/sin registro)
//    tienen prioridad. NUNCA elige restricción/peso. ──
export function scoreFocos(ctx = {}) {
  if (ctx.esNuevo) return { bienvenida: 1000 }; // usuario sin datos → bienvenida forzada
  const s = {};
  if (!ctx.registroHoy) s.sin_registro = 50;
  if (ctx.hito_racha) s.racha = 90; else if (ctx.racha_dias >= 3) s.racha = 40;
  if (ctx.entreno_hoy) s.timing_entreno = 80;
  if (ctx.prot_ayer != null && ctx.prot_meta && ctx.prot_ayer < ctx.prot_meta * 0.85) s.macro_pendiente = 70;
  else if (ctx.prot_pendiente >= 25) s.macro_pendiente = 60;
  if (Array.isArray(ctx.despensa) && ctx.despensa.length >= 2) s.favorito_despensa = 55;
  if (ctx.agua_meta && ctx.agua_ml != null && ctx.agua_ml < ctx.agua_meta * 0.5) s.hidratacion = 45;
  if (ctx.adherencia != null && ctx.adherencia >= 70) s.progreso = 35;
  return s;
}

export function elegirFoco(ctx = {}, recientes = [], diaIdx = 0) {
  const scores = scoreFocos(ctx);
  if (scores.bienvenida) return 'bienvenida';
  const entries = Object.entries(scores);
  if (!entries.length) return ctx.registroHoy ? 'progreso' : 'sin_registro'; // garantiza no-vacío
  const rec = new Set(recientes || []);
  const disponibles = entries.filter(([f]) => !rec.has(f));
  const pool = disponibles.length ? disponibles : entries; // todos gastados → permite repetir (Karpathy)
  const d = Math.abs(Number(diaIdx) || 0);
  pool.sort((a, b) => (b[1] - a[1]) || (((ORDEN[a[0]] + d) % 7) - ((ORDEN[b[0]] + d) % 7)));
  return pool[0][0];
}

// ── Plantillas (Karpathy). titulos ≤40 · cuerpoConDato (usa slots) · cuerpoSinDato (sin slots de
//    dato) · dato(ctx) · cta. cta.accion: convención de ruteo (contiene 'despensa'/'receta' → /despensa;
//    el resto → /coach). Todas las de aquí van a /coach (que_puedo_comer/registrar/actualizar_agua/ver_progreso). ──
const TEMPLATES = {
  macro_pendiente: {
    titulos: ['Arranca con proteína', 'Suma tu proteína hoy', 'Proteína a tu favor'],
    cuerpoConDato: [
      'Ayer cerraste en {{prot_ayer}} g de proteína, cerca de tu meta de {{prot_meta}}. Si el desayuno lleva huevo o frijol, hoy llegas sin apretar la cena.',
      'Te faltan {{prot_pendiente}} g de proteína para tu meta de hoy. Unos huevos, atún o frijoles te acercan sin complicarte.',
    ],
    cuerpoSinDato: ['La proteína te sacia y cuida tu músculo. Repártela en tus comidas — el frijol con arroz también suma.'],
    dato: (c) => ({ label: 'Meta de proteína', valor: c.prot_meta ? `${c.prot_meta} g` : '' }),
    cta: { label: 'Ver qué cocinar', accion: 'que_puedo_comer' },
  },
  timing_entreno: {
    titulos: ['Carga antes de correr', 'Combustible para hoy', 'Tu entreno pide energía'],
    cuerpoConDato: [
      'Hoy toca {{entreno_hoy}}: suma un carbohidrato 2-3 h antes (avena, plátano o pan) para rendir mejor.',
      'Antes de tu {{entreno_hoy}}, un plátano o pan con miel te da energía. Lleva agua para la ruta.',
    ],
    cuerpoSinDato: ['Si hoy entrenas, suma un carbohidrato un par de horas antes (avena, plátano, pan) y lleva agua.'],
    dato: (c) => ({ label: 'Entreno de hoy', valor: c.entreno_hoy || '' }),
    cta: { label: 'Ver snack pre-entreno', accion: 'que_puedo_comer' },
  },
  favorito_despensa: {
    titulos: ['Con lo que ya tienes', 'Tu despensa te resuelve', 'Aprovecha tu {{ingrediente}}'],
    cuerpoConDato: [
      'Con {{ingrediente}} y {{ingrediente2}} que tienes, armas algo que suma proteína y fibra a tu día.',
      'Ya tienes {{ingrediente}} en tu despensa: úsalo hoy y te ahorras la vuelta al súper.',
    ],
    cuerpoSinDato: ['Con lo que ya tienes en la despensa armas algo que encaja tu día — sin comprar nada extra.'],
    dato: (c) => ({ label: 'En tu despensa', valor: c.ingrediente || '' }),
    cta: { label: 'Ver receta', accion: 'que_puedo_comer' },
  },
  racha: {
    titulos: ['Vas por la racha', '{{racha_dias}} días seguidos', 'El hábito ya jala'],
    cuerpoConDato: [
      '{{racha_dias}} días registrando seguidos. El hábito ya toma forma; hoy sumas uno más.',
      'Llevas {{racha_dias}} días de constancia. Eso es lo que construye resultados — sigue el ritmo.',
    ],
    cuerpoSinDato: ['Tu constancia registrando es lo que construye resultados. Hoy sumas uno más.'],
    dato: (c) => ({ label: 'Racha', valor: c.racha_dias ? `${c.racha_dias} días` : '' }),
    cta: { label: 'Registrar de hoy', accion: 'registrar' },
  },
  hidratacion: {
    titulos: ['Suma agua hoy', 'Un vaso más', 'Hidrátate para rendir'],
    cuerpoConDato: [
      'Vas {{agua_ml}} de {{agua_meta}} ml. Un par de vasos en la tarde y llegas fácil.',
      'El agua ayuda a tu energía y digestión. Un vaso ahora suma a tus {{agua_meta}} ml de hoy.',
    ],
    cuerpoSinDato: ['El agua ayuda a tu energía y digestión. Un vaso ahora suma a tu día.'],
    dato: (c) => ({ label: 'Agua', valor: (c.agua_ml != null && c.agua_meta) ? `${c.agua_ml}/${c.agua_meta} ml` : '' }),
    cta: { label: 'Registrar agua', accion: 'actualizar_agua' },
  },
  progreso: {
    titulos: ['Vas en ritmo', 'Tu constancia rinde', 'Buen ritmo esta semana'],
    cuerpoConDato: [
      'Tu adherencia va en {{adherencia}}% esta semana. La constancia es la que rinde — mantenla hoy.',
      'Vienes cumpliendo tus metas varios días. Vas en buen ritmo; sigue sumando.',
    ],
    cuerpoSinDato: ['Vienes con buena constancia. Vas en buen ritmo; sigue sumando hoy.'],
    dato: (c) => ({ label: 'Adherencia (7 días)', valor: c.adherencia != null ? `${c.adherencia}%` : '' }),
    cta: { label: 'Ver mi día', accion: 'ver_progreso' },
  },
  bienvenida: {
    titulos: ['Bienvenido a tu coach', 'Empecemos juntos', 'Tu primer paso'],
    cuerpoConDato: [],
    cuerpoSinDato: [
      'Aquí no se trata de dietas de castigo, sino de sumar mejores hábitos hacia tu {{objetivo_label}}. Empieza registrando tu próxima comida.',
      'Comer mejor es sumar: más verdura, agua y variedad. Registra tu próxima comida y arrancamos.',
    ],
    dato: () => null,
    cta: { label: 'Registrar comida', accion: 'registrar' },
  },
  sin_registro: {
    titulos: ['Hoy es buen día', 'Retomamos fácil', 'Un paso hoy'],
    cuerpoConDato: [],
    cuerpoSinDato: [
      'Cada día es buen momento para sumar hacia tu {{objetivo_label}}. Registrar una comida hoy te da claridad — sin presión.',
      'Empezar de nuevo es parte del proceso. Anota tu próxima comida y seguimos, a tu ritmo.',
    ],
    dato: () => null,
    cta: { label: 'Registrar ahora', accion: 'registrar' },
  },
};

const pick = (arr, idx) => arr[Math.abs(Number(idx) || 0) % arr.length];

// Rellena slots {{x}} con ctx[x]; deja el slot si falta el dato (para detectar variante incompleta).
function rellenar(str, ctx) {
  return String(str || '').replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const v = ctx?.[k];
    return (v === null || v === undefined || v === '') ? m : String(v);
  });
}
const completo = (str) => !/\{\{\w+\}\}/.test(str);

// ¿el texto nombra un alérgeno del usuario? (cinturón vivo). true → no usar ese cuerpo.
function nombraAlergeno(texto, restricciones) {
  if (!restricciones || !restricciones.length) return false;
  return findViolations([texto], restricciones).length > 0;
}

// Elige el cuerpo: primera variante con datos completos y SIN alérgeno; si no, sin-dato; si no, neutro.
function elegirCuerpoSeguro(t, ctx, idx) {
  const restr = ctx.restricciones || [];
  const cands = [];
  if (t.cuerpoConDato?.length) { const c = rellenar(pick(t.cuerpoConDato, idx), ctx); if (completo(c)) cands.push(c); }
  if (t.cuerpoSinDato?.length) cands.push(rellenar(pick(t.cuerpoSinDato, idx), ctx));
  for (const c of cands) if (completo(c) && !nombraAlergeno(c, restr)) return c;
  return NEUTRO;
}

function truncarTitulo(s) {
  const t = String(s || '').trim();
  if (t.length <= 40) return t;
  const corte = t.slice(0, 40);
  const sp = corte.lastIndexOf(' ');
  return (sp > 20 ? corte.slice(0, sp) : corte).trim();
}

// Elige el TÍTULO: primera variante completa (sin slots crudos) y SIN alérgeno del usuario; si ninguna
// califica, cae a la primera variante sin slots. Igual que el cuerpo, el título nunca nombra un alérgeno.
function elegirTituloSeguro(t, ctx, idx) {
  const restr = ctx.restricciones || [];
  const n = t.titulos.length;
  const base = Math.abs(Number(idx) || 0);
  for (let i = 0; i < n; i++) {
    const cand = rellenar(t.titulos[(base + i) % n], ctx);
    if (completo(cand) && !nombraAlergeno(cand, restr)) return truncarTitulo(cand);
  }
  const sinSlot = t.titulos.find((s) => !/\{\{\w+\}\}/.test(s)) || t.titulos[0];
  return truncarTitulo(rellenar(sinSlot, ctx)) || 'Un paso a la vez';
}

// Construye el consejo determinista (schema Drucker). diaIdx = índice del día (para rotar variantes).
export function construirConsejo(foco, ctx = {}, diaIdx = 0) {
  const t = TEMPLATES[foco] || TEMPLATES.bienvenida;
  const c = { ...ctx };
  // Slowking MENOR 1 (belt-and-suspenders): un alérgeno del usuario NUNCA se nombra en título/dato
  // tampoco (no solo en el cuerpo). Si el ingrediente de la despensa nombraría un alérgeno, se anula →
  // el título cae a una variante sin ese nombre y el dato_motor se omite. Refuerza el 'excluir' de la ruta.
  if (foco === 'favorito_despensa' && c.ingrediente && nombraAlergeno(c.ingrediente, c.restricciones || [])) {
    c.ingrediente = null; c.ingrediente2 = null;
  }
  const titulo = elegirTituloSeguro(t, c, diaIdx);
  const cuerpo = elegirCuerpoSeguro(t, c, diaIdx);
  const out = { foco, titulo, cuerpo };
  const dm = t.dato ? t.dato(c) : null;
  if (dm && dm.valor && !nombraAlergeno(dm.valor, c.restricciones || [])) out.dato_motor = { label: dm.label, valor: dm.valor };
  if (t.cta) out.cta = { label: t.cta.label, accion: t.cta.accion };
  return out;
}
