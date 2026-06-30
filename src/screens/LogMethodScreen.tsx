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
  /** Starburst-mode handler — fires when the user taps the "explore"
   *  tile in the second snap section. Not invoked in classic mode. */
  onPickStarburst: () => void;
  /** Current selector variant. Both variants use the same scroll-down
   *  affordance — what's revealed below is the only difference:
   *    classic  → 2×2 quadrant grid (HEP/HEN/LEP/LEN)
   *    starburst → single "explore" tile that routes into the
   *                radial selector
   *  Starburst users never see the HEP/HEN/LEP/LEN labels. */
  emotionUi: 'classic' | 'starburst';
  /** Which snap section to land on when this screen mounts.
   *  'methods' = speak/type picker, 'quadrants' = the section below
   *  (the quadrant grid in classic, the explore tile in starburst).
   *  Used when returning from the emotion selector's back button so
   *  the user lands where they came from. */
  initialSection?: 'methods' | 'quadrants';
}

// Classic-only — four-quadrant grid (HEP top-left, HEN top-right,
// LEP bot-left, LEN bot-right). Never rendered in starburst mode.
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
  const sectionTwoRef = useRef<HTMLElement>(null);
  const methodsRef = useRef<HTMLElement>(null);

  function scrollTo(el: HTMLElement | null) {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Land on the requested section on mount — used when returning from
  // the emotion selector's back button (initialSection='quadrants').
  // Instant scroll (no smooth) so it reads as "opens there" rather
  // than animating from the top.
  useEffect(() => {
    if (initialSection !== 'quadrants') return;
    const el = sectionTwoRef.current;
    const sc = scrollRef.current;
    if (!el || !sc) return;
    sc.scrollTop = el.offsetTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStarburst = emotionUi === 'starburst';

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

          {/* Scroll-down affordance — identical gesture in classic and
              starburst. The destination differs but the user gets
              there the same way: scroll, don't tap a side icon. */}
          <button
            type="button"
            className="lm-help"
            onClick={() => scrollTo(sectionTwoRef.current)}
          >
            <span>
              Need help naming your feelings?
              <br />
              Select from below.
            </span>
            <CaretDown size={20} weight="regular" />
          </button>
        </section>

        {/* Page 2 — what's revealed depends on the variant. Both
            sections share the same scroll-up affordance, title, and
            sub-copy so the gesture pattern is consistent across
            users. Only the body differs. */}
        <section
          className="lm-section lm-section--quads"
          ref={sectionTwoRef}
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
          <p className="lm-quad-sub">
            {isStarburst
              ? 'Tap to start exploring.'
              : 'Pick a category to start exploring.'}
          </p>

          {isStarburst ? (
            // Starburst — single tap-surface mimics the radial plane's
            // centre chip. Tapping it routes to StarburstSelectorScreen.
            <button
              type="button"
              className="lm-starburst-tile"
              onClick={onPickStarburst}
              aria-label="Explore from emotions"
            >
              <span className="lm-starburst-tile__bubble">explore</span>
            </button>
          ) : (
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
          )}
        </section>
      </div>
    </div>
  );
}
