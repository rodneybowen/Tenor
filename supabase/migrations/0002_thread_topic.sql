-- =====================================================================
-- 0002_thread_topic.sql — "Add to this log" topic field
-- =====================================================================
-- Adds a nullable `topic` column to `logs` for user-named thread topics.
--
-- Storage rule: only the ROOT log of a thread (parent_log_id IS NULL,
-- with at least one child where another log's parent_log_id = root.id)
-- carries the topic value. Child logs leave this NULL. The client
-- denormalizes the topic onto every thread member in memory after
-- `fetchLogs` so card rendering doesn't need a lookup.
--
-- This migration is additive and non-breaking: existing rows get NULL,
-- standalone logs (no parent, no children) leave it NULL forever, and
-- the existing RLS policies on `logs` already cover all reads/writes.
-- The `audit_log` trigger on UPDATE captures topic renames automatically.
-- =====================================================================

ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS topic TEXT;

COMMENT ON COLUMN public.logs.topic IS
  'User-named topic for a thread. Set only on the root log (parent_log_id IS NULL with children); NULL on standalone logs and child logs in the thread.';
