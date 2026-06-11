import { useEffect, useState } from 'react';
import type { LogEntry } from '../data/mockLogs';
import { remainingEditMs, editWindowMs } from '../lib/editGate';
import { quadrantColor } from '../theme/emotions';

interface Props {
  log: LogEntry;
}

const SIZE = 20;
const STROKE = 2;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const URGENT_MS = 30 * 1000;

/**
 * EditWindowTimer — small depleting pie + M:SS countdown shown next to
 * the edit pencil while a log is still inside its edit window.
 *
 * Renders only for the 3-minute window (speak/type/select logs). Quick
 * logs use a 7-day window where a depleting pie is meaningless — they
 * keep the pencil but get no timer (returns null).
 *
 * The pie depletes clockwise from 12 o'clock as `remaining` shrinks
 * from the full window to 0. In the final 30s the arc switches to the
 * HEN quadrant color (the project's functional "urgency red"). Ticks
 * once a second via setInterval; returns null once the window closes.
 */
export default function EditWindowTimer({ log }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Quick logs (7-day window) don't get a pie — see component doc.
  if (log.source === 'quick') return null;

  const remaining = remainingEditMs(log, now);
  if (remaining <= 0) return null;

  const windowMs = editWindowMs(log);
  const fraction = Math.max(0, Math.min(1, remaining / windowMs));
  // dashoffset grows as the remaining fraction shrinks → arc depletes.
  const dashoffset = CIRC * (1 - fraction);

  const urgent = remaining <= URGENT_MS;
  const arcColor = urgent ? quadrantColor('hen', 1) : 'var(--n-700)';

  const totalSeconds = Math.ceil(remaining / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  const label = `${mm}:${String(ss).padStart(2, '0')}`;

  return (
    <div className="edit-timer" aria-label={`${label} left to edit`}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        {/* Rotate -90° so the arc starts at 12 o'clock; the negative
            dashoffset direction makes it deplete clockwise. */}
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--n-200)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={arcColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashoffset}
          />
        </g>
      </svg>
      <span className="edit-timer__text">{label}</span>
    </div>
  );
}
