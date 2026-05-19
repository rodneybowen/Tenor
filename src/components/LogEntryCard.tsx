import { Microphone, PencilSimple, Camera, SquaresFour, Clock } from '@phosphor-icons/react';
import type { LogEntry } from '../data/mockLogs';
import { blendGradient, type LogMode } from '../theme/emotions';

const MODE_ICON: Record<LogMode, typeof Microphone> = {
  speak: Microphone,
  type: PencilSimple,
  scan: Camera,
  select: SquaresFour,
};

const MODE_LABEL: Record<LogMode, string> = {
  speak: 'Voice note',
  type: 'Written',
  scan: 'Scanned',
  select: 'Emotion picker',
};

export default function LogEntryCard({ entry }: { entry: LogEntry }) {
  const ModeIcon = MODE_ICON[entry.mode];

  return (
    <article
      className="log-card"
      style={{ background: blendGradient(entry.quadrants) }}
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
    </article>
  );
}
