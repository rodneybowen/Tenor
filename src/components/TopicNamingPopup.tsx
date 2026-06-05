import { useEffect, useRef, useState, type FormEvent } from 'react';

interface Props {
  /** Save the topic name onto the thread root and dismiss. Empty input
   *  is treated as a skip and routed through `onSkip` instead. */
  onConfirm: (topic: string) => void;
  /** Dismiss without naming. Thread is left with topic = null and the
   *  user can name it later via the inline rename on the thread screen. */
  onSkip: () => void;
}

/**
 * Topic naming popup — fired immediately after a successful "+ add to
 * this log" submission when the thread doesn't have a name yet. Only
 * shows once per thread; subsequent additions skip it.
 *
 * Dismissal rules (per project spec, option B):
 * - Confirm with a non-empty name → save, route to LogThreadScreen
 * - Confirm with empty input → treated as skip (no topic saved)
 * - Tap outside the card / press Escape → skip
 */
export default function TopicNamingPopup({ onConfirm, onSkip }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus the field so the keyboard pops on mobile and the user
  // can start typing immediately on desktop.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape skips. We listen on document so it works regardless of
  // which element holds focus inside the modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSkip]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      onSkip();
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <div
      className="topic-popup-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="topic-popup-title"
      onClick={(e) => {
        // Outside-card click = skip. Only the overlay itself triggers
        // this — clicks inside the card stopPropagation below.
        if (e.target === e.currentTarget) onSkip();
      }}
    >
      <div className="topic-popup-card" onClick={(e) => e.stopPropagation()}>
        <h2 id="topic-popup-title" className="topic-popup-title">
          What&rsquo;s this about?
        </h2>
        <p className="topic-popup-sub">
          Give this thread a topic so you can find it later.
        </p>
        <form onSubmit={handleSubmit} className="topic-popup-form">
          <input
            ref={inputRef}
            type="text"
            className="topic-popup-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={60}
            placeholder="e.g. work stress, sleep, mom"
            aria-label="Thread topic"
          />
          <div className="topic-popup-actions">
            <button
              type="button"
              className="topic-popup-skip"
              onClick={onSkip}
            >
              skip
            </button>
            <button
              type="submit"
              className="topic-popup-confirm"
              disabled={value.trim().length === 0}
            >
              save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
