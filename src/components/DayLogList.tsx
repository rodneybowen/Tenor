import { useLayoutEffect, useRef, useState } from 'react';
import type { LogEntry } from '../data/mockLogs';
import { getRootLogId, getThreadSize } from '../lib/threads';
import LogEntryCard from './LogEntryCard';

interface Props {
  /** Logs for a single day, in render order (oldest → newest). */
  dayLogs: LogEntry[];
  /** Full log set so each card can resolve its thread size. */
  allLogs: LogEntry[];
  onOpen?: (id: string) => void;
}

interface SegmentGeom {
  /** Stable key for React reconciliation across re-measures. */
  key: string;
  top: number;
  height: number;
}

/**
 * Renders a day's worth of LogEntryCard with two thread-aware features:
 *
 *   1. Each card in a thread gets a "X logs" pill via `threadCount`.
 *   2. For every consecutive pair of cards in the same thread on this
 *      day, a vertical dotted SEGMENT is drawn in the gap between
 *      them — from the bottom edge of card N to the top edge of card
 *      N+1. We render per-gap (not a single span behind the cards)
 *      because card backgrounds are translucent gradients; a
 *      continuous line behind them would bleed through visually.
 *
 * Segments are positioned absolutely against the list container and
 * measured in `useLayoutEffect` so the geometry is correct on first
 * paint and re-measured when the day's logs change.
 */
export default function DayLogList({ dayLogs, allLogs, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [segments, setSegments] = useState<SegmentGeom[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const geoms: SegmentGeom[] = [];

    // Walk consecutive pairs of rendered cards (DOM order). If both
    // belong to the same thread (root id matches), draw a segment in
    // the gap between them. Unrelated card in between → no segment
    // crosses it; the dotted line just isn't drawn there.
    for (let i = 0; i < dayLogs.length - 1; i++) {
      const a = dayLogs[i];
      const b = dayLogs[i + 1];
      const aRoot = getRootLogId(a);
      const bRoot = getRootLogId(b);
      if (aRoot !== bRoot) continue;
      // Only draw if the thread actually has 2+ members across the
      // whole log set. Defensive — same root on two day-adjacent
      // logs already implies they're in a thread, but cheap check.
      if (getThreadSize(a, allLogs) < 2) continue;
      const aEl = cardRefs.current.get(a.id);
      const bEl = cardRefs.current.get(b.id);
      if (!aEl || !bEl) continue;
      const aRect = aEl.getBoundingClientRect();
      const bRect = bEl.getBoundingClientRect();
      const top = aRect.bottom - containerTop;
      const bottom = bRect.top - containerTop;
      const height = bottom - top;
      if (height <= 0) continue;
      geoms.push({ key: `${a.id}->${b.id}`, top, height });
    }
    setSegments(geoms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayLogs, allLogs]);

  return (
    <div className="day-log-list" ref={containerRef}>
      {segments.map((s) => (
        <span
          key={s.key}
          className="thread-connector"
          aria-hidden="true"
          style={{ top: s.top, height: s.height }}
        />
      ))}
      {dayLogs.map((entry) => (
        <div
          key={entry.id}
          className="day-log-list__card"
          ref={(el) => {
            if (el) cardRefs.current.set(entry.id, el);
            else cardRefs.current.delete(entry.id);
          }}
        >
          <LogEntryCard
            entry={entry}
            onOpen={onOpen}
            threadCount={getThreadSize(entry, allLogs)}
          />
        </div>
      ))}
    </div>
  );
}
