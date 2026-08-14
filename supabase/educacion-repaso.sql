-- Coach · Educación — REPASO ESPACIADO (SM-2) + DOMINIO por-tema.
-- ADITIVO e IDEMPOTENTE sobre public.education_progress (NO crea tabla/RPC/cron/secreto nuevos).
-- El dominio-por-tema vive en education_progress (PK user_id,concepto = mastery 1:1); aquí solo se
-- añaden las columnas de SM-2. RLS/grants y metering existentes NO cambian (el repaso es determinista $0).
-- Correr en Supabase -> SQL Editor ANTES de encender REPASO_ON.

alter table public.education_progress
  add column if not exists ease_factor            numeric(4,2) not null default 2.3,  -- factor SM-2 [1.6, 2.8]
  add column if not exists rung                    int          not null default 0,    -- peldaño de la escalera (0..4, luego crece)
  add column if not exists intervalo               int          not null default 0,    -- días hasta el próximo repaso
  add column if not exists aciertos_consecutivos   int          not null default 0,    -- aciertos en días SEPARADOS (para 'dominado')
  add column if not exists next_review             date,                                -- cuándo toca repasar (scheduler determinista)
  add column if not exists ultima_forma_explicada  text;                                -- variante ya mostrada (para re-enseñar con otra)

-- Índice para el cálculo del "due" en el read (on-open, sin cron). Idempotente.
create index if not exists ep_user_next_review
  on public.education_progress (user_id, next_review);

-- RLS/grants: SIN CAMBIOS. education_progress ya tiene ep_select/insert/update_own (to authenticated,
-- user_id = (select auth.uid())) y revoke all from anon; las columnas nuevas quedan cubiertas.
-- Metering: SIN CAMBIOS. El repaso determinista NO reserva; la personalización IA (fuera del MVP, tras
-- EDUCACION_IA_ON) reusa consumir_educacion/reembolsar_ia existentes.

-- Verificación rápida (opcional):
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='education_progress'
--     and column_name in ('ease_factor','rung','intervalo','aciertos_consecutivos','next_review','ultima_forma_explicada');
--   -- deben aparecer las 6.
