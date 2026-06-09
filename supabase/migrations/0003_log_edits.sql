-- =====================================================================
-- 0003_log_edits.sql — 3-minute edit window + Quick Log source tag
-- =====================================================================
-- Adds two columns to `logs`:
--
--   source TEXT — which input flow produced this row. 'speak' is the
--     historical default since every existing row pre-migration is a
--     voice log (see backfill below). 'quick' marks shortcut-triggered
--     logs; they get exactly one edit attempt, not time-gated.
--
--   edited_at TIMESTAMPTZ — null until the first (and only, for quick
--     logs) chip edit lands. `logged_at` stays immutable; this column
--     is provenance, not a replacement.
--
-- Edit gate (enforced in the client; the DB doesn't reject late edits
-- by itself — that's policy work for a future migration):
--   • All sources: edited within 3 minutes of `logged_at`
--   • source = 'quick': one edit attempt regardless of time
--
-- The existing audit trigger on `logs` already captures UPDATEs in
-- `audit_log`, so no trigger change is needed — bumping `edited_at`
-- is logged automatically.
-- =====================================================================

ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'speak'
    CHECK (source IN ('speak', 'type', 'select', 'quick'));

ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.logs.source IS
  'Input flow that produced this log: speak (voice review), type (text), select (emotion picker), quick (shortcut). Drives the edit-window policy (3 min for non-quick; one-shot for quick).';
COMMENT ON COLUMN public.logs.edited_at IS
  'Timestamp of the first (and only, for quick logs) chip edit. NULL until edited. Separate from logged_at, which never changes — edited_at is provenance.';
