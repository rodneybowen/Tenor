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
 *  line. JSON is the load-error fallback (same animation, larger
 *  uncompressed payload). */
const INTRO_LOTTIE_SRC = '/animations/intro.lottie';
const INTRO_JSON_SRC = '/animations/intro.json';

/** FLIP target: the already-rendered `.auth-wordmark img` in the
 *  DOM underneath. AuthScreen renders it always — IntroSplash just
 *  measures its rect, transforms onto it, and unmounts. */
const TARGET_SELECTOR = '.auth-wordmark img';

const FLIP_DURATION_MS = 500;
const FLIP_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

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

  // .lottie → .json fallback. If the dotLottie player surfaces a
  // load error on the binary, swap to the uncompressed JSON.
  const [src, setSrc] = useState<string>(INTRO_LOTTIE_SRC);

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
    // Scale by height; target wordmark is 40px tall by spec, splash
    // logo is much larger. Width follows aspect since transform
    // scale is uniform.
    const scale = to.height / from.height;
    // With `transform-origin: top left`, scale shrinks from the
    // top-left corner and translate moves that same corner. Delta
    // is target-top-left minus splash-top-left.
    const dx = to.left - from.left;
    const dy = to.top - from.top;

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
            instance.addEventListener('loadError', () => {
              if (src !== INTRO_JSON_SRC) setSrc(INTRO_JSON_SRC);
            });
          }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
