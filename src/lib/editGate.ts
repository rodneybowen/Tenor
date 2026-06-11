// =====================================================================
// Edit gate — who can edit a log right now?
// =====================================================================
// Patients can NEVER edit transcript body or mode. Chips can be edited
// in two cases (spec: Core Product Decisions → Log immutability):
//
//   1. Any source EXCEPT 'quick': within 3 minutes of `logged_at` /
//      `ts`. After that the log is permanently immutable except for
//      "+ add to this log".
//
//   2. source === 'quick': **7-day** edit window from `logged_at`. A
//      quick log is fire-and-forget — the user wasn't watching the
//      screen, so they need a generous post-hoc review path. Spec
//      bumped from one-shot → 7d on Jun 9 ("in case there's
//      consecutive bad days where the user can't be bothered to
//      review for a while"). `edited_at` doesn't gate this — they can
//      keep refining within the window. Once 7 days pass, immutable
//      like everything else.
//
// `ts` is epoch ms (LogEntry's local timestamp; equals server
// `logged_at` after dbLogToLogEntry). `editedAt` is ISO; null/undefined
// = never edited.
// =====================================================================

import type { LogEntry } from '../data/mockLogs';

export const EDIT_WINDOW_MS = 3 * 60 * 1000;
export const QUICK_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function canEdit(log: LogEntry, now: number = Date.now()): boolean {
  if (log.source === 'quick') {
    return now - log.ts < QUICK_EDIT_WINDOW_MS;
  }
  // Speak / type / select / undefined-legacy → 3-minute window.
  return now - log.ts < EDIT_WINDOW_MS;
}

/** The window length that applies to this log, in ms. Source-aware:
 *  quick logs get the 7-day window, everything else 3 minutes. */
export function editWindowMs(log: LogEntry): number {
  return log.source === 'quick' ? QUICK_EDIT_WINDOW_MS : EDIT_WINDOW_MS;
}

/** Epoch ms at which the edit window closes. */
export function editWindowEnd(log: LogEntry): number {
  return log.ts + editWindowMs(log);
}

/** Milliseconds remaining in the edit window. 0 once expired. Used by
 *  EditWindowTimer for the pie fraction (needs ms precision, not the
 *  floored seconds `editSecondsRemaining` returns). */
export function remainingEditMs(log: LogEntry, now: number = Date.now()): number {
  return Math.max(0, editWindowEnd(log) - now);
}

/** Seconds remaining in the edit window — useful for a countdown
 *  indicator. Returns 0 once expired. */
export function editSecondsRemaining(log: LogEntry, now: number = Date.now()): number {
  return Math.max(0, Math.floor(remainingEditMs(log, now) / 1000));
}
