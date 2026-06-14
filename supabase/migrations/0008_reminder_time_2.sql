-- Split the reminder cadence: stage 2 used to fire automatically
-- +30 minutes after stage 1 (`reminder_time`). The user now picks
-- both times independently. Stage 1 stays on `reminder_time`;
-- stage 2 moves to the new `reminder_time_2` column.
--
-- Backfill: existing rows get reminder_time_2 = reminder_time +
-- 30 minutes (the prior implicit gap), so the cycle behaves
-- identically for users who haven't touched the new picker yet.

alter table public.profiles
  add column if not exists reminder_time_2 time;

update public.profiles
set reminder_time_2 = (reminder_time + interval '30 minutes')::time
where reminder_time_2 is null;

alter table public.profiles
  alter column reminder_time_2 set not null,
  alter column reminder_time_2 set default '20:30:00';
