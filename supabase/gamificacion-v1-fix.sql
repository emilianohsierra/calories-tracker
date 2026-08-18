-- Gamificación V1 — DELTA de seguridad (Slowking anti-farmeo). IDEMPOTENTE. Re-correr sobre la V1 ya
-- aplicada. Cierra: (1) p_xp controlado por el cliente → la RPC deriva el XP SERVER-SIDE por tipo; (2)
-- inserts de cliente en user_achievements/daily_goals → REVOCADOS (server-only; evita lavado de farmeo).

-- ============================ (1) RPC otorgar_evento: XP derivado server-side (ignora p_xp) ============================
drop function if exists public.otorgar_evento(text, text, int, uuid);
create function public.otorgar_evento(
  p_tipo text, p_clave_dedupe text, p_xp int default 0, p_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid; v_is_user boolean; v_valido boolean; v_xp int; v_total int; v_ref text;
begin
  v_is_user := auth.uid() is not null;
  v_uid := coalesce(auth.uid(), p_user_id);
  if v_uid is null then return jsonb_build_object('awarded', false, 'reason', 'no_user'); end if;
  v_ref := split_part(p_clave_dedupe, ':', 2);

  -- VALIDACIÓN ANTI-FARMEO (solo llamadas de USUARIO). El cron (service_role) omite: estado-derivado.
  if v_is_user then
    v_valido := case p_tipo
      when 'MEAL_LOGGED'       then exists (select 1 from public.meals m where m.id = nullif(v_ref,'')::bigint and m.user_id = v_uid)
      when 'LESSON_COMPLETED'  then exists (select 1 from public.education_progress e where e.concepto = v_ref and e.user_id = v_uid)
      when 'PANTRY_ITEM_ADDED' then exists (select 1 from public.pantry_items p where p.id = nullif(v_ref,'')::uuid and p.user_id = v_uid)
      when 'WORKOUT_LOGGED'    then exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid and d.entreno_estado = 'hecho')
      when 'CHECKIN_COMPLETED' then exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid)
      else false
    end;
    if not v_valido then return jsonb_build_object('awarded', false, 'reason', 'invalid'); end if;
  end if;

  -- XP DERIVADO SERVER-SIDE por tipo (el p_xp del cliente NO se usa). Alineado con lib/gamification/config.js.
  v_xp := case p_tipo
    when 'MEAL_LOGGED'       then 10
    when 'PANTRY_ITEM_ADDED' then 5
    when 'LESSON_COMPLETED'  then 25
    when 'WORKOUT_LOGGED'    then 15
    when 'CHECKIN_COMPLETED' then 5
    when 'DAY_COMPLETED'     then 20
    when 'GOAL_REACHED'      then 30
    when 'WEEKLY_CONSISTENT' then 100
    else 0
  end;
  if v_xp = 0 then return jsonb_build_object('awarded', false, 'reason', 'tipo_sin_xp'); end if;

  insert into public.gamification_events (user_id, tipo, clave_dedupe, xp)
  values (v_uid, p_tipo, p_clave_dedupe, v_xp)
  on conflict (user_id, tipo, clave_dedupe) do nothing;
  if not found then return jsonb_build_object('awarded', false, 'reason', 'replay'); end if;

  insert into public.user_progress (user_id, xp_total, updated_at)
  values (v_uid, v_xp, now())
  on conflict (user_id) do update set xp_total = public.user_progress.xp_total + v_xp, updated_at = now();
  select xp_total into v_total from public.user_progress where user_id = v_uid;

  return jsonb_build_object('awarded', true, 'xp_total', v_total);
exception when others then
  return jsonb_build_object('awarded', false, 'reason', 'error');
end $$;

revoke all on function public.otorgar_evento(text, text, int, uuid) from public, anon;
grant execute on function public.otorgar_evento(text, text, int, uuid) to authenticated;

-- ============================ (2) HARDENING: quitar inserts de cliente en logros/objetivos ============================
-- Estas tablas pasan a SERVER-ONLY (RPC/cron con service_role). Un cliente ya NO puede fabricar badges/
-- goals falsos que un cron futuro leería como input de XP (lavado de farmeo).
drop policy if exists user_achievements_ins on public.user_achievements;
drop policy if exists daily_goals_ins       on public.daily_goals;
revoke insert on public.user_achievements from authenticated;
revoke insert on public.daily_goals       from authenticated;
-- (SELECT-own se conserva: el usuario lee su progreso; las escrituras son server-trusted.)
