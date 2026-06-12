-- Notification / Reminder System (Jun 12 2026)
-- Backs the two-stage daily reminder on iOS (Capacitor local notifications)
-- and web/PWA (Web Push). See TENOR_CONTEXT.md →
-- "Detailed Flow: Notification / Reminder System" for the user-facing spec.
--
-- profiles columns
-- ─────────────────
-- reminder_enabled       — user-toggled on/off, default on so users opt OUT.
-- reminder_time          — local-wallclock hour:minute the cycle starts at;
--                          the day boundary + "is it that time yet?" check
--                          happens in profiles.timezone (already populated).
-- last_reminder_date     — local date the cycle last advanced for. Reset
--                          to today (in tz) when a new local day starts.
-- last_reminder_stage    — 0 = nothing sent today, 1 = stage 1 sent,
--                          2 = stage 2 sent / cycle complete.
--
-- push_subscriptions
-- ──────────────────
-- One row per (user, browser/device) Web Push endpoint. The unique
-- constraint on `endpoint` makes upserts trivial — re-subscribing
-- from the same browser overwrites the row instead of duplicating.
-- iOS local notifications don't go through this table.

alter table public.profiles
  add column if not exists reminder_enabled    boolean   not null default true,
  add column if not exists reminder_time       time      not null default '20:00:00',
  add column if not exists last_reminder_date  date,
  add column if not exists last_reminder_stage smallint  not null default 0;

create table if not exists public.push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  endpoint    text        not null unique,
  p256dh      text        not null,
  auth        text        not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- RLS: each authenticated user can only touch rows that belong to them.
-- The Edge Function sender runs with the service role and bypasses RLS,
-- so it can still read every user's subscriptions when fanning out pushes.
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());
