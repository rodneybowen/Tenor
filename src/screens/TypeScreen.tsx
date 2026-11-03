import { useRef, useState, type CSSProperties } from 'react';
import {
  PencilSimple,
  Check,
  CircleNotch,
  ArrowCounterClockwise,
  Plus,
  X,
} from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import {
  classify,
  classifyWord,
  extractEmotions,
  type Detected,
} from '../lib/emotionDetect';
import { quadrantColor, shadeQuadrant } from '../theme/emotions';

interface Props {
  onBack: () => void;
  onConfirm: (chips: Detected[], text: string) => void | Promise<void>;
}

// Per-quadrant inline style for a highlighted word in the mirror.
// Light tint background, dashed underline — same visual language as
// the voice transcript's .kw mark but color-coded by quadrant.
function kwStyle(q: ReturnType<typeof classifyWord>): CSSProperties {
  if (!q) return {};
  return {
    background: quadrantColor(q, 0.22),
    borderBottom: `2px dashed ${quadrantColor(q, 0.7)}`,
    paddingBottom: '1px',
    borderRadius: '2px',
    color: shadeQuadrant(q, 0.55),
  };
}

function chipStyle(q: Detected['quadrant']): CSSProperties {
  if (!q)
    return {
      background: 'rgba(255,255,255,0.55)',
      borderColor: 'rgba(34,34,34,0.14)',
    };
  return {
    background: quadrantColor(q, 0.26),
    borderColor: quadrantColor(q, 0.4),
  };
}

/** Tokenise `text` and return an array of React nodes — whitespace
 *  tokens pass through; word tokens that match the lexicon get a
 *  <mark> with a quadrant-colored inline style. */
function renderHighlighted(text: string): React.ReactNode[] {
  const tokens = text.split(/(\s+)/);
  return tokens.map((tok, i) => {
    if (/^\s+$/.test(tok)) return <span key={i}>{tok}</span>;
    const m = tok.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'-]*)([^A-Za-z]*)$/);
    if (m) {
      const q = classifyWord(m[2]);
      if (q) {
        return (
          <span key={i}>
            {m[1]}
            <mark style={kwStyle(q)}>{m[2]}</mark>
            {m[3]}
          </span>
        );
      }
    }
    return <span key={i}>{tok}</span>;
  });
}

export default function TypeScreen({ onBack, onConfirm }: Props) {
  const [phase, setPhase] = useState<'write' | 'review'>('write');
  const [text, setText] = useState('');
  const [chips, setChips] = useState<Detected[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The mirror div needs to scroll in lockstep with the textarea so
  // highlights stay registered behind the correct words.
  const mirrorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleScroll() {
    if (mirrorRef.current && textareaRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  function handleSubmit() {
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    setChips(extractEmotions(trimmed));
    setPhase('review');
  }

  function handleRetry() {
    setChips([]);
    setEditing(null);
    setPhase('write');
  }

  function commitChip(idx: number, value: string) {
    const t = value.trim();
    setChips((cur) => {
      if (!t) return cur.filter((_, i) => i !== idx);
      const next = [...cur];
      next[idx] = { text: t, quadrant: classify(t) };
      return next;
    });
    setEditing(null);
  }

  function removeChip(idx: number) {
    setChips((cur) => cur.filter((_, i) => i !== idx));
    setEditing(null);
  }

  function addChip() {
    setChips((cur) => [...cur, { text: '', quadrant: null }]);
    setEditing(chips.length);
  }

  const canSubmit = text.trim().length >= 3;

  return (
    <div className="screen" id="type-screen">
      <div className="top-bar">
        <BackButton
          onClick={() => {
            if (phase === 'review') {
              handleRetry();
            } else {
              onBack();
            }
          }}
        />
      </div>

      {phase === 'write' ? (
        <div className="voice-body type-write-body">
          <h1 className="voice-title">Write it out.</h1>

          {/* Mirror + textarea overlay — mirror renders highlighted
              HTML behind a transparent textarea so the highlight marks
              appear inline with the user's own keystrokes. */}
          <div className="type-field-wrap">
            <div
              className="type-mirror"
              aria-hidden="true"
              ref={mirrorRef}
            >
              {text ? renderHighlighted(text) : null}
              {/* Trailing space keeps the mirror height in sync with
                  the textarea when the last character is a newline. */}
              {' '}
            </div>
            <textarea
              ref={textareaRef}
              className="type-area"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onScroll={handleScroll}
              placeholder="start writing anything…"
              aria-label="Journal entry"
              autoFocus
              spellCheck
            />
          </div>

          <div className="type-foot">
            <span className="voice-hint type-hint">
              {text.length === 0
                ? 'feelings get highlighted as you write'
                : canSubmit
                ? 'tap ✓ when you’re done'
                : 'keep going…'}
            </span>
            <button
              type="button"
              className={
                'round-btn round-btn--confirm' +
                (submitting ? ' round-btn--busy' : '')
              }
              aria-label="Log this entry"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
            >
              <Check size={24} weight="bold" />
            </button>
          </div>
        </div>
      ) : (
        <div className="voice-body voice-body--review">
          {/* Pen icon matches the "type" mode indicator in log cards. */}
          <div className="review-mic" aria-hidden="true">
            <PencilSimple size={22} weight="light" />
          </div>

          <p className="review-transcript">{text.trim()}</p>

          <p className="review-label">
            {chips.length
              ? 'Tap a word to edit it.'
              : 'We didn’t catch a clear feeling — add one below.'}
          </p>

          <div className="chips">
            {chips.map((c, idx) =>
              editing === idx ? (
                <input
                  key={idx}
                  className="chip chip--edit"
                  autoFocus
                  defaultValue={c.text}
                  onBlur={(e) => commitChip(idx, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitChip(idx, e.currentTarget.value);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <span key={idx} className="chip" style={chipStyle(c.quadrant)}>
                  <button
                    type="button"
                    className="chip__text"
                    onClick={() => setEditing(idx)}
                  >
                    {c.text}
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

          <div className="review-actions">
            <button
              type="button"
              className="round-btn round-btn--retry"
              aria-label="Go back and edit"
              onClick={handleRetry}
            >
              <ArrowCounterClockwise size={22} weight="regular" />
            </button>
            <button
              type="button"
              className={
                'round-btn round-btn--confirm' +
                (submitting ? ' round-btn--busy' : '')
              }
              aria-label={submitting ? 'Saving log…' : 'Confirm and add to log'}
              aria-busy={submitting}
              disabled={
                submitting ||
                chips.filter((c) => c.text.trim()).length === 0
              }
              onClick={async () => {
                if (submitting) return;
                setSubmitting(true);
                try {
                  await onConfirm(
                    chips.filter((c) => c.text.trim()),
                    text.trim(),
                  );
                } catch (err) {
                  console.error('[tenor] type confirm failed', err);
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? (
                <CircleNotch size={24} weight="bold" className="spin" />
              ) : (
                <Check size={24} weight="bold" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
