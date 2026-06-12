-- Corrective patch for the 0004 backfill bug: a single-word
-- display_name (e.g. "Rohan") got copied into BOTH first_name and
-- last_name because `substring(s from position(' ' in s) + 1)`
-- evaluates to the whole string when no space exists.
--
-- This migration nulls out last_name on any row where it duplicates
-- first_name AND the source display_name has no space — those are
-- the exact rows the buggy backfill mishandled. Multi-word names
-- like "Rohan Bowen" are untouched. Resync display_name so it
-- reflects the corrected first/last pair.

update public.profiles
set
  last_name = null,
  display_name = first_name
where first_name is not null
  and last_name is not null
  and last_name = first_name
  and (display_name is null or position(' ' in display_name) = 0);
