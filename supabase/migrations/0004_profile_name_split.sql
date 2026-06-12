-- Split profiles.display_name into first_name / last_name while
-- keeping display_name in place as a denormalized "First Last" copy.
-- Greeting code reads first_name; AccountScreen edits the two parts
-- and writes display_name as the concat.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

-- Backfill: best-effort split of any existing display_name on the
-- first space. Names with no space go entirely into first_name —
-- last_name stays NULL. (Earlier revision of this migration had a
-- bug where `substring(... from position(' ' in display_name) + 1)`
-- evaluates to the WHOLE string when there's no space, duplicating
-- the single-word name into last_name. See 0005 for the corrective
-- patch on databases that already ran the buggy version.)
update public.profiles
set
  first_name = coalesce(first_name, split_part(display_name, ' ', 1)),
  last_name  = coalesce(
    last_name,
    case
      when position(' ' in display_name) > 0
        then nullif(trim(substring(display_name from position(' ' in display_name) + 1)), '')
      else null
    end
  )
where display_name is not null
  and (first_name is null or last_name is null);
