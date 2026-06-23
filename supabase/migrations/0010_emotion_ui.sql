-- 0010_emotion_ui.sql
-- Emotion Selector v2 — Starburst variant (speced 2026-06-15, locked 2026-06-22)
--
-- profiles.emotion_ui: which selector the user sees ('classic' = existing
--   4-quadrant grid, 'starburst' = 6 base emotions on the fisheye plane).
--   No usage counters / prompt-shown / first-choice telemetry — deliberate
--   for mental-health context.
--
-- logs.base_emotion: only populated when the log came from starburst mode.
--   Classic logs keep this NULL. 'numb' selections also stay NULL because
--   numb isn't one of the six base emotions; the existing emotion_name
--   column carries the value.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emotion_ui TEXT NOT NULL DEFAULT 'classic'
    CHECK (emotion_ui IN ('classic', 'starburst'));

ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS base_emotion TEXT
    CHECK (base_emotion IN ('surprise', 'joy', 'love', 'fear', 'anger', 'sadness'));
