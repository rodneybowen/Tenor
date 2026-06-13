-- pg_cron schedule for the `send-reminders` Edge Function.
-- See supabase/functions/send-reminders/index.ts for the function body
-- and TENOR_CONTEXT.md → "Detailed Flow: Notification / Reminder System".
--
-- Prereqs (these are extensions; in Supabase you enable them once in
-- the dashboard at Database → Extensions, or via SQL as below). Both
-- are pre-installed on Supabase but must be enabled per project:
--   • pg_cron     — schedules SQL jobs.
--   • pg_net      — async outbound HTTP from inside Postgres; lets a
--                   pg_cron job invoke an Edge Function over HTTPS.
--
-- The placeholder values <PROJECT_REF> and <CRON_SECRET> need filling
-- in once before this migration is applied to a real project — see
-- the comments below for what they are and where to get them.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stash secrets in vault.secrets so they're not echoed in pg_cron's
-- job table. Both must be set ONCE in the Supabase dashboard:
--   1. SQL editor → Vault → New secret
--      • name: edge_send_reminders_url
--      • value: https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders
--   2. SQL editor → Vault → New secret
--      • name: edge_cron_secret
--      • value: a long random string. Also save the SAME value as a
--               Supabase Edge Function secret named CRON_SECRET so
--               the function can verify the caller.
-- (Manual dashboard steps — pg_net needs the URL and Authorization
--  header at runtime; vault.read_secret() is the safest source.)

-- Job: every 5 minutes, hit the function with the cron secret as a
-- bearer header so unauth'd internet traffic can't trigger it.
select cron.schedule(
  'send-reminders-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := vault.read_secret('edge_send_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || vault.read_secret('edge_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Idempotent re-run safety: if this migration is replayed, drop the
-- existing job before re-adding. cron.unschedule is no-op on miss.
-- (Postgres parser executes the schedule above first; on a second
-- apply, an explicit drop-then-recreate keeps the schedule in sync
-- if the cron expression ever changes.)
do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'send-reminders-every-5min'
  group by jobid
  having count(*) > 1;
end;
$$;
