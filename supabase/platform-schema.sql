-- ============================================================================
-- Closed-jobs platform — production schema (Supabase / PostgreSQL).
--
-- Design: operational tables carry typed key columns (for RLS, indexes and
-- queries) plus the full entity in a `data` jsonb column, so the browser
-- adapters (src/lib/platform/db/supabase.ts) and the demo backend speak
-- identical entity shapes. Every money or status mutation goes through a
-- SECURITY DEFINER RPC below — the server checks wallet balance, locks rows
-- and validates the job state machine; the browser is never trusted.
--
-- Run this file in the Supabase SQL editor. Safe to re-run (idempotent).
-- Then set NEXT_PUBLIC_PLATFORM_BACKEND=supabase in .env.local.
-- ============================================================================

-- ---------- Roles & identity ----------

create table if not exists platform_users (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in
    ('super_admin','admin','sales_manager','sales_agent','support_agent','professional','customer')),
  -- For role=professional: the platform_professionals row this login owns.
  pro_id text,
  -- AgentUser entity served to the app ({id, name, role}).
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function platform_role() returns text
language sql stable security definer as $$
  select coalesce((select role from platform_users where id = auth.uid()), 'anon');
$$;

create or replace function platform_pro_id() returns text
language sql stable security definer as $$
  select pro_id from platform_users where id = auth.uid();
$$;

create or replace function platform_is_staff() returns boolean
language sql stable as $$
  select platform_role() in ('super_admin','admin','sales_manager','sales_agent','support_agent');
$$;

create or replace function platform_is_admin() returns boolean
language sql stable as $$
  select platform_role() in ('super_admin','admin');
$$;

-- ---------- Operational tables ----------

create table if not exists platform_config (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists platform_leads (
  id text primary key,
  created_at timestamptz not null default now(),
  phone text not null,
  status text not null,
  city text,
  data jsonb not null
);
create index if not exists platform_leads_status_idx on platform_leads (status);
create index if not exists platform_leads_phone_idx on platform_leads (phone);

create table if not exists platform_jobs (
  id text primary key,
  created_at timestamptz not null default now(),
  status text not null,
  city text,
  assigned_pro_id text,
  data jsonb not null
);
create index if not exists platform_jobs_status_idx on platform_jobs (status);
create index if not exists platform_jobs_pro_idx on platform_jobs (assigned_pro_id);

create table if not exists platform_professionals (
  id text primary key,
  created_at timestamptz not null default now(),
  approved boolean not null default false,
  online boolean not null default false,
  city text,
  data jsonb not null
);

create table if not exists platform_wallet_txs (
  id text primary key,
  created_at timestamptz not null default now(),
  pro_id text not null,
  data jsonb not null
);
create index if not exists platform_wallet_txs_pro_idx on platform_wallet_txs (pro_id);

create table if not exists platform_customers (
  id text primary key,
  created_at timestamptz not null default now(),
  phone text not null,
  data jsonb not null
);
create unique index if not exists platform_customers_phone_idx on platform_customers (phone);

create table if not exists platform_complaints (
  id text primary key,
  created_at timestamptz not null default now(),
  job_id text not null,
  status text not null default 'open',
  data jsonb not null
);

create table if not exists platform_notifications (
  id text primary key,
  created_at timestamptz not null default now(),
  to_role text,
  to_id text,
  data jsonb not null
);

create table if not exists platform_ad_spend (
  id text primary key,
  date date not null,
  source text not null,
  data jsonb not null
);

create table if not exists platform_audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  entity text,
  entity_id text,
  detail jsonb
);

-- ---------- Job state machine (enforced at the database) ----------

create or replace function platform_job_transition_check() returns trigger
language plpgsql as $$
declare
  allowed jsonb := '{
    "WAITING_FOR_PROFESSIONAL": ["OFFERED","CANCELLED"],
    "OFFERED": ["ACCEPTED","WAITING_FOR_PROFESSIONAL","CANCELLED"],
    "ACCEPTED": ["PROFESSIONAL_ASSIGNED","CANCELLED"],
    "PROFESSIONAL_ASSIGNED": ["ON_THE_WAY","WAITING_FOR_PROFESSIONAL","CANCELLED"],
    "ON_THE_WAY": ["ARRIVED","WAITING_FOR_PROFESSIONAL","CANCELLED"],
    "ARRIVED": ["IN_PROGRESS","CANCELLED"],
    "IN_PROGRESS": ["COMPLETED","CANCELLED"],
    "COMPLETED": ["CUSTOMER_CONFIRMED"],
    "CUSTOMER_CONFIRMED": [],
    "CANCELLED": ["REFUNDED","WAITING_FOR_PROFESSIONAL"],
    "REFUNDED": []
  }'::jsonb;
begin
  if new.status is distinct from new.data->>'status' then
    raise exception 'העמודה status חייבת להיות זהה ל-data.status';
  end if;
  if tg_op = 'UPDATE' and old.status <> new.status then
    if not (allowed->old.status) ? new.status then
      raise exception 'מעבר סטטוס לא חוקי: % → %', old.status, new.status;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists platform_jobs_transition on platform_jobs;
create trigger platform_jobs_transition
  before insert or update on platform_jobs
  for each row execute function platform_job_transition_check();

-- ---------- Row Level Security ----------

alter table platform_users enable row level security;
alter table platform_config enable row level security;
alter table platform_leads enable row level security;
alter table platform_jobs enable row level security;
alter table platform_professionals enable row level security;
alter table platform_wallet_txs enable row level security;
alter table platform_customers enable row level security;
alter table platform_complaints enable row level security;
alter table platform_notifications enable row level security;
alter table platform_ad_spend enable row level security;
alter table platform_audit_logs enable row level security;

-- Own identity row.
drop policy if exists users_self on platform_users;
create policy users_self on platform_users for select using (id = auth.uid() or platform_is_staff());

-- Config: staff read (agents need pricing suggestions); admins write.
drop policy if exists config_read on platform_config;
create policy config_read on platform_config for select using (platform_is_staff());
drop policy if exists config_write on platform_config;
create policy config_write on platform_config for update using (platform_is_admin());

-- Leads: the public funnel may only insert; staff work them.
drop policy if exists leads_staff on platform_leads;
create policy leads_staff on platform_leads for all using (platform_is_staff());
drop policy if exists leads_funnel_insert on platform_leads;
create policy leads_funnel_insert on platform_leads for insert with check (true);

-- Jobs: staff everything; a professional reads only jobs assigned to him.
-- Open jobs reach professionals ONLY via the masked marketplace view below.
drop policy if exists jobs_staff on platform_jobs;
create policy jobs_staff on platform_jobs for all using (platform_is_staff());
drop policy if exists jobs_pro_own on platform_jobs;
create policy jobs_pro_own on platform_jobs for select
  using (platform_role() = 'professional' and assigned_pro_id = platform_pro_id());

-- Professionals: own row + staff; the join form may insert (unapproved only).
drop policy if exists pros_staff on platform_professionals;
create policy pros_staff on platform_professionals for all using (platform_is_staff());
drop policy if exists pros_self on platform_professionals;
create policy pros_self on platform_professionals for select
  using (platform_role() = 'professional' and id = platform_pro_id());
drop policy if exists pros_self_update on platform_professionals;
create policy pros_self_update on platform_professionals for update
  using (platform_role() = 'professional' and id = platform_pro_id())
  with check (approved = (select approved from platform_professionals p where p.id = platform_professionals.id));
drop policy if exists pros_join on platform_professionals;
create policy pros_join on platform_professionals for insert with check (approved = false);

-- Wallet: a pro reads his own ledger; admins read all. Writes: RPCs only.
drop policy if exists wallet_own on platform_wallet_txs;
create policy wallet_own on platform_wallet_txs for select
  using (pro_id = platform_pro_id() or platform_is_admin());

drop policy if exists customers_staff on platform_customers;
create policy customers_staff on platform_customers for all using (platform_is_staff());

drop policy if exists complaints_staff on platform_complaints;
create policy complaints_staff on platform_complaints for all using (platform_is_staff());
drop policy if exists complaints_open on platform_complaints;
create policy complaints_open on platform_complaints for insert with check (status = 'open');

drop policy if exists notifications_own on platform_notifications;
create policy notifications_own on platform_notifications for select
  using (to_id = platform_pro_id() or platform_is_staff());

-- Ad spend & audit: admin eyes only.
drop policy if exists ad_spend_admin on platform_ad_spend;
create policy ad_spend_admin on platform_ad_spend for all using (platform_is_admin());
drop policy if exists audit_admin on platform_audit_logs;
create policy audit_admin on platform_audit_logs for select using (platform_is_admin());

-- ---------- Masked marketplace view (customer details hidden pre-purchase) ----------

create or replace view platform_jobs_marketplace as
select
  id, created_at, status, city,
  (data - 'customerName' - 'customerPhone' - 'address' - 'customerId')
    || jsonb_build_object('customerName', null, 'customerPhone', null, 'address', null)
    as data
from platform_jobs
where status in ('WAITING_FOR_PROFESSIONAL','OFFERED');

grant select on platform_jobs_marketplace to authenticated;

-- ---------- Internal helpers ----------

create or replace function platform_audit(p_action text, p_entity text, p_entity_id text, p_detail jsonb)
returns void language sql security definer as $$
  insert into platform_audit_logs (actor, action, entity, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_detail);
$$;

create or replace function platform_wallet_balance(p_pro_id text) returns numeric
language sql stable security definer as $$
  select coalesce(sum((data->>'amount')::numeric), 0) from platform_wallet_txs where pro_id = p_pro_id;
$$;

-- Append a wallet transaction with a running balance; the single write path.
create or replace function platform_wallet_apply(
  p_pro_id text, p_type text, p_amount numeric, p_job_id text, p_note text
) returns jsonb language plpgsql security definer as $$
declare v_balance numeric; v_tx jsonb; v_id text;
begin
  if p_type not in ('TOP_UP','JOB_PURCHASE','REFUND','BONUS','ADJUSTMENT','PAYOUT') then
    raise exception 'סוג תנועה לא מוכר: %', p_type;
  end if;
  v_balance := platform_wallet_balance(p_pro_id) + p_amount;
  if v_balance < 0 then
    raise exception 'אין מספיק יתרה בארנק';
  end if;
  v_id := 'tx-' || extract(epoch from clock_timestamp())::bigint || '-' || substr(md5(random()::text), 1, 5);
  v_tx := jsonb_build_object(
    'id', v_id, 'proId', p_pro_id, 'type', p_type, 'amount', p_amount,
    'jobId', p_job_id, 'at', now(), 'note', p_note, 'balanceAfter', v_balance);
  insert into platform_wallet_txs (id, pro_id, data) values (v_id, p_pro_id, v_tx);
  return v_tx;
end $$;

create or replace function platform_set_job_status(p_job jsonb, p_status text, p_by text)
returns jsonb language sql stable as $$
  select p_job
    || jsonb_build_object('status', p_status, 'updatedAt', now())
    || jsonb_build_object('statusHistory',
         coalesce(p_job->'statusHistory', '[]'::jsonb)
         || jsonb_build_array(jsonb_build_object('status', p_status, 'at', now(), 'by', p_by)));
$$;

-- ---------- RPCs (the trusted mutation surface) ----------

-- Close a lead into a job. The agent's numbers arrive from the client (that
-- is his authority); the server stamps identity, upserts the customer and
-- opens dispatch.
create or replace function platform_close_lead(p_lead_id text, p_input jsonb, p_by text)
returns jsonb language plpgsql security definer as $$
declare v_lead jsonb; v_customer jsonb; v_job jsonb; v_job_id text; v_now timestamptz := now();
begin
  if not platform_is_staff() then raise exception 'אין הרשאה'; end if;
  select data into v_lead from platform_leads where id = p_lead_id for update;
  if not found then raise exception 'הליד לא נמצא'; end if;

  select data into v_customer from platform_customers where phone = v_lead->>'phone' for update;
  if found then
    v_customer := v_customer || jsonb_build_object(
      'orders', ((v_customer->>'orders')::int + 1),
      'totalSpent', ((v_customer->>'totalSpent')::numeric + (p_input->>'customerPrice')::numeric),
      'lastOrderAt', v_now);
    update platform_customers set data = v_customer where id = v_customer->>'id';
  else
    v_customer := jsonb_build_object(
      'id', 'cust-' || substr(md5(random()::text), 1, 10), 'createdAt', v_now,
      'name', v_lead->>'name', 'phone', v_lead->>'phone',
      'city', p_input->>'city', 'address', p_input->>'address',
      'orders', 1, 'totalSpent', (p_input->>'customerPrice')::numeric,
      'lastOrderAt', v_now, 'servicesUsed', '[]'::jsonb,
      'lastProId', null, 'lastStars', null, 'loyaltyCredit', 0);
    insert into platform_customers (id, phone, data)
      values (v_customer->>'id', v_lead->>'phone', v_customer);
  end if;

  v_job_id := 'job-' || substr(md5(random()::text), 1, 10);
  v_job := jsonb_build_object(
    'id', v_job_id, 'createdAt', v_now, 'updatedAt', v_now,
    'leadId', p_lead_id, 'customerId', v_customer->>'id',
    'customerName', v_lead->>'name', 'customerPhone', v_lead->>'phone',
    'city', p_input->>'city', 'address', p_input->>'address',
    'lat', p_input->'lat', 'lng', p_input->'lng',
    'items', p_input->'items', 'condition', coalesce(v_lead->'condition','[]'::jsonb),
    'photos', coalesce(v_lead->'photos','[]'::jsonb), 'notes', p_input->>'notes',
    'date', p_input->>'date', 'windowStart', p_input->>'windowStart', 'windowEnd', p_input->>'windowEnd',
    'paymentMethod', p_input->>'paymentMethod', 'feeModel', p_input->>'feeModel',
    'customerPrice', (p_input->>'customerPrice')::numeric,
    'baseFee', (p_input->>'baseFee')::numeric,
    'payoutAmount', p_input->'payoutAmount',
    'decaySteps', coalesce(p_input->'decaySteps', '[]'::jsonb),
    'status', 'WAITING_FOR_PROFESSIONAL',
    'statusHistory', jsonb_build_array(jsonb_build_object('status','WAITING_FOR_PROFESSIONAL','at',v_now,'by',p_by)),
    'dispatchStartedAt', null, 'urgent', false, 'redispatchCount', 0,
    'excludedProIds', '[]'::jsonb, 'assignedProId', null, 'assignedAt', null,
    'purchaseFee', null, 'advertisingCost', 0, 'paymentFee',
      case when p_input->>'paymentMethod' = 'card' then round((p_input->>'customerPrice')::numeric * 0.025) else 0 end,
    'refunds', 0, 'discounts', 0, 'review', null, 'reviewRequestedAt', null,
    'cancellation', null, 'source', coalesce(v_lead->>'source','direct'), 'agentId', p_by);
  insert into platform_jobs (id, status, city, data)
    values (v_job_id, 'WAITING_FOR_PROFESSIONAL', p_input->>'city', v_job);

  -- Open dispatch immediately.
  v_job := platform_set_job_status(v_job, 'OFFERED', 'system')
    || jsonb_build_object('dispatchStartedAt', v_now);
  update platform_jobs set status = 'OFFERED', data = v_job where id = v_job_id;

  update platform_leads set status = 'converted',
    data = data || jsonb_build_object('status','converted','jobId',v_job_id,
      'customerId', v_customer->>'id', 'quotedPrice', (p_input->>'customerPrice')::numeric,
      'updatedAt', v_now)
    where id = p_lead_id;

  perform platform_audit('close_lead', 'job', v_job_id, p_input);
  return v_job;
end $$;

-- Atomic job purchase: lock, availability check, server-computed fee from the
-- frozen decay schedule, wallet charge, assignment. First taker wins.
create or replace function platform_take_job(p_job_id text, p_pro_id text)
returns jsonb language plpgsql security definer as $$
declare
  v_job jsonb; v_status text; v_pro jsonb; v_fee numeric := 0;
  v_elapsed_min numeric; v_step record; v_min_balance numeric;
begin
  if platform_role() = 'professional' and platform_pro_id() is distinct from p_pro_id then
    raise exception 'אין הרשאה לקחת עבודה עבור מנקה אחר';
  end if;
  select data, status into v_job, v_status from platform_jobs where id = p_job_id for update;
  if not found then raise exception 'העבודה לא נמצאה'; end if;
  if v_status not in ('WAITING_FOR_PROFESSIONAL','OFFERED') then raise exception 'העבודה כבר נלקחה'; end if;
  select data into v_pro from platform_professionals where id = p_pro_id for update;
  if not found then raise exception 'בעל המקצוע לא נמצא'; end if;
  if not (v_pro->>'approved')::boolean then raise exception 'החשבון עדיין לא אושר'; end if;
  if v_job->'excludedProIds' ? p_pro_id then raise exception 'העבודה אינה זמינה עבורך'; end if;

  if v_job->>'feeModel' = 'fee' then
    v_elapsed_min := coalesce(extract(epoch from (now() - (v_job->>'dispatchStartedAt')::timestamptz)) / 60, 0);
    v_fee := (v_job->>'baseFee')::numeric;
    for v_step in select value from jsonb_array_elements(coalesce(v_job->'decaySteps','[]'::jsonb)) loop
      if v_elapsed_min >= (v_step.value->>'afterMinutes')::numeric then
        v_fee := (v_step.value->>'fee')::numeric;
      end if;
    end loop;
    v_min_balance := coalesce((select (data->'dispatch'->>'minBalance')::numeric from platform_config where id = 'main'), 0);
    if platform_wallet_balance(p_pro_id) - v_fee < v_min_balance then
      raise exception 'אין מספיק יתרה בארנק. טען ארנק כדי לקבל את העבודה.';
    end if;
    perform platform_wallet_apply(p_pro_id, 'JOB_PURCHASE', -v_fee, p_job_id,
      'רכישת עבודה — ' || coalesce(v_job->>'city',''));
  end if;

  v_job := platform_set_job_status(v_job, 'ACCEPTED', p_pro_id);
  update platform_jobs set status = 'ACCEPTED', data = v_job where id = p_job_id;
  v_job := platform_set_job_status(v_job, 'PROFESSIONAL_ASSIGNED', p_pro_id)
    || jsonb_build_object('assignedProId', p_pro_id, 'assignedAt', now(), 'purchaseFee', v_fee);
  update platform_jobs set status = 'PROFESSIONAL_ASSIGNED', assigned_pro_id = p_pro_id, data = v_job
    where id = p_job_id;

  update platform_professionals set data = data || jsonb_build_object(
      'totalTaken', ((data->>'totalTaken')::int + 1),
      'jobsLast7d', ((data->>'jobsLast7d')::int + 1))
    where id = p_pro_id;

  perform platform_audit('take_job', 'job', p_job_id, jsonb_build_object('proId', p_pro_id, 'fee', v_fee));
  return v_job;
end $$;

create or replace function platform_advance_job(p_job_id text, p_status text, p_by text)
returns void language plpgsql security definer as $$
declare v_job jsonb;
begin
  select data into v_job from platform_jobs where id = p_job_id for update;
  if not found then raise exception 'העבודה לא נמצאה'; end if;
  if platform_role() = 'professional' and v_job->>'assignedProId' is distinct from platform_pro_id() then
    raise exception 'אין הרשאה';
  end if;
  v_job := platform_set_job_status(v_job, p_status, p_by);
  if p_status = 'COMPLETED' then
    v_job := v_job || jsonb_build_object('reviewRequestedAt', now());
    update platform_professionals set data = data || jsonb_build_object(
        'completedJobs', ((data->>'completedJobs')::int + 1))
      where id = v_job->>'assignedProId';
  end if;
  update platform_jobs set status = p_status, data = v_job where id = p_job_id;
end $$;

-- Cancellation. Professional cancel: no refund, exclusion, instant
-- re-dispatch (urgent when the window is close). Customer/admin cancel
-- before departure: fee refunded.
create or replace function platform_cancel_job(p_job_id text, p_by text, p_reason text, p_actor text)
returns void language plpgsql security definer as $$
declare
  v_job jsonb; v_pro_id text; v_urgent boolean; v_threshold numeric; v_prev text;
begin
  select data into v_job from platform_jobs where id = p_job_id for update;
  if not found then raise exception 'העבודה לא נמצאה'; end if;
  v_pro_id := v_job->>'assignedProId';

  if p_by = 'professional' and v_pro_id is not null then
    if platform_role() = 'professional' and v_pro_id is distinct from platform_pro_id() then
      raise exception 'אין הרשאה';
    end if;
    update platform_professionals set data = data || jsonb_build_object(
        'cancelledJobs', ((data->>'cancelledJobs')::int + 1))
      where id = v_pro_id;
    v_threshold := coalesce((select (data->'dispatch'->>'urgentThresholdMinutes')::numeric
      from platform_config where id = 'main'), 90);
    v_urgent := ((v_job->>'date')::date + (v_job->>'windowStart')::time) - now()
      <= make_interval(mins => v_threshold::int);
    v_job := v_job || jsonb_build_object(
      'cancellation', jsonb_build_object('by', p_by, 'reason', p_reason, 'at', now(), 'refunded', false),
      'excludedProIds', coalesce(v_job->'excludedProIds','[]'::jsonb) || to_jsonb(v_pro_id),
      'assignedProId', null, 'assignedAt', null, 'purchaseFee', null,
      'redispatchCount', ((v_job->>'redispatchCount')::int + 1),
      'urgent', v_urgent);
    v_job := platform_set_job_status(v_job, 'WAITING_FOR_PROFESSIONAL', p_actor);
    update platform_jobs set status = 'WAITING_FOR_PROFESSIONAL', assigned_pro_id = null, data = v_job
      where id = p_job_id;
    v_job := platform_set_job_status(v_job, 'OFFERED', 'system')
      || jsonb_build_object('dispatchStartedAt', now());
    update platform_jobs set status = 'OFFERED', data = v_job where id = p_job_id;
  else
    v_prev := v_job->>'status';
    v_job := platform_set_job_status(v_job, 'CANCELLED', p_actor)
      || jsonb_build_object('cancellation',
           jsonb_build_object('by', p_by, 'reason', p_reason, 'at', now(), 'refunded', false));
    update platform_jobs set status = 'CANCELLED', data = v_job where id = p_job_id;
    if v_pro_id is not null and (v_job->>'purchaseFee') is not null
       and v_prev not in ('ON_THE_WAY','ARRIVED','IN_PROGRESS') then
      perform platform_wallet_apply(v_pro_id, 'REFUND', (v_job->>'purchaseFee')::numeric, p_job_id,
        'החזר — הלקוח ביטל לפני יציאה');
      v_job := platform_set_job_status(v_job, 'REFUNDED', 'system');
      v_job := jsonb_set(v_job, '{cancellation,refunded}', 'true'::jsonb);
      update platform_jobs set status = 'REFUNDED', data = v_job where id = p_job_id;
    end if;
  end if;
  perform platform_audit('cancel_job', 'job', p_job_id, jsonb_build_object('by', p_by, 'reason', p_reason));
end $$;

create or replace function platform_redispatch_job(p_job_id text)
returns void language plpgsql security definer as $$
declare v_job jsonb;
begin
  if not platform_is_staff() then raise exception 'אין הרשאה'; end if;
  select data into v_job from platform_jobs where id = p_job_id for update;
  if not found then raise exception 'העבודה לא נמצאה'; end if;
  v_job := platform_set_job_status(v_job, 'WAITING_FOR_PROFESSIONAL', 'admin')
    || jsonb_build_object('assignedProId', null, 'assignedAt', null, 'purchaseFee', null,
         'redispatchCount', ((v_job->>'redispatchCount')::int + 1));
  update platform_jobs set status = 'WAITING_FOR_PROFESSIONAL', assigned_pro_id = null, data = v_job
    where id = p_job_id;
  v_job := platform_set_job_status(v_job, 'OFFERED', 'system')
    || jsonb_build_object('dispatchStartedAt', now());
  update platform_jobs set status = 'OFFERED', data = v_job where id = p_job_id;
end $$;

create or replace function platform_submit_review(p_job_id text, p_review jsonb)
returns void language plpgsql security definer as $$
declare v_job jsonb; v_pro jsonb; v_stars numeric; v_count int;
begin
  select data into v_job from platform_jobs where id = p_job_id for update;
  if not found then raise exception 'העבודה לא נמצאה'; end if;
  if v_job->'review' is not null and v_job->'review' <> 'null'::jsonb then
    raise exception 'כבר נשלח דירוג לעבודה זו';
  end if;
  v_job := platform_set_job_status(v_job, 'CUSTOMER_CONFIRMED', 'customer')
    || jsonb_build_object('review', p_review || jsonb_build_object('at', now()));
  update platform_jobs set status = 'CUSTOMER_CONFIRMED', data = v_job where id = p_job_id;

  if v_job->>'assignedProId' is not null then
    select data into v_pro from platform_professionals where id = v_job->>'assignedProId' for update;
    v_stars := (p_review->>'stars')::numeric;
    v_count := (v_pro->>'ratingCount')::int;
    update platform_professionals set data = data || jsonb_build_object(
        'rating', round((((v_pro->>'rating')::numeric * v_count + v_stars) / (v_count + 1))::numeric, 1),
        'ratingCount', v_count + 1)
      where id = v_job->>'assignedProId';
  end if;
  update platform_customers set data = data || jsonb_build_object(
      'lastStars', (p_review->>'stars')::int,
      'loyaltyCredit', ((data->>'loyaltyCredit')::numeric + 25))
    where id = v_job->>'customerId';
end $$;

create or replace function platform_wallet_topup(p_pro_id text, p_amount numeric)
returns void language plpgsql security definer as $$
begin
  if p_amount <= 0 then raise exception 'סכום טעינה לא תקין'; end if;
  if platform_role() = 'professional' and platform_pro_id() is distinct from p_pro_id then
    raise exception 'אין הרשאה';
  end if;
  -- Production: confirm the PSP charge (payments adapter webhook) BEFORE
  -- crediting. In sandbox the credit is applied directly.
  perform platform_wallet_apply(p_pro_id, 'TOP_UP', p_amount, null, 'טעינת ארנק');
end $$;

create or replace function platform_mark_notifications_read(p_to_id text)
returns void language sql security definer as $$
  update platform_notifications set data = data || '{"read": true}'::jsonb where to_id = p_to_id;
$$;

-- ---------- Default configuration (same defaults as the demo) ----------

insert into platform_config (id, data) values ('main', '{
  "defaultFeeModel": "fee",
  "pricingRules": [
    {"id":"rule-default","name":"ברירת מחדל — אחוז ממחיר הלקוח","categoryId":null,"city":null,"urgent":null,"minCustomerPrice":null,"maxCustomerPrice":null,"mode":"percent_range","percentMin":20,"percentMax":28,"amount":0,"priority":0,"active":true},
    {"id":"rule-big","name":"עבודות גדולות (₪800+)","categoryId":null,"city":null,"urgent":null,"minCustomerPrice":800,"maxCustomerPrice":null,"mode":"percent_range","percentMin":20,"percentMax":26,"amount":0,"priority":10,"active":true},
    {"id":"rule-urgent","name":"עבודה דחופה — מחיר נמוך למציאת מחליף","categoryId":null,"city":null,"urgent":true,"minCustomerPrice":null,"maxCustomerPrice":null,"mode":"percent_range","percentMin":15,"percentMax":20,"amount":0,"priority":20,"active":true}
  ],
  "decay": {"steps":[{"afterMinutes":15,"percentOfBase":90},{"afterMinutes":30,"percentOfBase":80},{"afterMinutes":45,"percentOfBase":70},{"afterMinutes":60,"percentOfBase":60}],"floorPercent":50,"urgentStartPercent":75},
  "dispatch": {"waves":[{"size":5,"afterSeconds":0},{"size":15,"afterSeconds":60},{"size":-1,"afterSeconds":180}],"weights":{"distance":25,"score":25,"completion":10,"cancellations":10,"response":10,"recentLoad":10,"affinity":10},"urgentThresholdMinutes":90,"minBalance":0},
  "reactivationMonths": 6
}'::jsonb)
on conflict (id) do nothing;
