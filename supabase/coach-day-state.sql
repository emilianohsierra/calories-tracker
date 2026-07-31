-- Coach · Estado del día (Fase 1 R3 · tool `actualizar_contexto_dia`).
-- ADITIVO e IDEMPOTENTE. No toca meals/profiles/targets/stripe. Lo corre Emiliano.
-- Un registro por (usuario, día): agua consumida, estado de entreno, sueño, estrés,
-- hora de comida. Lo actualiza la tool actualizar_contexto_dia; lo lee el contexto (L2).
create table if not exists public.coach_day_state (
  user_id        uuid not null references auth.users (id) on delete cascade,
  date           date not null,
  agua_ml        int  not null default 0,
  entreno_estado text,          -- pendiente | hecho | omitido
  sueno_h        numeric(3,1),
  estres         text,          -- bajo | medio | alto
  hora_comida    text,          -- HH:MM
  updated_at     timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.coach_day_state enable row level security;

drop policy if exists cds_select_own on public.coach_day_state;
create policy cds_select_own on public.coach_day_state
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists cds_insert_own on public.coach_day_state;
create policy cds_insert_own on public.coach_day_state
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists cds_update_own on public.coach_day_state;
create policy cds_update_own on public.coach_day_state
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Defensa en profundidad (consistente con los demás schemas del coach): sin acceso anon;
-- authenticated solo select/insert/update (la RLS lo acota a lo propio). Sin delete.
revoke all on public.coach_day_state from anon;
grant select, insert, update on public.coach_day_state to authenticated;
