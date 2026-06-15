// Logo intro splash. Plays on every fresh mount of AuthScreen while
// the user is logged out — see TENOR_CONTEXT.md → "Detailed Flow:
// Logo Intro Animation (Splash)".
//
// Sits as a fixed full-viewport overlay above an already-rendered
// AuthScreen. Lottie plays once, then a FLIP transform shrinks +
// moves the splash logo onto the AuthScreen's `.auth-wordmark img`
// slot. On transitionend, the parent unmounts this component and
// the real wordmark / auth card take over.

import { useEffect, useRef, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

/** Centralized so swapping in a different animation later is one
 *  line. dotLottieReact accepts both `.lottie` and `.json`; we
 *  ship the JSON directly since it's the wordmark source of
 *  truth right now. */
const INTRO_ANIMATION_SRC = `${import.meta.env.BASE_URL}animations/intro.json`;

/** FLIP target: the already-rendered `.auth-wordmark img` in the
 *  DOM underneath. AuthScreen renders it always — IntroSplash just
 *  measures its rect, transforms onto it, and unmounts. */
const TARGET_SELECTOR = '.auth-wordmark img';

const FLIP_DURATION_MS = 500;
const FLIP_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

// The lottie composition is 1200×900 but the actual wordmark only
// occupies the central ~40% of the composition's height (the rest
// is padding around the mark). The FLIP scale must shrink the
// *visible wordmark* onto the target SVG, not the whole padded
// box — so we divide out this ratio when computing scale.
// Measured from the layer transforms in `intro.json`; if the
// animation source changes and this ratio shifts, the splash will
// hand off to a wordmark visibly bigger or smaller than the static
// SVG underneath. Re-derive and update.
const WORDMARK_H_RATIO_IN_COMP = 0.4;

interface Props {
  /** Called after the FLIP transition completes — parent should
   *  setState to unmount this component. */
  onDone: () => void;
}

export default function IntroSplash({ onDone }: Props) {
  // The lottie wrapper div is what we transform. Capturing its
  // initial rect on mount avoids any layout shift between the
  // lottie's first paint and onComplete firing.
  const logoRef = useRef<HTMLDivElement | null>(null);

  // Flip-once guard. StrictMode and the lottie player's lifecycle
  // can both technically fire onComplete more than once; we only
  // want a single transform.
  const flippedRef = useRef(false);

  // Single animation source (the wordmark .json). State kept so a
  // future fallback chain can swap sources without restructuring.
  const [src] = useState<string>(INTRO_ANIMATION_SRC);

  // Phase tracks visual state for CSS hooks.
  //   'playing' — lottie running, no transform applied
  //   'flying'  — FLIP transform in flight
  //   'done'    — transitionend received, ready to unmount
  const [phase, setPhase] = useState<'playing' | 'flying' | 'done'>('playing');

  /** Lottie reached its last frame. Measure both rects and apply
   *  the transform. */
  function handleComplete() {
    if (flippedRef.current) return;
    flippedRef.current = true;

    const logo = logoRef.current;
    const target = document.querySelector(TARGET_SELECTOR);
    if (!logo || !(target instanceof HTMLElement)) {
      // Nothing to FLIP to — just hand off immediately so we don't
      // strand the splash on top of a working auth screen.
      onDone();
      return;
    }

    const from = logo.getBoundingClientRect();
    const to = target.getBoundingClientRect();

    // The visible wordmark inside the lottie occupies only the
    // central WORDMARK_*_RATIO_IN_COMP portion of the box. To make
    // the wordmark land at SVG height (not the padded box at SVG
    // height), divide out the height ratio. Result: the box becomes
    // larger than the SVG by 1 / H_RATIO, with the wordmark inside
    // matching the SVG exactly.
    const scale = to.height / (from.height * WORDMARK_H_RATIO_IN_COMP);

    // After scale (origin: top-left), the box's NEW size is
    // (from.width * scale, from.height * scale). We want the *box's
    // center* to land on the SVG's center, because the wordmark is
    // centered within the lottie composition. Solve for the translate
    // that moves the box's top-left from `from.left` to a position
    // where its center matches the SVG's center.
    const scaledW = from.width * scale;
    const scaledH = from.height * scale;
    const finalLeft = to.left + to.width / 2 - scaledW / 2;
    const finalTop = to.top + to.height / 2 - scaledH / 2;
    const dx = finalLeft - from.left;
    const dy = finalTop - from.top;

    logo.style.transition = `transform ${FLIP_DURATION_MS}ms ${FLIP_EASING}`;
    logo.style.transformOrigin = 'top left';
    // Two RAFs so the browser commits the initial styles (origin +
    // transition) before the transformed value goes on — otherwise
    // the transition can be skipped.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!logoRef.current) return;
        logoRef.current.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
        setPhase('flying');
      });
    });
  }

  /** When the FLIP transition lands, hand off to the parent. */
  function handleTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== 'transform') return;
    setPhase('done');
    onDone();
  }

  // Safety net: if the lottie never fires onComplete for any
  // reason (network hang, malformed asset, etc.), hand off after a
  // generous timeout so the user is never stranded on the splash.
  useEffect(() => {
    const stuck = window.setTimeout(() => {
      if (!flippedRef.current) {
        // Same path as a normal completion — try the FLIP first;
        // if the rects don't resolve, onDone fires immediately.
        handleComplete();
      }
    }, 8000);
    return () => window.clearTimeout(stuck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`intro-splash intro-splash--${phase}`}
      role="presentation"
      aria-hidden="true"
    >
      {/* Static aurora — same tokens as the home backdrop but no
          drift animation; spec calls for "blank gradient," not the
          busy moving one. */}
      <div className="intro-splash__blobs">
        <div className="intro-splash__blob intro-splash__blob--a" />
        <div className="intro-splash__blob intro-splash__blob--b" />
        <div className="intro-splash__blob intro-splash__blob--c" />
        <div className="intro-splash__blob intro-splash__blob--d" />
      </div>
      <div className="grain" />

      <div
        ref={logoRef}
        className="intro-splash__logo"
        onTransitionEnd={handleTransitionEnd}
      >
        <DotLottieReact
          src={src}
          autoplay
          loop={false}
          // dotLottieReact doesn't expose React-style props for the
          // player events — we wire `complete` + `loadError` via the
          // instance ref. Cleanup happens implicitly when the
          // component (and its instance) is destroyed on unmount.
          dotLottieRefCallback={(instance) => {
            if (!instance) return;
            instance.addEventListener('complete', handleComplete);
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
