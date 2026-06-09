import { useEffect, useRef, useState } from 'react';
import {
  Microphone,
  Square,
  Check,
  CircleNotch,
  ArrowCounterClockwise,
  Plus,
  X,
} from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import {
  useSpeechRecognition,
  getMicHelp,
} from '../lib/speech';
import {
  classify,
  classifyWord,
  extractEmotions,
  type Detected,
} from '../lib/emotionDetect';
import { quadrantColor } from '../theme/emotions';

const DEMO_SCRIPT =
  'Today was honestly so draining. I felt anxious all morning and pretty lonely, but talking it out left me a little calmer.';

interface Props {
  demo: boolean;
  onBack: () => void;
  /** Returns a promise so the screen can show a "processing" state
   *  for the (potentially network-bound) insert and refuse extra
   *  taps while it resolves. */
  onConfirm: (chips: Detected[], transcript: string) => void | Promise<void>;
}

function chipStyle(q: Detected['quadrant']) {
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

export default function VoiceScreen({ demo, onBack, onConfirm }: Props) {
  const sr = useSpeechRecognition();
  const [phase, setPhase] = useState<'record' | 'review'>('record');
  const [chips, setChips] = useState<Detected[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [demoActive, setDemoActive] = useState(false);
  // True while the confirm-submit handler's promise is in flight.
  // Disables the ✓ button + swaps the icon for a spinner so users
  // can see something's happening (and can't double-tap).
  const [submitting, setSubmitting] = useState(false);
  const demoTimer = useRef<number | null>(null);

  // Keep the latest transcript reachable from timers/handlers.
  const transcriptRef = useRef('');
  transcriptRef.current = sr.transcript;

  // Auto-scroll the transcript to the bottom as new words come in, so the
  // user never sees a frozen-looking screen while they're still talking.
  // We only auto-stick when the user is already near the bottom — if they
  // scrolled up to re-read earlier text, leave them there.
  const transcriptElRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  function onTranscriptScroll() {
    const el = transcriptElRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    stickToBottomRef.current = distFromBottom < 24;
  }
  useEffect(() => {
    if (stickToBottomRef.current) {
      const el = transcriptElRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [sr.transcript, sr.interim]);

  function clearDemo() {
    if (demoTimer.current) {
      clearInterval(demoTimer.current);
      demoTimer.current = null;
    }
  }

  function startCapture() {
    if (demo) {
      sr.setTranscript('');
      setDemoActive(true);
      const words = DEMO_SCRIPT.split(' ');
      let i = 0;
      clearDemo();
      demoTimer.current = window.setInterval(() => {
        i += 1;
        sr.setTranscript(words.slice(0, i).join(' '));
        if (i >= words.length) clearDemo();
      }, 150);
    } else {
      sr.start();
    }
  }

  // Begin capture on entry.
  useEffect(() => {
    startCapture();
    return () => {
      clearDemo();
      sr.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set while we're tearing down SR + running detectEmotions. The
  // stop button reads this and disables — same debounce as
  // QuickLogScreen's tap-anywhere target so a panicked second tap
  // can't re-enter the handler mid-extraction.
  const [isProcessing, setIsProcessing] = useState(false);

  // Never disabled on first render. Becomes disable-able only after
  // we've heard at least one result event from SR. Until then the
  // user may want to back out cleanly.
  const sawAnyResultRef = useRef(false);
  if ((sr.transcript || sr.interim) && !sawAnyResultRef.current) {
    sawAnyResultRef.current = true;
  }
  const stopDisabled = isProcessing && sawAnyResultRef.current;

  function handleStop() {
    if (isProcessing) return;
    setIsProcessing(true);
    clearDemo();
    setDemoActive(false);
    if (!demo) sr.stop();
    const text = transcriptRef.current.trim();
    // extractEmotions is sync but we still wrap so the disabled state
    // is visible for at least one frame and any future async work
    // (e.g. swapping in an async classifier) doesn't need re-wiring.
    try {
      setChips(extractEmotions(text));
      setPhase('review');
    } finally {
      setIsProcessing(false);
    }
  }

  function handleRetry() {
    clearDemo();
    setDemoActive(false);
    sr.reset();
    setChips([]);
    setEditing(null);
    setPhase('record');
    startCapture();
  }

  function commitChip(idx: number, value: string) {
    const text = value.trim();
    setChips((cur) => {
      if (!text) return cur.filter((_, i) => i !== idx);
      const next = [...cur];
      next[idx] = { text, quadrant: classify(text) };
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

  const capturing = demo ? demoActive : sr.listening;
  const showModal = sr.error !== null;

  // ── Live transcript with matched words underlined ──
  const tokens = sr.transcript ? sr.transcript.split(/(\s+)/) : [];

  return (
    <div className="screen" id="voice">
      <div className="top-bar">
        <BackButton
          onClick={() => {
            clearDemo();
            sr.reset();
            onBack();
          }}
        />
      </div>

      {phase === 'record' ? (
        <div className="voice-body">
          <h1 className="voice-title">Say it out loud.</h1>

          <div
            className="transcript"
            aria-live="polite"
            ref={transcriptElRef}
            onScroll={onTranscriptScroll}
          >
            {tokens.length === 0 && !sr.interim ? (
              <span className="transcript__hint">
                {capturing ? 'listening…' : 'getting ready…'}
              </span>
            ) : (
              <>
                {tokens.map((tok, i) => {
                  if (/\s+/.test(tok)) return <span key={i}>{tok}</span>;
                  const m = tok.match(/^([^A-Za-z]*)([A-Za-z][A-Za-z'-]*)([^A-Za-z]*)$/);
                  if (m && classifyWord(m[2])) {
                    return (
                      <span key={i}>
                        {m[1]}
                        <mark className="kw">{m[2]}</mark>
                        {m[3]}
                      </span>
                    );
                  }
                  return <span key={i}>{tok}</span>;
                })}{' '}
                <span className="transcript__interim">{sr.interim}</span>
              </>
            )}
          </div>

          <div className="voice-foot">
            <div className={`wave${capturing ? ' wave--on' : ''}`}>
              {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} style={{ animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
            <button
              type="button"
              className="stop-btn"
              aria-label="Stop and review"
              onClick={handleStop}
              disabled={stopDisabled}
            >
              <Square size={26} weight="fill" />
            </button>
            <span className="voice-hint">tap to stop &amp; review</span>
          </div>
        </div>
      ) : (
        <div className="voice-body voice-body--review">
          <div className="review-mic" aria-hidden="true">
            <Microphone size={26} weight="light" />
          </div>

          <p className="review-transcript">
            {sr.transcript || 'No speech captured.'}
          </p>

          <p className="review-label">
            {chips.length
              ? 'Tap a word to fix anything we misheard.'
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
                <span
                  key={idx}
                  className="chip"
                  style={chipStyle(c.quadrant)}
                >
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
              aria-label="Discard and record again"
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
              aria-label={
                submitting ? 'Saving log…' : 'Confirm and add to log'
              }
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
                    transcriptRef.current.trim(),
                  );
                  // On success the parent navigates away → component
                  // unmounts and the busy state goes with it.
                } catch (err) {
                  console.error('[tenor] voice confirm failed', err);
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

      {showModal && (
        <div className="mic-modal" role="alertdialog" aria-modal="true">
          <div className="mic-modal__card">
            <h2>{getMicHelp(sr.error).title}</h2>
            <ol>
              {getMicHelp(sr.error).steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="mic-modal__btns">
              {(sr.error === 'denied' || sr.error === 'no-mic') && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    sr.reset();
                    startCapture();
                  }}
                >
                  try again
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  sr.reset();
                  onBack();
                }}
              >
                go back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
