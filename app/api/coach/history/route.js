import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Historial del hilo "Mi Coach" del usuario (para pintar el chat al abrir).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Inicia sesión' }, { status: 401 });

  const { data: conv } = await supabase
    .from('coach_conversations')
    .select('id')
    .eq('user_id', user.id)
    .order('last_active_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conv) return NextResponse.json({ messages: [] });

  const { data: messages } = await supabase
    .from('coach_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conv.id)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true });

  return NextResponse.json({ messages: messages || [] });
}
