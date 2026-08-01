-- Coach · Memoria (Fase 1 R4-1 · tool `save_memory`). ADITIVO e IDEMPOTENTE.
-- No toca meals/profiles/targets/stripe. Lo corre Emiliano.
-- Hechos curados que el coach recuerda entre sesiones (anti-churn). NUNCA guarda
-- alergias/intolerancias (dato de salud → van a restricciones duras con confirmación).
create table if not exists public.coach_memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  tipo       text not null check (tipo in ('favorito','rechazo','lesion','compromiso','preferencia','hecho_clave')),
  contenido  text not null,
  norm       text not null,                 -- contenido normalizado (dedupe)
  activa     boolean not null default true, -- soft-delete / "olvidar"
  caduca_en  date,                          -- null = permanente
  fuente     text not null default 'save_memory',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tipo, norm)              -- dedupe hermético a nivel BD
);

alter table public.coach_memories enable row level security;

drop policy if exists cmem_select_own on public.coach_memories;
create policy cmem_select_own on public.coach_memories
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cmem_insert_own on public.coach_memories;
create policy cmem_insert_own on public.coach_memories
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cmem_update_own on public.coach_memories;
create policy cmem_update_own on public.coach_memories
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Defensa en profundidad (consistente con los demás schemas del coach).
revoke all on public.coach_memories from anon;
grant select, insert, update on public.coach_memories to authenticated;
