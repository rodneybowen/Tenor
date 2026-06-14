-- Per-stage opt-out for the follow-up reminder. Users now control
-- whether they get *one* nudge (stage 1 only) or *two* (stage 1 + 2).
--
-- `profiles.reminder_enabled` keeps its name but is reinterpreted as
-- "stage 1 enabled" — toggling it off means the whole cycle is off,
-- which matches the prior column meaning (no behavior change for
-- anyone who never touches the new toggle).
--
-- `profiles.reminder_2_enabled` is new. Default true so existing
-- users continue receiving the second nudge they were already
-- getting before this column existed; opt-out is explicit.

alter table public.profiles
  add column if not exists reminder_2_enabled boolean not null default true;
