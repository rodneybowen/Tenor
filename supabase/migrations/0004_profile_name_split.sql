-- Split profiles.display_name into first_name / last_name while
-- keeping display_name in place as a denormalized "First Last" copy.
-- Greeting code reads first_name; AccountScreen edits the two parts
-- and writes display_name as the concat.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

-- Backfill: best-effort split of any existing display_name on the
-- first space. Names with no space go entirely into first_name.
update public.profiles
set
  first_name = coalesce(first_name, split_part(display_name, ' ', 1)),
  last_name  = coalesce(
    last_name,
    nullif(trim(substring(display_name from position(' ' in display_name) + 1)), '')
  )
where display_name is not null
  and (first_name is null or last_name is null);
