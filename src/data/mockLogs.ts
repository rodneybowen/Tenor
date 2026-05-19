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
