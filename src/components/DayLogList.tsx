import type { LogEntry } from '../data/mockLogs';
import { getThreadSize } from '../lib/threads';
import LogEntryCard from './LogEntryCard';

interface Props {
  /** Logs for a single day, in render order (oldest → newest). */
  dayLogs: LogEntry[];
  /** Full log set so each card can resolve its thread size. */
  allLogs: LogEntry[];
  onOpen?: (id: string) => void;
}

/**
 * Renders a day's worth of LogEntryCard with the "X logs" thread pill
 * attached to any card that belongs to a thread of 2+. The pill is the
 * single visual signal that a card is part of a thread — no inter-card
 * connector line. (We tried a dotted line between same-day thread cards
 * but it felt inconsistent with cross-day threads where the line was
 * intentionally omitted; the pill alone reads as the cleaner cue.)
 */
export default function DayLogList({ dayLogs, allLogs, onOpen }: Props) {
  return (
    <div className="day-log-list">
      {dayLogs.map((entry) => (
        <div key={entry.id} className="day-log-list__card">
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
