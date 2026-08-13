// useMicLevel — real amplitude reactivity for the voice-screen wave.
// ===================================================================
// Opens a parallel getUserMedia stream + Web Audio AnalyserNode and
// writes per-bar amplitude (0–1) to CSS custom properties on the
// container element every rAF tick. The wave bars height off those
// vars, so the DOM updates without React re-rendering.
//
// Runs alongside the Web Speech API's own internal mic stream — most
// browsers happily hand out multiple streams from the same input
// device. If getUserMedia fails (permission, no device, unsupported)
// the hook returns `{ available: false }` and the wave sits flat.
//
// Silence handling: bars decay to (near-)zero when input drops below
// a small noise floor, so the wave visibly rests when nobody's
// talking. The `voicing` ref flips true while we're above the floor
// — used by the VoiceScreen to gate the analysing/stop-disable
// state and the .wave--on class.

import { useEffect, useRef, type RefObject } from 'react';

interface MicLevelOptions {
  /** Number of bars to drive. Container must expose CSS custom
   *  properties `--w-0` through `--w-{N-1}`. Default 9. */
  bars?: number;
  /** FFT size — power of 2, ≥ 32. 128 gives 64 bins @ ~344 Hz each
   *  at 44.1 kHz, plenty of resolution for a 9-bar visual. */
  fftSize?: number;
  /** Analyser smoothing — 0 = raw, closer to 1 = smoother. 0.7 hides
   *  frame-to-frame jitter without lagging perceptibly behind speech. */
  smoothing?: number;
  /** Bytes below this threshold count as silence — bars decay to 0
   *  and `voicing` flips false. Web-audio bytes are 0-255. */
  silenceFloor?: number;
}

export interface MicLevelHandle {
  /** True once the mic stream + analyser are running. False if
   *  getUserMedia was denied, unsupported, or the hook is disabled. */
  available: boolean;
  /** Live ref — true when the last few frames were above the
   *  silence floor. Cheap to read from another rAF loop, doesn't
   *  cause a re-render. */
  voicingRef: RefObject<boolean>;
}

export function useMicLevel(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  opts: MicLevelOptions = {},
): MicLevelHandle {
  const bars = opts.bars ?? 9;
  const fftSize = opts.fftSize ?? 128;
  const smoothing = opts.smoothing ?? 0.7;
  const silenceFloor = opts.silenceFloor ?? 12;

  const availableRef = useRef(false);
  const voicingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    // Some browsers still ship the AudioContext behind a webkit prefix.
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;

    let ctx: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let raf = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AC();
        // Some browsers auto-suspend the AudioContext until a user
        // gesture unlocks it — the voice screen mounts from a click,
        // so resume() here almost always succeeds.
        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch {
            // fall through — bars will read zero
          }
        }
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = smoothing;
        source.connect(analyser);
        // Do NOT connect analyser to destination — we don't want
        // playback, just measurement.

        const binCount = analyser.frequencyBinCount;
        const data = new Uint8Array(binCount);

        // Voice sits roughly in bins covering ~85–3000 Hz. With
        // fftSize=128 @ 44.1 kHz that's bin ~0.25 to bin ~8.7 — but
        // we widen a little to keep the top bars responsive to
        // sibilance / consonants.
        const startBin = 1;
        const endBin = Math.min(binCount - 1, Math.max(startBin + bars, 20));
        const perBar = (endBin - startBin) / bars;

        // Small trailing-window silence tracker so a single quiet
        // frame doesn't flip voicing false during a normal utterance.
        let lastLoud = 0;
        const VOICE_HANG_MS = 220;

        availableRef.current = true;

        function tick(now: number) {
          if (cancelled) return;
          analyser!.getByteFrequencyData(data);
          const el = containerRef.current;
          let maxThisFrame = 0;
          for (let i = 0; i < bars; i++) {
            const from = Math.floor(startBin + i * perBar);
            const to = Math.floor(startBin + (i + 1) * perBar);
            let sum = 0;
            let count = 0;
            for (let j = from; j < to && j < binCount; j++) {
              sum += data[j];
              count += 1;
            }
            const raw = count > 0 ? sum / count : 0;
            // Below the silence floor → collapse to 0 so the bar
            // rests. Above it → linear ramp to 1 across the useful
            // amplitude range. Voice rarely hits 255; 190 is a
            // reasonable "full" ceiling so shouting doesn't clip.
            const above = raw > silenceFloor ? raw - silenceFloor : 0;
            const norm = Math.min(1, above / (190 - silenceFloor));
            el?.style.setProperty(`--w-${i}`, norm.toFixed(3));
            if (raw > maxThisFrame) maxThisFrame = raw;
          }
          if (maxThisFrame > silenceFloor) {
            lastLoud = now;
            voicingRef.current = true;
          } else if (now - lastLoud > VOICE_HANG_MS) {
            voicingRef.current = false;
          }
          raf = requestAnimationFrame(tick);
        }
        raf = requestAnimationFrame(tick);
      } catch {
        // Denied, no mic, or unsupported. Bars stay flat.
        availableRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      availableRef.current = false;
      voicingRef.current = false;
      if (raf) cancelAnimationFrame(raf);
      try {
        source?.disconnect();
      } catch {
        // ignore
      }
      try {
        analyser?.disconnect();
      } catch {
        // ignore
      }
      if (ctx) {
        ctx.close().catch(() => undefined);
      }
      stream?.getTracks().forEach((t) => t.stop());
      // Reset the bar vars so the wave rests flat on remount.
      const el = containerRef.current;
      if (el) {
        for (let i = 0; i < bars; i++) el.style.removeProperty(`--w-${i}`);
      }
    };
  }, [enabled, bars, fftSize, smoothing, silenceFloor, containerRef]);

  return {
    available: availableRef.current,
    voicingRef,
  };
}
