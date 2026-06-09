import { useState } from 'react';
import {
  Check,
  CheckCircle,
  CircleNotch,
  House,
  PencilSimple,
  Plus,
  X,
} from '@phosphor-icons/react';
import { type LogEntry } from '../data/mockLogs';
import { quadrantColor, type Quadrant } from '../theme/emotions';
import { classify } from '../lib/emotionDetect';
import { canEdit } from '../lib/editGate';

interface ChipDraft {
  text: string;
  quadrant: Quadrant | null;
}

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
  /** Persist a chip-only edit. Parent: updateLogChips on Supabase,
   *  mirror new chips + editedAt into App state, throw on failure. */
  onSaveChips?: (
    logId: string,
    chips: { text: string; quadrant: Quadrant | null }[],
  ) => Promise<void>;
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

function chipStyle(q: Quadrant | null) {
  if (!q) {
    return {
      background: 'rgba(255,255,255,0.65)',
      borderColor: 'rgba(34,34,34,0.12)',
    };
  }
  return {
    background: quadrantColor(q, 0.32),
    borderColor: quadrantColor(q, 0.55),
  };
}

function initialDraft(log: LogEntry): ChipDraft[] {
  if (log.chips && log.chips.length > 0) {
    return log.chips.map((c) => ({ text: c.text, quadrant: c.quadrant }));
  }
  const q = log.quadrants[0] ?? null;
  return log.keywords.map((text) => ({ text, quadrant: q }));
}

export default function LogDetailScreen({
  log,
  justSubmitted = false,
  onClose,
  onAddToLog,
  onSaveChips,
}: Props) {
  const date = formatLogDate(log.dateKey);
  const quads = chipQuadrants(log);
  const { text: body, empty: bodyEmpty } = bodyFor(log);

  // Edit-mode state. Only mounted when the user taps the pencil — we
  // keep the original render path untouched in the common case.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ChipDraft[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Show pencil only on a past-log view (not after a fresh submission),
  // only when the gate allows, and only when we have a save handler.
  const showPencil =
    !justSubmitted && !editing && !!onSaveChips && canEdit(log);

  function enterEdit() {
    setDraft(initialDraft(log));
    setEditingIdx(null);
    setSaveError(null);
    setEditing(true);
  }
  function cancelEdit() {
    setEditing(false);
    setEditingIdx(null);
    setDraft([]);
    setSaveError(null);
  }
  function commitChip(idx: number, value: string) {
    const text = value.trim();
    setDraft((cur) => {
      if (!text) return cur.filter((_, i) => i !== idx);
      const next = [...cur];
      next[idx] = { text, quadrant: classify(text) };
      return next;
    });
    setEditingIdx(null);
  }
  function removeChip(idx: number) {
    setDraft((cur) => cur.filter((_, i) => i !== idx));
    setEditingIdx(null);
  }
  function addChip() {
    setDraft((cur) => [...cur, { text: '', quadrant: null }]);
    setEditingIdx(draft.length);
  }
  async function saveEdit() {
    if (!onSaveChips || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Drop any blank rows the user added but never filled.
      const cleaned = draft.filter((c) => c.text.trim().length > 0);
      await onSaveChips(log.id, cleaned);
      setEditing(false);
      setEditingIdx(null);
      setDraft([]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen" id="log-detail">
      {/* Corner close only when the user is *viewing* a past log; after a
          fresh submission the close action lives at the bottom as a
          primary "back to home" button instead. */}
      {!justSubmitted && !editing && (
        <button
          type="button"
          className="ld-close"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} weight="bold" />
        </button>
      )}

      {showPencil && (
        <button
          type="button"
          className="ld-edit-toggle"
          aria-label="Edit emotions"
          onClick={enterEdit}
        >
          <PencilSimple size={18} weight="regular" />
        </button>
      )}

      {editing && (
        <div className="ld-edit-bar" role="group" aria-label="Edit controls">
          <button
            type="button"
            className="ld-edit-cancel"
            aria-label="Discard edits"
            onClick={cancelEdit}
            disabled={saving}
          >
            <X size={18} weight="bold" />
          </button>
          <button
            type="button"
            className="ld-edit-save"
            aria-label="Save edits"
            onClick={saveEdit}
            disabled={saving}
          >
            {saving ? (
              <CircleNotch size={18} weight="bold" className="spin" />
            ) : (
              <Check size={18} weight="bold" />
            )}
          </button>
        </div>
      )}

      <div className="ld-body">
        <header className="ld-header">
          <h3>{date}</h3>
          <h3>{log.time}</h3>
        </header>

        {editing ? (
          <div className="ld-chips ld-chips--edit">
            {draft.map((c, idx) =>
              editingIdx === idx ? (
                <input
                  key={idx}
                  className="chip chip--edit"
                  autoFocus
                  defaultValue={c.text}
                  onBlur={(e) => commitChip(idx, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitChip(idx, e.currentTarget.value);
                    if (e.key === 'Escape') setEditingIdx(null);
                  }}
                />
              ) : (
                <span key={idx} className="chip" style={chipStyle(c.quadrant)}>
                  <button
                    type="button"
                    className="chip__text"
                    onClick={() => setEditingIdx(idx)}
                  >
                    {c.text || '…'}
                  </button>
                  <button
                    type="button"
                    className="chip__x"
                    aria-label={`Remove ${c.text}`}
                    onClick={() => removeChip(idx)}
                  >
                    <X size={12} weight="bold" />
                  </button>
                </span>
              ),
            )}
            <button type="button" className="chip chip--add" onClick={addChip}>
              <Plus size={13} weight="bold" />
              add
            </button>
          </div>
        ) : (
          log.keywords.length > 0 && (
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
          )
        )}

        {saveError && (
          <p className="ld-save-error" role="alert">
            Couldn’t save: {saveError}
          </p>
        )}

        <div
          className={
            'ld-context' + (bodyEmpty ? ' ld-context--empty' : '')
          }
        >
          <p>{body}</p>
        </div>
      </div>

      {!editing && (
        <div className="ld-actions">
          {justSubmitted ? (
            <>
              <p className="ld-confirm" aria-live="polite">
                <CheckCircle size={16} weight="fill" />
                logged successfully
              </p>
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
      )}
    </div>
  );
}
