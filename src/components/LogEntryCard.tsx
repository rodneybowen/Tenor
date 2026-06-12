import { Microphone, PencilSimple, SquaresFour, Clock } from '@phosphor-icons/react';
import type { LogEntry } from '../data/mockLogs';
import { blendGradient, type LogMode } from '../theme/emotions';

const MODE_ICON: Record<LogMode, typeof Microphone> = {
  speak: Microphone,
  type: PencilSimple,
  select: SquaresFour,
};

const MODE_LABEL: Record<LogMode, string> = {
  speak: 'Voice note',
  type: 'Written',
  select: 'Emotion picker',
};

interface Props {
  entry: LogEntry;
  onOpen?: (id: string) => void;
  /** If set, render the "X logs" pill on the bottom border (half-in,
   *  half-out, centered). When `undefined`/0 the pill is not rendered.
   *  The caller is responsible for computing the count from the
   *  thread; this component just draws. */
  threadCount?: number;
}

export default function LogEntryCard({ entry, onOpen, threadCount }: Props) {
  const ModeIcon = MODE_ICON[entry.mode];
  const clickable = !!onOpen;
  const showPill = typeof threadCount === 'number' && threadCount > 1;

  return (
    <article
      className={
        'log-card' +
        (clickable ? ' log-card--interactive' : '') +
        (showPill ? ' log-card--threaded' : '')
      }
      style={{ background: blendGradient(entry.quadrants) }}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Open log from ${entry.time}` : undefined}
      onClick={() => onOpen?.(entry.id)}
      onKeyDown={(e) => {
        if (clickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen?.(entry.id);
        }
      }}
    >
      <div className="log-card__body">
        <div className="log-card__keywords">
          {entry.keywords.map((k) => (
            <span className="keyword" key={k}>
              {k}
            </span>
          ))}
        </div>
        <div className="log-card__meta">
          <Clock size={13} weight="regular" />
          <span>{entry.time}</span>
          <span aria-hidden="true">·</span>
          <span>{MODE_LABEL[entry.mode]}</span>
        </div>
      </div>
      <div
        className="log-card__icon"
        title={MODE_LABEL[entry.mode]}
        aria-hidden="true"
      >
        <ModeIcon size={16} weight="regular" />
      </div>
      {showPill && (
        <span
          className="log-card__thread-pill"
          aria-label={`${threadCount} logs in this thread`}
        >
          {threadCount} logs
        </span>
      )}
    </article>
  );
}
