// =====================================================================
// QuickLogScreen — eyes-free recording from a Lock Screen Shortcut
// =====================================================================
// Triggered by `tenor://quick-log` (iOS Shortcut) or `?quicklog=1` on
// web. Mounts → haptic → mic permission check → SR starts immediately
// (no tap). Auto-submits after 2.5s of silence, or when the user taps
// anywhere on the screen. No header, no nav, no back button — this is
// the absolute minimum surface so the user can record without looking.
//
// On submit:
//   • extractEmotions(transcript) → chips
//   • insertLog with source: 'quick' (or local-only entry if guest /
//     unauthenticated / Supabase failure)
//   • Hand the new LogEntry up via `onSubmit(entry)` so App.tsx can
//     route to QuickLogReviewScreen.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { useSpeechRecognition, getMicHelp } from '../lib/speech';
import { extractEmotions } from '../lib/emotionDetect';
import type { LogEntry } from '../data/mockLogs';
import * as haptics from '../lib/haptics';

const SILENCE_MS = 2500;

interface Props {
  /** Build the LogEntry from the recording + insert it (Supabase write
   *  if authenticated; local-only entry otherwise). Resolves with the
   *  LogEntry the parent should pass to QuickLogReviewScreen. Errors
   *  bubble up; we don't render a recovery UI here because the user
   *  isn't necessarily looking at the screen. */
  onSubmit: (args: {
    transcript: string;
    chips: { text: string; quadrant: ReturnType<typeof extractEmotions>[number]['quadrant'] }[];
  }) => Promise<LogEntry>;
  /** Called when the new log lands — parent should route to review. */
  onComplete: (log: LogEntry) => void;
  /** Bail-out — used by the mic-permission "go back" button. */
  onCancel: () => void;
}

export default function QuickLogScreen({ onSubmit, onComplete, onCancel }: Props) {
  const sr = useSpeechRecognition();
  const transcriptRef = useRef('');
  transcriptRef.current = sr.transcript;

  // Silence-window auto-stop. Reset on every interim/final result; fire
  // submit when the timer expires with a non-empty transcript.
  const silenceTimer = useRef<number | null>(null);

  // True while we're running detectEmotions + insertLog. Blocks the
  // tap-anywhere stop target so a duplicate submit can't fire.
  const [isProcessing, setIsProcessing] = useState(false);
  // Mounted-but-haven't-heard-anything-yet. We never disable interaction
  // on first render — disabling only kicks in once SR has started
  // emitting results AND we're processing.
  const sawAnyResult = useRef(false);

  const startedRef = useRef(false);
  const stoppedRef = useRef(false);

  const submit = useCallback(async () => {
    if (stoppedRef.current || isProcessing) return;
    stoppedRef.current = true;
    setIsProcessing(true);
    if (silenceTimer.current) {
      window.clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    sr.stop();

    const finalTranscript = transcriptRef.current.trim();
    if (!finalTranscript) {
      // Nothing was captured — bail back out without writing a log.
      setIsProcessing(false);
      onCancel();
      return;
    }
    try {
      const detected = extractEmotions(finalTranscript);
      const chips = detected.map((d) => ({ text: d.text, quadrant: d.quadrant }));
      const entry = await onSubmit({ transcript: finalTranscript, chips });
      onComplete(entry);
    } catch (err) {
      console.error('[tenor] quick-log submit failed', err);
      // Best-effort fallback — kick the user back so they don't get stuck.
      onCancel();
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, onComplete, onCancel, onSubmit, sr]);

  // ── Auto-start on mount ────────────────────────────────────────────
  // We start SR exactly once; `sr.start` is stable across renders so
  // the empty-deps effect is correct. Haptic fires alongside so the
  // user feels the app "wake up" even with the screen off / face down.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    haptics.tap();
    sr.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Silence-based auto-submit ──────────────────────────────────────
  // The `transcript` / `interim` change on every result event. Reset the
  // timer whenever either of them ticks; fire submit when the timer
  // expires with text in the buffer.
  useEffect(() => {
    if (!sr.listening) return;
    if (!sr.transcript && !sr.interim) return;
    sawAnyResult.current = true;
    if (silenceTimer.current) window.clearTimeout(silenceTimer.current);
    silenceTimer.current = window.setTimeout(() => {
      silenceTimer.current = null;
      if (transcriptRef.current.trim().length > 0) {
        void submit();
      }
    }, SILENCE_MS);
    return () => {
      if (silenceTimer.current) {
        window.clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }
    };
  }, [sr.transcript, sr.interim, sr.listening, submit]);

  // ── Mic-permission popup (reuses the same getMicHelp content as
  // ── VoiceScreen so the user sees consistent guidance).
  const showMicModal = sr.error !== null;
  const micHelp = sr.error ? getMicHelp(sr.error) : null;

  // The tap-anywhere stop target. Disabled while processing OR before
  // we've heard a single result (so an accidental immediate tap during
  // mount doesn't kill the recording before SR has even started).
  const tapDisabled = isProcessing || !sawAnyResult.current;

  return (
    <div
      className="screen quicklog"
      role="button"
      tabIndex={0}
      aria-label="Tap anywhere to stop recording"
      onClick={() => {
        if (tapDisabled) return;
        void submit();
      }}
      onKeyDown={(e) => {
        if (tapDisabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <div className="quicklog__center" aria-hidden="true">
        {isProcessing ? (
          <CircleNotch
            size={56}
            weight="bold"
            className="spin quicklog__processing"
          />
        ) : (
          <span className="quicklog__pulse" />
        )}
      </div>

      <p className="quicklog__hint">
        {isProcessing
          ? 'processing…'
          : sawAnyResult.current
          ? 'tap anywhere to stop'
          : 'listening…'}
      </p>

      {showMicModal && micHelp && (
        <div
          className="mic-modal"
          role="alertdialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mic-modal__card">
            <h2>{micHelp.title}</h2>
            <ol>
              {micHelp.steps.map((s, i) => (
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
                    sr.start();
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
                  onCancel();
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
