import { useMemo, useState, type FormEvent } from 'react';
import { Plus } from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import LogEntryCard from '../components/LogEntryCard';
import { DayMoodLine } from './LogsScreen';
import { getRootLogId, getThreadLogs } from '../lib/threads';
import type { LogEntry } from '../data/mockLogs';

interface Props {
  /** The thread's root log id (every member of the thread points to this). */
  rootLogId: string;
  /** Full log set — used to resolve thread members + topic + ordering. */
  allLogs: LogEntry[];
  onBack: () => void;
  /** Open an individual log's LogDetailScreen. */
  onOpenLog: (id: string) => void;
  /** Append a new log to this thread via the normal log flow. */
  onAddToLog: () => void;
  /** Persist a new topic name. Empty string clears the topic. */
  onRenameTopic: (topic: string) => void;
}

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Per the spec: if the oldest log in the thread is within 6 days of
 *  today (≤6 days ago), every card uses "Day | time" (e.g. "Wed | 11:09 am").
 *  Otherwise every card uses "DMonth | time" (e.g. "9 Feb | 11:09 am").
 *  The format is uniform across the thread — picked once from the oldest. */
function formatDateLabel(d: Date, useDayName: boolean): string {
  const time = d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  }).toLowerCase();
  if (useDayName) {
    return `${DAYS_SHORT[d.getDay()]} | ${time}`;
  }
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} | ${time}`;
}

function daysBetween(a: Date, b: Date): number {
  // Compare calendar days, not millis — "within 6 days" is a date-bucket
  // notion, not a 6 × 86400s window.
  const startOfA = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const startOfB = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((startOfB.getTime() - startOfA.getTime()) / 86_400_000);
}

export default function LogThreadScreen({
  rootLogId,
  allLogs,
  onBack,
  onOpenLog,
  onAddToLog,
  onRenameTopic,
}: Props) {
  // Resolve thread members in chronological order (oldest first).
  const threadLogs = useMemo(() => {
    const root = allLogs.find((l) => l.id === rootLogId);
    if (!root) return [];
    return getThreadLogs(root, allLogs);
  }, [allLogs, rootLogId]);

  const root = threadLogs[0] ?? null;
  const topic = root?.topic ?? null;

  // Inline rename state. Tapping the header swaps the h1 for an input.
  const [renaming, setRenaming] = useState(false);
  const [draftTopic, setDraftTopic] = useState('');

  function startRename() {
    setDraftTopic(topic ?? '');
    setRenaming(true);
  }
  function commitRename(e?: FormEvent) {
    e?.preventDefault();
    onRenameTopic(draftTopic.trim());
    setRenaming(false);
  }
  function cancelRename() {
    setRenaming(false);
  }

  // Date format mode based on the oldest log in the thread.
  const useDayName = useMemo(() => {
    if (threadLogs.length === 0) return true;
    const oldest = new Date(threadLogs[0].ts);
    const days = daysBetween(oldest, new Date());
    return days <= 6;
  }, [threadLogs]);

  return (
    <div className="screen" id="log-thread">
      <header className="lt-header">
        <BackButton onClick={onBack} />
      </header>

      <div className="lt-scroll">
        <section className="lt-topic">
          {renaming ? (
            <form className="lt-topic__form" onSubmit={commitRename}>
              <input
                autoFocus
                type="text"
                className="lt-topic__input"
                value={draftTopic}
                onChange={(e) => setDraftTopic(e.target.value)}
                onBlur={() => commitRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRename();
                  }
                }}
                maxLength={60}
                placeholder="Name this thread"
                aria-label="Edit thread topic"
              />
            </form>
          ) : (
            <button
              type="button"
              className="lt-topic__heading"
              onClick={startRename}
              aria-label={
                topic ? `Edit topic: ${topic}` : 'Name this thread'
              }
            >
              <h1>{topic && topic.length > 0 ? topic : 'Untitled'}</h1>
            </button>
          )}
        </section>

        <section className="lt-mood">
          <h3 className="lt-mood__title">Your mood on this topic</h3>
          <DayMoodLine logs={threadLogs} />
        </section>

        {/* Cards + "+ add to this log" share one flex column. Each
            gap between consecutive cards (and between the last card
            and the button) renders a dotted vertical line — per sketch.
            The button is INLINE here, not a floating footer; the line
            terminates at it. */}
        <section className="lt-chain" aria-label="Logs in this thread">
          {threadLogs.map((entry, i) => {
            const label = formatDateLabel(new Date(entry.ts), useDayName);
            return (
              <div key={entry.id} className="lt-chain__row">
                <LogEntryCard
                  entry={{ ...entry, time: label }}
                  onOpen={onOpenLog}
                />
                <span
                  className="lt-chain__line"
                  aria-hidden="true"
                  data-last={i === threadLogs.length - 1 ? 'true' : 'false'}
                />
              </div>
            );
          })}
          <button
            type="button"
            className="btn-primary lt-chain__add"
            onClick={onAddToLog}
          >
            <Plus size={16} weight="bold" />
            add to this log
          </button>
        </section>
      </div>
    </div>
  );
}

// Re-export so App.tsx can import alongside LogsScreen if needed.
export { getRootLogId };
