-- Lealtad V1 — ADITIVO e IDEMPOTENTE. Antigüedad de suscripción Pro + ledger de recompensas (meses gratis).
-- CERO dark patterns; escritura SOLO server-side (cron/service_role). Deploy-safe: sin esto / flags off → intacto.
-- Patrón: add column if not exists · create table if not exists · RLS user_id=(select auth.uid()) · revoke anon.

-- ============================ 1) Antigüedad de suscripción Pro ============================
-- Cuándo empezó el Pro pagado. Se setea en el 1er sync a Pro (idempotente: coalesce, solo si es null).
alter table public.subscriptions add column if not exists pro_since timestamptz;

-- ============================ 2) Ledger de recompensas de lealtad (idempotencia dura) ============================
-- PK (user_id, tramo_code) = un tramo se otorga A LO SUMO UNA VEZ (insert-on-conflict). SIN insert de cliente.
create table if not exists public.loyalty_rewards (
  user_id     uuid not null references auth.users (id) on delete cascade,
  tramo_code  text not null,
  estado      text not null default 'pendiente' check (estado in ('pendiente','otorgado','error')),
  stripe_ref  text,                                  -- id del balance transaction (crédito) cuando se otorga
  otorgado_en timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, tramo_code)
);
create index if not exists idx_loyalty_user on public.loyalty_rewards (user_id, created_at desc);

-- ============================ RLS + grants (SELECT-own; escritura solo service_role/RPC) ============================
alter table public.loyalty_rewards enable row level security;
drop policy if exists loyalty_rewards_sel on public.loyalty_rewards;
create policy loyalty_rewards_sel on public.loyalty_rewards
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.loyalty_rewards from anon;
grant select on public.loyalty_rewards to authenticated;
-- SIN grant de insert/update a authenticated → el cliente NUNCA fabrica una recompensa. Solo el cron
-- (service_role) escribe: reclamo idempotente (PK) + Stripe idempotencyKey = cero doble-otorgamiento.

-- Verificación (opcional): subscriptions.pro_since existe; loyalty_rewards con PK (user_id,tramo_code) + RLS.
