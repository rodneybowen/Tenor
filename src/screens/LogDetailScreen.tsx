import { House, Plus, X } from '@phosphor-icons/react';
import { type LogEntry } from '../data/mockLogs';
import { quadrantColor, type Quadrant } from '../theme/emotions';

interface Props {
  log: LogEntry;
  /** True when the user just finished submitting a new log. Changes the
   *  layout: instead of the corner × + "+ add" primary, we show a stacked
   *  primary "back to home" + secondary "+ add to this log" at the bottom
   *  (most natural action ordering immediately after a submission). */
  justSubmitted?: boolean;
  /** Where to go when × (or the post-log primary) is hit. The parent decides;
   *  this screen just calls it. */
  onClose: () => void;
  onAddToLog: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Build the header date from the LogEntry's dateKey (the source of truth for
 *  the day). `ts` is only reliable for newly-submitted entries — mock entries
 *  have a placeholder ts so we shouldn't render from it. */
function formatLogDate(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** Per-chip quadrant: prefer the rich .chips field, fall back to mapping all
 *  keywords to the entry's first quadrant for legacy/mock entries. */
function chipQuadrants(log: LogEntry): (Quadrant | null)[] {
  if (log.chips && log.chips.length === log.keywords.length) {
    return log.chips.map((c) => c.quadrant);
  }
  const fallback = log.quadrants[0] ?? null;
  return log.keywords.map(() => fallback);
}

function bodyFor(log: LogEntry): { text: string; empty: boolean } {
  const raw = log.body?.trim() ?? '';
  if (raw) return { text: raw, empty: false };
  // Only the emotion-selector mode has a meaningful "no context" placeholder —
  // for speak/type/scan an empty body means the source didn't capture text.
  if (log.mode === 'select') return { text: 'No context added.', empty: true };
  return { text: '', empty: true };
}

export default function LogDetailScreen({
  log,
  justSubmitted = false,
  onClose,
  onAddToLog,
}: Props) {
  const date = formatLogDate(log.dateKey);
  const quads = chipQuadrants(log);
  const { text: body, empty: bodyEmpty } = bodyFor(log);

  return (
    <div className="screen" id="log-detail">
      {/* Corner close only when the user is *viewing* a past log; after a
          fresh submission the close action lives at the bottom as a
          primary "back to home" button instead. */}
      {!justSubmitted && (
        <button
          type="button"
          className="ld-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} weight="bold" />
        </button>
      )}

      <div className="ld-body">
        <header className="ld-header">
          <h3>{date}</h3>
          <h3>{log.time}</h3>
        </header>

        {log.keywords.length > 0 && (
          <div className="ld-chips">
            {log.keywords.map((kw, i) => {
              const q = quads[i];
              return (
                <span
                  key={`${kw}-${i}`}
                  className="ld-chip"
                  style={
                    q
                      ? {
                          background: quadrantColor(q, 0.32),
                          borderColor: quadrantColor(q, 0.55),
                        }
                      : {
                          background: 'rgba(255,255,255,0.65)',
                          borderColor: 'rgba(34,34,34,0.12)',
                        }
                  }
                >
                  {kw}
                </span>
              );
            })}
          </div>
        )}

        <div
          className={
            'ld-context' + (bodyEmpty ? ' ld-context--empty' : '')
          }
        >
          <p>{body}</p>
        </div>
      </div>

      <div className="ld-actions">
        {justSubmitted ? (
          <>
            <button type="button" className="btn-primary" onClick={onClose}>
              <House size={16} weight="regular" />
              back to home
            </button>
            <button type="button" className="btn-secondary" onClick={onAddToLog}>
              <Plus size={16} weight="bold" />
              add to this log
            </button>
          </>
        ) : (
          <button type="button" className="btn-primary" onClick={onAddToLog}>
            <Plus size={16} weight="bold" />
            add to this log
          </button>
        )}
      </div>
    </div>
  );
}
