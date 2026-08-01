import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getHomeBriefing } from '@/lib/coach/briefing';

// Route DELGADO para la HOME (Rams → fetchHomeBriefing). Llama al cerebro de datos
// DETERMINISTA getHomeBriefing (números SOLO del motor + meals/targets; coachLine determinista;
// el modelo NO participa) y responde el contrato EXACTO que la UI consume. ADITIVO.
export const runtime = 'nodejs';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // userId sale de la SESIÓN (no del cliente): más seguro y RLS-scoped.
    if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

    const b = await getHomeBriefing(supabase, user.id);

    // Contrato EXACTO de la UI: los 4 campos, nombres idénticos.
    return NextResponse.json({
      entrenoDelDia: b.entrenoDelDia,
      macrosObjetivo: b.macrosObjetivo,
      macrosConsumidos: b.macrosConsumidos,
      coachLine: b.coachLine,
    });
  } catch (err) {
    console.error('home-briefing:', err?.message);
    // La UI tiene fallback determinista; devolvemos error claro sin romper.
    return NextResponse.json({ error: 'No se pudo cargar el briefing' }, { status: 500 });
  }
}
