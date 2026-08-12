import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PREGUNTAS_NIVEL } from '@/lib/coach/curriculum';
import { priorNivel, bandaRespuesta, estimarNivel } from '@/lib/coach/nivel';

// Coach · Educación — evaluación de nivel (primer contacto). Rúbrica 100% DETERMINISTA (0 IA):
// prior conductual + señales por banda de las respuestas abiertas. Nivel INVISIBLE al usuario,
// recalibrable. Skippable. Deploy-safe: sin la columna nutrition_knowledge_level → responde el nivel
// estimado sin persistir (no rompe).
export const runtime = 'nodejs';

// GET → las preguntas de verificación para que Rams pinte la evaluación.
export async function GET() {
  return NextResponse.json({
    preguntas: PREGUNTAS_NIVEL.map((p) => ({ id: p.id, pregunta: p.pregunta })),
    autoOpciones: ['principiante', 'basico', 'intermedio', 'avanzado', 'compruebame'],
  });
}

// POST { autoSelect?, respuestas?: [{ id, texto }], skip? } → estima, guarda y devuelve el nivel.
export async function POST(req) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { data: perfil } = await supabase.from('nutrition_profiles').select('*').eq('user_id', user.id).maybeSingle();

    // Skip → deja el nivel sin evaluar (null); la persona trata null como básico.
    if (body.skip) return NextResponse.json({ nivel: null, guardado: false });

    // Rúbrica determinista: banda 0–3 por respuesta según las señales de la pregunta.
    const respuestas = Array.isArray(body.respuestas) ? body.respuestas : [];
    const bandas = respuestas
      .map((r) => {
        const q = PREGUNTAS_NIVEL.find((p) => p.id === r?.id);
        return q ? bandaRespuesta(r.texto, q.senales) : null;
      })
      .filter((b) => b !== null);

    const nivel = estimarNivel({ prior: priorNivel(perfil), autoSelect: body.autoSelect, bandas });

    // Persistir (deploy-safe: si la columna no existe aún → devuelve el nivel sin persistir).
    let guardado = false;
    const { error } = await supabase.from('nutrition_profiles').update({ nutrition_knowledge_level: nivel }).eq('user_id', user.id);
    if (!error) guardado = true;
    else console.error('nivel POST:', { code: error.code, details: error.details });

    // El nivel NO se muestra crudo al usuario (invisible); Rams solo confirma "listo".
    return NextResponse.json({ nivel, guardado });
  } catch (err) {
    console.error('nivel POST EXCEPCIÓN:', err?.message);
    return NextResponse.json({ error: 'No se pudo evaluar' }, { status: 500 });
  }
}
