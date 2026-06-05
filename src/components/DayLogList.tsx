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

interface ConnectorGeom {
  rootId: string;
  top: number;
  height: number;
}

/**
 * Renders a day's worth of LogEntryCard with two thread-aware features:
 *
 *   1. Each card in a thread gets a "X logs" pill via `threadCount`.
 *   2. For every thread with 2+ cards on this day, a vertical dotted
 *      line spans absolutely from the first thread card's center to
 *      the last thread card's center. The line sits behind cards
 *      (z-index 0); cards are opaque (z-index 1). Where an unrelated
 *      log card falls between two thread cards, the unrelated card's
 *      opaque background covers the line — visually "the dotted line
 *      passes behind the unrelated card" per spec.
 *
 * The connector geometry is computed in a `useLayoutEffect` so we
 * measure after the browser has laid out the cards. It recomputes
 * when the day's logs change.
 */
export default function DayLogList({ dayLogs, allLogs, onOpen }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [connectors, setConnectors] = useState<ConnectorGeom[]>([]);

  // Group threads visible on this day.
  const threadGroups = new Map<string, LogEntry[]>();
  for (const log of dayLogs) {
    const size = getThreadSize(log, allLogs);
    if (size < 2) continue;
    const rootId = getRootLogId(log);
    const arr = threadGroups.get(rootId) ?? [];
    arr.push(log);
    threadGroups.set(rootId, arr);
  }

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const geoms: ConnectorGeom[] = [];

    for (const [rootId, members] of threadGroups) {
      if (members.length < 2) continue;
      const firstEl = cardRefs.current.get(members[0].id);
      const lastEl = cardRefs.current.get(members[members.length - 1].id);
      if (!firstEl || !lastEl) continue;
      const firstRect = firstEl.getBoundingClientRect();
      const lastRect = lastEl.getBoundingClientRect();
      // Span from the vertical center of the first thread card to the
      // vertical center of the last — keeps the line "rooted" in the
      // cards rather than dangling at their edges.
      const top = firstRect.top - containerTop + firstRect.height / 2;
      const bottom = lastRect.top - containerTop + lastRect.height / 2;
      geoms.push({ rootId, top, height: Math.max(0, bottom - top) });
    }
    setConnectors(geoms);
    // dayLogs / allLogs structure changes drive re-measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayLogs, allLogs]);

  return (
    <div className="day-log-list" ref={containerRef}>
      {connectors.map((c) => (
        <span
          key={c.rootId}
          className="thread-connector"
          aria-hidden="true"
          style={{ top: c.top, height: c.height }}
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
