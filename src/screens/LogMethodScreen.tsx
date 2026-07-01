import { useEffect, useRef } from 'react';
import {
  Microphone,
  PencilSimple,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import { QUADRANTS, type Quadrant } from '../theme/emotions';

interface Props {
  onBack: () => void;
  onSpeak: () => void;
  /** Classic-mode handler — fires when the user picks one of the four
   *  HEP/HEN/LEP/LEN quadrants. Not invoked in starburst mode. */
  onPickQuadrant: (q: Quadrant) => void;
  /** Starburst-mode handler — fires when the user crosses the scroll
   *  threshold below the speak/type section (or taps the caret CTA).
   *  Not invoked in classic mode. */
  onPickStarburst: () => void;
  /** Current selector variant. Both variants share the speak/type
   *  section and a scroll-down affordance. Classic scrolls into a
   *  4-quadrant grid (HEP/HEN/LEP/LEN); starburst routes DIRECTLY into
   *  StarburstSelectorScreen — no intermediate "explore" screen
   *  (Fix 1, Jul 1 2026). */
  emotionUi: 'classic' | 'starburst';
  /** Which snap section to land on when this screen mounts.
   *  Classic only — 'quadrants' lands on the quadrant grid, used when
   *  returning from EmotionGridScreen's back button. Starburst always
   *  mounts at the methods section. */
  initialSection?: 'methods' | 'quadrants';
}

const QUADRANT_GRID: Quadrant[] = ['hep', 'hen', 'lep', 'len'];

export default function LogMethodScreen({
  onBack,
  onSpeak,
  onPickQuadrant,
  onPickStarburst,
  emotionUi,
  initialSection = 'methods',
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const quadrantsRef = useRef<HTMLElement>(null);
  const methodsRef = useRef<HTMLElement>(null);
  const sensorRef = useRef<HTMLDivElement>(null);

  const isStarburst = emotionUi === 'starburst';

  function scrollTo(el: HTMLElement | null) {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Classic only — land on the requested section on mount. Instant
  // scroll (no smooth) so the screen reads as "opens there" when
  // returning from the EmotionGridScreen back button.
  useEffect(() => {
    if (isStarburst) return;
    if (initialSection !== 'quadrants') return;
    const el = quadrantsRef.current;
    const sc = scrollRef.current;
    if (!el || !sc) return;
    sc.scrollTop = el.offsetTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Starburst (Fix 1) — when the user starts scrolling past the
  // speak/type section, route DIRECTLY into the starburst selector.
  // No intermediate explore screen. The same handler fires for either
  // gesture: a finger swipe down (scroll event) or a tap on the
  // caret-down CTA (which scrolls into the sensor).
  useEffect(() => {
    if (!isStarburst) return;
    const sc = scrollRef.current;
    const m = methodsRef.current;
    if (!sc || !m) return;
    let fired = false;
    function onScroll() {
      if (fired) return;
      // Fire as soon as the user crosses ~30% of the methods section
      // height — that's about the point where the scroll feels
      // intentional but well before any "second screen" would render.
      const threshold = Math.max(80, (m?.offsetHeight ?? 0) * 0.3);
      if (sc && sc.scrollTop > threshold) {
        fired = true;
        onPickStarburst();
      }
    }
    sc.addEventListener('scroll', onScroll, { passive: true });
    return () => sc.removeEventListener('scroll', onScroll);
  }, [isStarburst, onPickStarburst]);

  function onHelpClick() {
    if (isStarburst) {
      // Tap path — bypass the scroll sensor entirely.
      onPickStarburst();
      return;
    }
    scrollTo(quadrantsRef.current);
  }

  return (
    <div className="screen" id="log-method">
      <div className="top-bar">
        <BackButton onClick={onBack} />
      </div>

      <div className="lm-body" ref={scrollRef}>
        {/* Page 1 — pick an input method */}
        <section className="lm-section" ref={methodsRef}>
          <h1 className="lm-title">
            How do you want
            <br />
            to log today?
          </h1>

          <div className="bubble-row">
            <button type="button" className="input-bubble" onClick={onSpeak}>
              <span className="i-bubble">
                <Microphone size={28} weight="light" />
              </span>
              <span className="i-label">Speak</span>
            </button>

            <div className="input-bubble input-bubble--off" aria-disabled="true">
              <span className="i-bubble">
                <PencilSimple size={28} weight="light" />
              </span>
              <span className="i-label">Type</span>
            </div>
          </div>

          <button type="button" className="lm-help" onClick={onHelpClick}>
            <span>
              Need help naming your feelings?
              <br />
              Select from below.
            </span>
            <CaretDown size={20} weight="regular" />
          </button>
        </section>

        {/* Starburst — invisible scroll sensor below methods. Gives
            the lm-body enough scroll height for swipe-down detection,
            and the scroll listener above fires onPickStarburst as
            soon as the user crosses the threshold. */}
        {isStarburst && (
          <div
            ref={sensorRef}
            className="lm-starburst-sensor"
            aria-hidden="true"
          />
        )}

        {/* Classic — quadrant picker section. Tapping a quadrant
            enters EmotionGridScreen centered on it. */}
        {!isStarburst && (
          <section
            className="lm-section lm-section--quads"
            ref={quadrantsRef}
          >
            <button
              type="button"
              className="lm-back-up"
              aria-label="Back to log methods"
              onClick={() => scrollTo(methodsRef.current)}
            >
              <CaretUp size={20} weight="regular" />
            </button>

            <h2 className="lm-quad-title">Need help naming your feelings?</h2>
            <p className="lm-quad-sub">Pick a category to start exploring.</p>

            <div className="quad-grid" role="group" aria-label="Emotion categories">
              {QUADRANT_GRID.map((q) => {
                const meta = QUADRANTS[q];
                return (
                  <button
                    key={q}
                    type="button"
                    className={`quad-btn quad-btn--${q}`}
                    onClick={() => onPickQuadrant(q)}
                  >
                    <span className="quad-btn__label">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
