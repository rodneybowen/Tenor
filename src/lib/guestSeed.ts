// =====================================================================
// Guest mode seed data
// =====================================================================
// Generates exactly 4 logs from YESTERDAY (calendar day before the
// device's current date), covering a mix of quadrants and modes so the
// "This week's mood" card and Day-view mood line both have something to
// render the moment a guest opens the app.
//
// Today starts empty by design — the guest naturally lands on the
// "log your first entry" flow.
//
// Built relative to `new Date()`, so the seed is always anchored to
// "yesterday" no matter when the app is opened. No fixed dates.
// =====================================================================

import type { LogEntry } from '../data/mockLogs';
import { formatClock } from '../data/mockLogs';

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Build a Date for yesterday at a given hour/minute (local time). */
function yesterdayAt(hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Four canned logs for yesterday — a HEP speak, an LEN select, an
 *  HEN speak, an LEP select. Time-of-day spread morning → night so the
 *  Day mood line shows a real arc. Order in the returned array is by
 *  ts ascending; the home/day-view render code re-sorts anyway. */
export function buildGuestSeed(): LogEntry[] {
  const morning = yesterdayAt(8, 24);
  const noon = yesterdayAt(12, 47);
  const afternoon = yesterdayAt(15, 12);
  const evening = yesterdayAt(21, 38);
  const yKey = dateKey(morning);

  return [
    {
      id: `g-${morning.getTime()}`,
      dateKey: yKey,
      time: formatClock(morning),
      ts: morning.getTime(),
      mode: 'speak',
      keywords: ['excited', 'energized', 'hopeful'],
      quadrants: ['hep'],
      body: "Woke up actually looking forward to today — feels rare lately. Got a lot I want to get done.",
      chips: [
        { text: 'excited', quadrant: 'hep' },
        { text: 'energized', quadrant: 'hep' },
        { text: 'hopeful', quadrant: 'hep' },
      ],
    },
    {
      id: `g-${noon.getTime()}`,
      dateKey: yKey,
      time: formatClock(noon),
      ts: noon.getTime(),
      mode: 'select',
      keywords: ['calm', 'content', 'grounded'],
      quadrants: ['lep'],
      chips: [
        { text: 'calm', quadrant: 'lep' },
        { text: 'content', quadrant: 'lep' },
        { text: 'grounded', quadrant: 'lep' },
      ],
    },
    {
      id: `g-${afternoon.getTime()}`,
      dateKey: yKey,
      time: formatClock(afternoon),
      ts: afternoon.getTime(),
      mode: 'speak',
      keywords: ['frustrated', 'overwhelmed', 'tense'],
      quadrants: ['hen'],
      body: "Two meetings landed back to back and I haven't eaten. Snapped at someone on Slack and now I feel bad about it.",
      chips: [
        { text: 'frustrated', quadrant: 'hen' },
        { text: 'overwhelmed', quadrant: 'hen' },
        { text: 'tense', quadrant: 'hen' },
      ],
    },
    {
      id: `g-${evening.getTime()}`,
      dateKey: yKey,
      time: formatClock(evening),
      ts: evening.getTime(),
      mode: 'select',
      keywords: ['tired', 'lonely', 'melancholy'],
      quadrants: ['len'],
      chips: [
        { text: 'tired', quadrant: 'len' },
        { text: 'lonely', quadrant: 'len' },
        { text: 'melancholy', quadrant: 'len' },
      ],
    },
  ];
}

// ---------------------------------------------------------------------
// sessionStorage persistence
// ---------------------------------------------------------------------
// Logs survive page reloads within the same tab via sessionStorage.
// Cleared automatically when the tab closes (or the session expires
// after lengthy inactivity — that's iOS Safari behavior, not ours).
// Stored under a versioned key so a schema change here doesn't load
// stale shapes from an old session.

const STORAGE_KEY = 'tenor:guest:logs:v1';

export function loadGuestLogs(): LogEntry[] | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LogEntry[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGuestLogs(logs: LogEntry[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // sessionStorage may be unavailable (privacy mode) — fail silently;
    // logs still live in React state for the current page load.
  }
}

export function clearGuestLogs(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
