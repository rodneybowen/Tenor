import { Check, X } from '@phosphor-icons/react';
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
  onSubmit: () => void;
}

export default function EmotionReviewScreen({
  selected,
  context,
  onContextChange,
  onRemove,
  onBack,
  onSubmit,
}: Props) {
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
          className="er-submit"
          aria-label="Log these emotions"
          disabled={selected.length === 0}
          onClick={onSubmit}
        >
          <Check size={22} weight="bold" />
        </button>
      </div>
    </div>
  );
}
