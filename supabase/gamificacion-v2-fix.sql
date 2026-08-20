-- Gamificación V2.1 — FIX de FARMEO (delta IDEMPOTENTE / re-ejecutable sobre supabase/gamificacion-v2.sql).
-- Slowking halló un hueco REAL ya vivo en prod: un usuario autenticado puede FABRICAR fechas y farmear XP:
--   (1) insert en public.checkins {dia:'2099-01-01'} (RLS solo checa user_id) → rpc otorgar_evento(
--       'CHECKIN_COMPLETED','CHECKIN_COMPLETED:2099-01-01') → +5 XP por día inventado, ILIMITADO.
--   (2) WORKOUT_LOGGED vía coach_day_state con fecha libre (hueco pre-existente de V1) → +15 XP/fecha.
-- Cierre (ambos), SIN romper V1 ni el cron:
--   (a) otorgar_evento: para llamadas de USUARIO (v_is_user) de los tipos date-keyed CHECKIN_COMPLETED y
--       WORKOUT_LOGGED, ancla v_ref a HOY MX → fecha pasada/futura = inválida. El cron/service_role
--       (CHALLENGE_COMPLETED, etc.) NO se afecta (v_is_user=false salta la validación de usuario).
--   (b) revoke insert/update en public.checkins a authenticated → la ruta legítima usa registrar_checkin
--       (SECURITY DEFINER, fuerza HOY MX, corre con privilegios del owner → NO se rompe). coach_day_state
--       NO se revoca (el coach lo escribe): la restricción de fecha en la RPC es el cinturón.
-- Confirmado antes de entregar:
--   (1) registrar_checkin sigue otorgando: fuerza v_dia = HOY MX → v_ref = hoy → pasa el ancla. ✔
--   (2) el flujo legítimo de WORKOUT_LOGGED/CHECKIN es del MISMO día: lib/coach/actions.js otorga con
--       date = localDateTime() (HOY MX) para ambos → pasa el ancla. NO hay flujo legítimo de fecha pasada. ✔
--   (3) todo lo demás de V1 queda IDÉNTICO (solo se re-crea otorgar_evento con el ancla + se cierra la
--       escritura de cliente en checkins). ✔

-- ============================ (a) otorgar_evento — re-creada con ANCLA A HOY MX para tipos date-keyed de usuario ============================
-- Idéntica a gamificacion-v2.sql salvo las dos condiciones `and nullif(v_ref,'')::date = HOY MX` en
-- WORKOUT_LOGGED y CHECKIN_COMPLETED (SOLO en la rama v_is_user). Re-ejecutable (drop + create).
drop function if exists public.otorgar_evento(text, text, int, uuid);
create function public.otorgar_evento(
  p_tipo text, p_clave_dedupe text, p_xp int default 0, p_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid; v_is_user boolean; v_valido boolean; v_xp int; v_total int; v_ref text; v_clave text;
  v_hoy_mx date := (now() at time zone 'America/Mexico_City')::date;   -- ancla anti-fabricación de fechas
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
      -- entreno: además de existir 'hecho', el día debe ser HOY MX (cierra el farmeo de fechas fabricadas).
      when 'WORKOUT_LOGGED'    then (
        nullif(v_ref,'')::date = v_hoy_mx
        and exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid and d.entreno_estado = 'hecho')
      )
      -- check-in: válido si existe en checkins (V2) O en coach_day_state (V1) → no rompe el hook vivo; dedupe 1/día.
      -- Además el día debe ser HOY MX (cierra el farmeo de fechas fabricadas; registrar_checkin fuerza hoy → pasa).
      when 'CHECKIN_COMPLETED' then (
        nullif(v_ref,'')::date = v_hoy_mx
        and (
          exists (select 1 from public.checkins c where c.dia = nullif(v_ref,'')::date and c.user_id = v_uid)
          or exists (select 1 from public.coach_day_state d where d.date = nullif(v_ref,'')::date and d.user_id = v_uid)
        )
      )
      else false  -- DAY_COMPLETED / GOAL_REACHED / WEEKLY_CONSISTENT / CHALLENGE_COMPLETED = solo cron (service_role)
    end;
    if not v_valido then return jsonb_build_object('awarded', false, 'reason', 'invalid'); end if;
  end if;

  -- XP DERIVADO SERVER-SIDE por tipo (el p_xp del cliente NO se usa para tipos de usuario).
  v_xp := case p_tipo
    when 'MEAL_LOGGED'          then 10
    when 'PANTRY_ITEM_ADDED'    then 5
    when 'LESSON_COMPLETED'     then 25
    when 'WORKOUT_LOGGED'       then 15
    when 'CHECKIN_COMPLETED'    then 5
    when 'DAY_COMPLETED'        then 20
    when 'GOAL_REACHED'         then 30
    when 'WEEKLY_CONSISTENT'    then 100
    when 'CHALLENGE_COMPLETED'  then 50   -- default; el cron puede sobreescribir por reto (abajo)
    else 0
  end;
  -- Retos: SOLO el cron (service_role) puede pasar el XP del reto (config). Users nunca llegan aquí (validación).
  if p_tipo = 'CHALLENGE_COMPLETED' and not v_is_user and coalesce(p_xp, 0) > 0 then v_xp := p_xp; end if;
  if v_xp = 0 then return jsonb_build_object('awarded', false, 'reason', 'tipo_sin_xp'); end if;

  -- CLAVE DE DEDUPE CANÓNICA server-side (de inputs YA validados: tipo + v_ref real), NO del raw del cliente.
  -- reto = 'CHALLENGE_COMPLETED:<challenge_id>' (v_ref = 2º campo). check-in = 'CHECKIN_COMPLETED:<dia>' = 1/día.
  v_clave := p_tipo || ':' || v_ref;

  insert into public.gamification_events (user_id, tipo, clave_dedupe, xp)
  values (v_uid, p_tipo, v_clave, v_xp)
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

-- ============================ (b) checkins — cerrar la escritura directa de CLIENTE (solo vía registrar_checkin) ============================
-- La única escritura legítima es registrar_checkin (SECURITY DEFINER: fuerza HOY MX y corre con privilegios
-- del owner → sigue funcionando aunque authenticated pierda el grant). Sin grant, PostgREST rechaza cualquier
-- insert/update directo del cliente (que era el vector para fabricar {dia:'2099-...'}). SELECT-own se conserva.
revoke insert, update on public.checkins from authenticated;
-- Políticas de insert/update quedan sin efecto (sin privilegio de tabla); las quitamos para que el modelo
-- de seguridad sea inequívoco (idempotente).
drop policy if exists checkins_ins on public.checkins;
drop policy if exists checkins_upd on public.checkins;

-- Verificación (opcional):
--   · authenticated NO tiene insert/update en checkins (solo select). registrar_checkin sigue insertando (definer).
--   · otorgar_evento rechaza CHECKIN_COMPLETED/WORKOUT_LOGGED de USUARIO con fecha ≠ hoy MX ('invalid').
--   · el cron (service_role) sigue otorgando CHALLENGE_COMPLETED sin restricción de fecha.
