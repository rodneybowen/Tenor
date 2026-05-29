import { useState } from 'react';
import { Check, CircleNotch, X } from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import {
  quadrantColor,
  type EmotionSelection,
} from '../theme/emotions';

interface Props {
  selected: EmotionSelection[];
  context: string;
  onContextChange: (value: string) => void;
  onRemove: (name: string) => void;
  onBack: () => void;
  /** Returns a promise so the screen can hold a "processing" state
   *  for the network-bound insert and ignore extra taps in flight. */
  onSubmit: () => void | Promise<void>;
}

export default function EmotionReviewScreen({
  selected,
  context,
  onContextChange,
  onRemove,
  onBack,
  onSubmit,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="screen" id="emotion-review">
      <div className="top-bar">
        <BackButton onClick={onBack} />
      </div>

      <div className="er-body">
        <h1 className="er-title">Selected emotions</h1>

        <ul className="er-list" aria-label="Selected emotions">
          {selected.map((s) => (
            <li key={s.name} className="er-row">
              <span
                className="er-chip"
                style={{
                  background: quadrantColor(s.quadrant, 0.18),
                  borderColor: quadrantColor(s.quadrant, 0.55),
                  color: 'var(--charcoal)',
                }}
              >
                {s.name}
              </span>
              <button
                type="button"
                className="er-remove"
                aria-label={`Remove ${s.name}`}
                onClick={() => onRemove(s.name)}
              >
                <X size={16} weight="bold" />
              </button>
            </li>
          ))}
        </ul>

        <label className="er-context">
          <span className="er-context__label">add context (optional)</span>
          <textarea
            className="er-context__input"
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            placeholder="What made you feel that way?"
            rows={3}
          />
        </label>

        <button
          type="button"
          className={'er-submit' + (submitting ? ' er-submit--busy' : '')}
          aria-label={submitting ? 'Saving log…' : 'Log these emotions'}
          aria-busy={submitting}
          disabled={submitting || selected.length === 0}
          onClick={async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              await onSubmit();
              // On success the parent navigates away → component
              // unmounts and the busy state goes with it.
            } catch (err) {
              console.error('[tenor] emotion submit failed', err);
              setSubmitting(false);
            }
          }}
        >
          {submitting ? (
            <CircleNotch size={22} weight="bold" className="spin" />
          ) : (
            <Check size={22} weight="bold" />
          )}
        </button>
      </div>
    </div>
  );
}
