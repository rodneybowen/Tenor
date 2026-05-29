-- =====================================================================
-- Tenor — initial schema (HIPAA-aware design)
-- =====================================================================
-- Design decisions captured in this migration:
--
--   1. Bodies (transcript / typed text / context note) stored as plain
--      text. Protected by RLS + Supabase's at-rest AES-256 + TLS in
--      transit. Standard healthcare-app architecture; HIPAA-compliant
--      when paired with a Supabase Business Associate Agreement (Team
--      plan or above). Server-readable bodies are required for future
--      Whisper transcription + therapist dashboards + ML classifier.
--
--   2. Audio (voice notes) is NEVER persisted — only the transcript.
--      Minimises PHI surface; no Storage bucket needed yet.
--
--   3. Row-Level Security is enabled on every table. Patients see only
--      their own rows; therapists see rows for any patient linked to
--      them in `therapist_patients` AND where the link is `active`.
--      Service role bypasses RLS (used only from Edge Functions /
--      admin tooling, never the browser).
--
--   4. Soft delete (`deleted_at`) instead of hard delete on user-
--      generated rows. Supports audit/breach response + lets a patient
--      request true erasure later via a server-side wipe job.
--
--   5. `audit_log` table records every write (insert/update/delete) to
--      PHI via AFTER triggers. SELECT auditing isn't done at the DB
--      layer (no built-in SELECT trigger in Postgres) — log reads from
--      application code or enable pgaudit on Supabase Pro+ when ready.
--
--   6. `auth.uid()` is Supabase Auth's helper that returns the current
--      authenticated user's UUID. Used in every RLS policy.
--
-- Run via:  supabase db push   (with Supabase CLI)
--    or:    paste this file into Supabase SQL editor → Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- profiles — extends Supabase Auth's auth.users with role + display
-- =====================================================================
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  role         text not null check (role in ('patient', 'therapist')),
  display_name text,
  timezone     text default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index idx_profiles_role on profiles(role) where deleted_at is null;

-- =====================================================================
-- therapist_patients — relationship junction with revocation provenance
-- =====================================================================
create table therapist_patients (
  therapist_id uuid not null references profiles(id) on delete cascade,
  patient_id   uuid not null references profiles(id) on delete cascade,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  primary key (therapist_id, patient_id),
  check (therapist_id <> patient_id)
);
create index idx_tp_patient   on therapist_patients(patient_id)   where active;
create index idx_tp_therapist on therapist_patients(therapist_id) where active;

-- =====================================================================
-- logs — one row per submission (speak / select / type / scan)
-- parent_log_id supports the "+ add to this log" append model
-- =====================================================================
create table logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  mode          text not null check (mode in ('speak', 'select', 'type', 'scan')),
  -- date_key = 'YYYY-MM-DD' in the user's local timezone. Stored as text
  -- (not date) so the client can compute it deterministically without
  -- worrying about server-side TZ conversion of the timestamptz.
  date_key      text not null,
  logged_at     timestamptz not null default now(),
  body          text,
  parent_log_id uuid references logs(id) on delete set null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_logs_user_date      on logs(user_id, date_key)      where deleted_at is null;
create index idx_logs_user_logged_at on logs(user_id, logged_at desc) where deleted_at is null;
create index idx_logs_parent         on logs(parent_log_id)           where parent_log_id is not null;

-- =====================================================================
-- log_chips — emotion keywords/chips attached to a log
-- =====================================================================
create table log_chips (
  id         uuid primary key default gen_random_uuid(),
  log_id     uuid not null references logs(id) on delete cascade,
  text       text not null,
  quadrant   text check (quadrant in ('hep', 'lep', 'hen', 'len')),
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);
create index idx_chips_log on log_chips(log_id);

-- =====================================================================
-- audit_log — append-only PHI access trail
-- =====================================================================
create table audit_log (
  id            bigserial primary key,
  actor_id      uuid references profiles(id) on delete set null,
  action        text not null check (action in ('insert', 'update', 'delete', 'read')),
  resource_type text not null,   -- 'log' | 'chip' | 'profile' | 'tp'
  resource_id   uuid,
  meta          jsonb,
  occurred_at   timestamptz not null default now()
);
create index idx_audit_actor_time on audit_log(actor_id, occurred_at desc);
create index idx_audit_resource   on audit_log(resource_type, resource_id);

-- =====================================================================
-- Helpers: updated_at trigger
-- =====================================================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- =====================================================================
-- Audit triggers — log every WRITE to PHI tables.
-- security definer so the trigger can insert into audit_log even when
-- the actor doesn't have an INSERT policy on it (audit is append-only
-- from the client's perspective).
-- =====================================================================
create or replace function audit_write() returns trigger
language plpgsql security definer as $$
declare
  v_action text;
  v_id     uuid;
begin
  v_action := lower(tg_op);
  if (tg_op = 'DELETE') then
    v_id := old.id;
  else
    v_id := new.id;
  end if;
  insert into audit_log (actor_id, action, resource_type, resource_id)
  values (auth.uid(), v_action, tg_argv[0], v_id);
  return null;  -- AFTER trigger; return value ignored
end $$;

create trigger audit_logs_write
  after insert or update or delete on logs
  for each row execute function audit_write('log');

create trigger audit_chips_write
  after insert or update or delete on log_chips
  for each row execute function audit_write('chip');

create trigger audit_profiles_write
  after insert or update or delete on profiles
  for each row execute function audit_write('profile');

-- =====================================================================
-- Row-Level Security
-- =====================================================================
alter table profiles            enable row level security;
alter table therapist_patients  enable row level security;
alter table logs                enable row level security;
alter table log_chips           enable row level security;
alter table audit_log           enable row level security;

-- ---- profiles ----
create policy "profiles self read"
  on profiles for select
  using (id = auth.uid() and deleted_at is null);

create policy "profiles self insert"
  on profiles for insert
  with check (id = auth.uid());

create policy "profiles self update"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Therapists can read profile rows of their linked, active patients.
create policy "profiles therapist read patient"
  on profiles for select
  using (
    deleted_at is null
    and exists (
      select 1 from therapist_patients tp
      where tp.therapist_id = auth.uid()
        and tp.patient_id   = profiles.id
        and tp.active
    )
  );

-- ---- therapist_patients ----
-- Both ends can see their own links; inserts/revokes belong to admin
-- or an Edge Function with the service role — no client INSERT policy.
create policy "tp read mine"
  on therapist_patients for select
  using (therapist_id = auth.uid() or patient_id = auth.uid());

-- ---- logs ----
create policy "logs owner all"
  on logs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "logs therapist read"
  on logs for select
  using (
    deleted_at is null
    and exists (
      select 1 from therapist_patients tp
      where tp.therapist_id = auth.uid()
        and tp.patient_id   = logs.user_id
        and tp.active
    )
  );

-- ---- log_chips ----
create policy "chips owner all"
  on log_chips for all
  using (
    exists (
      select 1 from logs
      where logs.id      = log_chips.log_id
        and logs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from logs
      where logs.id      = log_chips.log_id
        and logs.user_id = auth.uid()
    )
  );

create policy "chips therapist read"
  on log_chips for select
  using (
    exists (
      select 1 from logs l
      join therapist_patients tp on tp.patient_id = l.user_id
      where l.id            = log_chips.log_id
        and tp.therapist_id = auth.uid()
        and tp.active
        and l.deleted_at is null
    )
  );

-- ---- audit_log ----
-- Read-only for users (their own actions only). All inserts come from
-- the audit_write trigger (which runs as SECURITY DEFINER).
create policy "audit self read"
  on audit_log for select
  using (actor_id = auth.uid());
