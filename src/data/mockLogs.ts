import type { LogMode, Quadrant } from '../theme/emotions';

export interface LogEntry {
  id: string;
  /** 'YYYY-MM-DD' local day key */
  dateKey: string;
  /** display time, e.g. '2:14 PM' */
  time: string;
  /** epoch ms, for sorting within a day */
  ts: number;
  mode: LogMode;
  keywords: string[];
  /** emotion quadrant(s) this entry touched — drives dot + card colors */
  quadrants: Quadrant[];
  /** raw context the user produced — the transcript (speak), the typed
   *  text (type/scan, later), or the optional "what made you feel that
   *  way" note (emotion-selector). Empty/undefined for chip-only logs. */
  body?: string;
  /** per-keyword quadrant tagging, when available — used so the log
   *  detail screen can color each chip by its own quadrant. Parallel
   *  to `keywords`. Falls back to `quadrants[0]` for legacy mock logs. */
  chips?: { text: string; quadrant: Quadrant | null }[];
}

export interface WeekDay {
  /** 0 = Sun … 6 = Sat */
  index: number;
  /** single-letter label for the dot row */
  letter: string;
  dateKey: string;
  /** e.g. 'Wed, 20 May' */
  label: string;
  isToday: boolean;
  isFuture: boolean;
}

// Fixed reference "now" so the prototype is deterministic: Thu 21 May 2026.
// No persistence — refreshing resets everything (matches prototype scope).
export const TODAY = new Date(2026, 4, 21, 9, 30);

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export const TODAY_KEY = dateKey(TODAY);

/** 'h:MM AM/PM' for a freshly-submitted log. */
export function formatClock(d: Date): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** Sunday-anchored week containing TODAY. */
export function getWeek(): WeekDay[] {
  const start = new Date(TODAY);
  start.setDate(TODAY.getDate() - TODAY.getDay());
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dateKey(d);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      index: i,
      letter: DAY_LETTERS[i],
      dateKey: key,
      label: `${dayNames[i]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`,
      isToday: key === TODAY_KEY,
      isFuture: d.getTime() > TODAY.getTime(),
    };
  });
}

function keyFor(offsetFromSunday: number): string {
  const start = new Date(TODAY);
  start.setDate(TODAY.getDate() - TODAY.getDay() + offsetFromSunday);
  return dateKey(start);
}

// Seeded entries — Sun/Mon/Tue/Wed populated, today (Thu) deliberately empty
// so the home screen shows the empty-state CTA on first load. Future days blank.
export const MOCK_LOGS: LogEntry[] = [
  {
    id: 'l1',
    dateKey: keyFor(0), // Sun
    time: '9:12 PM',
    ts: 1,
    mode: 'speak',
    keywords: ['grateful', 'calm'],
    quadrants: ['hep', 'lep'],
  },
  {
    id: 'l2',
    dateKey: keyFor(1), // Mon
    time: '8:05 AM',
    ts: 1,
    mode: 'select',
    keywords: ['anxious', 'overwhelmed'],
    quadrants: ['hen'],
  },
  {
    id: 'l3',
    dateKey: keyFor(1), // Mon
    time: '10:47 PM',
    ts: 2,
    mode: 'speak',
    keywords: ['tired', 'drained'],
    quadrants: ['len'],
  },
  {
    id: 'l4',
    dateKey: keyFor(2), // Tue
    time: '3:30 PM',
    ts: 1,
    mode: 'speak',
    keywords: ['frustrated', 'irritated'],
    quadrants: ['hen'],
  },
  {
    id: 'l5',
    dateKey: keyFor(3), // Wed
    time: '7:40 AM',
    ts: 1,
    mode: 'select',
    keywords: ['hopeful', 'optimistic'],
    quadrants: ['hep'],
  },
  {
    id: 'l6',
    dateKey: keyFor(3), // Wed
    time: '2:14 PM',
    ts: 2,
    mode: 'speak',
    keywords: ['sad', 'lonely'],
    quadrants: ['len'],
  },
  {
    id: 'l7',
    dateKey: keyFor(3), // Wed
    time: '9:55 PM',
    ts: 3,
    mode: 'select',
    keywords: ['content', 'relaxed'],
    quadrants: ['lep'],
  },
];

export function logsForDay(dateKey: string, logs: LogEntry[]): LogEntry[] {
  return logs
    .filter((l) => l.dateKey === dateKey)
    .sort((a, b) => a.ts - b.ts);
}

export function quadrantsForDay(dateKey: string, logs: LogEntry[]) {
  return logsForDay(dateKey, logs).flatMap((l) => l.quadrants);
}

// ════════════════════════════════════════════════════════════════════
// Historical mock seeding (~180 days back from TODAY). Deterministic
// via a Mulberry32 PRNG seeded by a constant, so reloads are stable.
// ════════════════════════════════════════════════════════════════════

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_VOCAB: Record<Quadrant, string[]> = {
  hep: ['Happy', 'Excited', 'Grateful', 'Proud', 'Hopeful', 'Inspired'],
  lep: ['Calm', 'Content', 'Peaceful', 'Relaxed', 'At ease', 'Thankful'],
  hen: ['Anxious', 'Frustrated', 'Stressed', 'Angry', 'Tense', 'Overwhelmed'],
  len: ['Sad', 'Tired', 'Lonely', 'Empty', 'Numb', 'Disappointed'],
};
const SEED_MODES: LogMode[] = ['speak', 'select', 'speak', 'select', 'select'];
const SEED_QUADRANTS: Quadrant[] = ['hep', 'lep', 'hen', 'len'];

/** Build ~180 days of plausible historical entries so the Month / Year
 *  views have something to render. Determinism: same seed → same data. */
function seedHistoricalLogs(): LogEntry[] {
  const rand = mulberry32(0xC0FFEE);
  const out: LogEntry[] = [];
  // Walk backward from yesterday so we don't collide with today's
  // hand-authored fixtures (which power the home empty/populated states).
  const oldest = new Date(TODAY);
  oldest.setDate(oldest.getDate() - 180);
  oldest.setHours(0, 0, 0, 0);

  let id = 0;
  const cursor = new Date(oldest);
  while (cursor < TODAY) {
    const startOfWeekTuned = cursor.getDay(); // 0 Sun … 6 Sat
    // Slight weekday bias so the bars look organic — fewer logs on weekends.
    const baseCount = startOfWeekTuned === 0 || startOfWeekTuned === 6 ? 1 : 2;
    const drift = rand() < 0.35 ? 1 : 0;
    const skipDay = rand() < 0.18;
    const count = skipDay ? 0 : baseCount + drift;

    for (let i = 0; i < count; i++) {
      const q = SEED_QUADRANTS[Math.floor(rand() * 4)];
      const hour = 6 + Math.floor(rand() * 16); // 6am–9pm
      const minute = Math.floor(rand() * 60);
      const stamp = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate(),
        hour,
        minute,
      );
      const vocab = SEED_VOCAB[q];
      const kw1 = vocab[Math.floor(rand() * vocab.length)];
      // ~40% chance of a second keyword from the same quadrant.
      const kws = rand() < 0.4
        ? [kw1, vocab[Math.floor(rand() * vocab.length)]].filter(
            (k, idx, arr) => arr.indexOf(k) === idx,
          )
        : [kw1];
      const mode = SEED_MODES[Math.floor(rand() * SEED_MODES.length)];
      out.push({
        id: `seed-${id++}`,
        dateKey: dateKey(cursor),
        time: formatClock(stamp),
        ts: stamp.getTime(),
        mode,
        keywords: kws,
        quadrants: [q],
        chips: kws.map((k) => ({ text: k, quadrant: q })),
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** All logs — the seeded historical set plus the hand-authored fixtures
 *  for the current week. Export as ALL_LOGS so consumers can opt in to
 *  the full history (Logs screen) while the home week-card still uses
 *  just MOCK_LOGS for its tight current-week behavior. */
export const ALL_LOGS: LogEntry[] = [...seedHistoricalLogs(), ...MOCK_LOGS];

// ════════════════════════════════════════════════════════════════════
// Period helpers — used by the Logs D/W/M/Y views.
// ════════════════════════════════════════════════════════════════════

export type LogView = 'D' | 'W' | 'M' | 'Y';

/** First date (00:00) of the period containing `d` for the given view. */
export function periodStart(view: LogView, d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  if (view === 'D') return out;
  if (view === 'W') {
    out.setDate(out.getDate() - out.getDay()); // Sun
    return out;
  }
  if (view === 'M') {
    out.setDate(1);
    return out;
  }
  // Y
  out.setMonth(0, 1);
  return out;
}

/** Move an anchor forward (+1) or backward (-1) by one period of `view`. */
export function shiftPeriod(view: LogView, anchor: Date, dir: -1 | 1): Date {
  const out = new Date(anchor);
  if (view === 'D') out.setDate(out.getDate() + dir);
  else if (view === 'W') out.setDate(out.getDate() + dir * 7);
  else if (view === 'M') out.setMonth(out.getMonth() + dir);
  else out.setFullYear(out.getFullYear() + dir);
  return periodStart(view, out);
}

/** True when `anchor` covers a future period (forward chevron should disable). */
export function isFuturePeriod(view: LogView, anchor: Date): boolean {
  return periodStart(view, anchor).getTime() > periodStart(view, TODAY).getTime();
}

/** Pretty period label for the navigator: 'April 6 — April 13' / 'MARCH' / etc. */
export function periodLabel(view: LogView, anchor: Date): string {
  if (view === 'D') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${dayNames[anchor.getDay()]}, ${anchor.getDate()} ${MONTHS[anchor.getMonth()]}`;
  }
  if (view === 'W') {
    const end = new Date(anchor);
    end.setDate(end.getDate() + 6);
    return `${MONTHS[anchor.getMonth()]} ${anchor.getDate()} — ${MONTHS[end.getMonth()]} ${end.getDate()}`;
  }
  if (view === 'M') {
    return `${[
      'January','February','March','April','May','June','July','August','September','October','November','December',
    ][anchor.getMonth()]}`.toUpperCase();
  }
  return String(anchor.getFullYear());
}

/** Date keys for every day in the current period. */
export function periodDayKeys(view: LogView, anchor: Date): string[] {
  if (view === 'D') return [dateKey(anchor)];
  if (view === 'W') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      return dateKey(d);
    });
  }
  if (view === 'M') {
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return Array.from({ length: last }, (_, i) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth(), i + 1);
      return dateKey(d);
    });
  }
  // Y — return all dates in the year (used for year-breakdown bubble counts).
  const days: string[] = [];
  for (let m = 0; m < 12; m++) {
    const last = new Date(anchor.getFullYear(), m + 1, 0).getDate();
    for (let i = 1; i <= last; i++) days.push(dateKey(new Date(anchor.getFullYear(), m, i)));
  }
  return days;
}

/** All logs whose dateKey falls inside the given period. */
export function logsInPeriod(
  view: LogView,
  anchor: Date,
  source: LogEntry[],
): LogEntry[] {
  const keys = new Set(periodDayKeys(view, anchor));
  return source.filter((l) => keys.has(l.dateKey));
}

/** Per-quadrant counts inside a period — drives the breakdown bubbles. */
export function quadrantCountsInPeriod(
  view: LogView,
  anchor: Date,
  source: LogEntry[],
): Record<Quadrant, number> {
  const out: Record<Quadrant, number> = { hep: 0, lep: 0, hen: 0, len: 0 };
  for (const log of logsInPeriod(view, anchor, source)) {
    // Count each quadrant the entry touched (multi-quadrant logs contribute
    // to every quadrant they tagged).
    for (const q of log.quadrants) out[q] = (out[q] ?? 0) + 1;
  }
  return out;
}

/** Parse a 'YYYY-MM-DD' key back to a Date at midnight local. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
