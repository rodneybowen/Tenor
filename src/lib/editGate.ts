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
//   2. source === 'quick': exactly ONE edit attempt, not time-gated.
//      `edited_at` being non-null means the one shot is spent.
//
// `ts` is epoch ms (LogEntry's local timestamp; equals server
// `logged_at` after dbLogToLogEntry). `editedAt` is ISO; null/undefined
// = never edited.
// =====================================================================

import type { LogEntry } from '../data/mockLogs';

export const EDIT_WINDOW_MS = 3 * 60 * 1000;

export function canEdit(log: LogEntry, now: number = Date.now()): boolean {
  if (log.source === 'quick') {
    // One-shot, not time-gated.
    return log.editedAt == null;
  }
  // Speak / type / select / undefined-legacy → 3-minute window.
  return now - log.ts < EDIT_WINDOW_MS;
}

/** Seconds remaining in the edit window — useful for a countdown
 *  indicator. Returns 0 once expired. For quick logs returns Infinity
 *  while the one shot is still available (no countdown applies). */
export function editSecondsRemaining(log: LogEntry, now: number = Date.now()): number {
  if (log.source === 'quick') {
    return log.editedAt == null ? Infinity : 0;
  }
  const ms = EDIT_WINDOW_MS - (now - log.ts);
  return Math.max(0, Math.floor(ms / 1000));
}
