// =====================================================================
// QuickLogReviewScreen — post-quick-log review + one-shot edit
// =====================================================================
// Reached automatically after QuickLogScreen submits a `source: 'quick'`
// log. The "Logged." header confirms the write happened in the
// background while the user wasn't looking. Chips + transcript give
// them the one chance to fix a mis-detection before the log locks.
//
// Edit semantics mirror LogDetailScreen's chip-edit flow (Voice review
// chip UX: tap rename, × remove, + add). Quick logs get exactly one
// edit attempt: once `editedAt` is set, the button is gone forever.
// =====================================================================

import { useState } from 'react';
import { Check, CircleNotch, PencilSimple, Plus, X } from '@phosphor-icons/react';
import { quadrantColor, type Quadrant } from '../theme/emotions';
import { classify } from '../lib/emotionDetect';
import type { LogEntry } from '../data/mockLogs';

interface ChipDraft {
  text: string;
  quadrant: Quadrant | null;
}

interface Props {
  log: LogEntry;
  onSaveChips: (
    logId: string,
    chips: { text: string; quadrant: Quadrant | null }[],
  ) => Promise<void>;
  onDone: () => void;
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

export default function QuickLogReviewScreen({ log, onSaveChips, onDone }: Props) {
  // Quick logs get ONE edit, not time-gated. Show the CTA iff editedAt
  // is null. After a save, editedAt mirrors in via App state and the
  // button vanishes.
  const oneShotAvailable = log.editedAt == null;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ChipDraft[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
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

  // Display chips: source-of-truth swaps between log (read view) and
  // draft (edit view). Keep this branch small so the markup stays flat.
  const chipsToShow = editing ? draft : initialDraft(log);
  const transcript = (log.body ?? '').trim();

  return (
    <div className="screen" id="quicklog-review">
      <div className="qlr-body">
        <header className="qlr-header">
          <h2>Logged.</h2>
        </header>

        <div className={'qlr-chips' + (editing ? ' qlr-chips--edit' : '')}>
          {editing
            ? chipsToShow.map((c, idx) =>
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
              )
            : chipsToShow.map((c, i) => (
                <span
                  key={`${c.text}-${i}`}
                  className="qlr-chip"
                  style={chipStyle(c.quadrant)}
                >
                  {c.text}
                </span>
              ))}
          {editing && (
            <button type="button" className="chip chip--add" onClick={addChip}>
              <Plus size={13} weight="bold" />
              add
            </button>
          )}
        </div>

        {saveError && (
          <p className="qlr-error" role="alert">
            Couldn’t save: {saveError}
          </p>
        )}

        {transcript && <p className="qlr-transcript">{transcript}</p>}
      </div>

      <div className="qlr-actions">
        {editing ? (
          <div className="qlr-edit-bar">
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelEdit}
              disabled={saving}
            >
              <X size={14} weight="bold" />
              cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveEdit}
              disabled={saving}
            >
              {saving ? (
                <CircleNotch size={14} weight="bold" className="spin" />
              ) : (
                <Check size={14} weight="bold" />
              )}
              save edit
            </button>
          </div>
        ) : (
          <>
            {oneShotAvailable && (
              <button
                type="button"
                className="btn-secondary qlr-edit"
                onClick={enterEdit}
              >
                <PencilSimple size={14} weight="regular" />
                edit emotions
              </button>
            )}
            <button type="button" className="btn-primary qlr-done" onClick={onDone}>
              done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
