import { useEffect, useRef } from 'react';
import {
  Microphone,
  PencilSimple,
  CaretDown,
  CaretUp,
  Sparkle,
} from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import { QUADRANTS, type Quadrant } from '../theme/emotions';

interface Props {
  onBack: () => void;
  onSpeak: () => void;
  /** Classic-mode handler — fires when the user picks one of the four
   *  HEP/HEN/LEP/LEN quadrants. Not invoked in starburst mode. */
  onPickQuadrant: (q: Quadrant) => void;
  /** Starburst-mode handler — fires when the user picks the single
   *  "from emotions" entry point. Not invoked in classic mode. */
  onPickStarburst: () => void;
  /** Current selector variant. In classic, the quadrant picker is
   *  reachable by scrolling down. In starburst, the quadrant grid is
   *  HIDDEN entirely (per Bug 1, Jun 30 2026) — those category labels
   *  are not allowed to surface to a starburst user — and the
   *  "Need help naming your feelings?" section instead routes
   *  straight to StarburstSelectorScreen. */
  emotionUi: 'classic' | 'starburst';
  /** Which snap section to land on when this screen mounts.
   *  Defaults to 'methods'. Classic uses 'quadrants' when returning
   *  from the EmotionGridScreen's back button so the user lands on
   *  the category picker. In starburst there are no quadrants — the
   *  prop is ignored. */
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
  const quadrantsRef = useRef<HTMLElement>(null);
  const methodsRef = useRef<HTMLElement>(null);

  function scrollTo(el: HTMLElement | null) {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Classic only — land on the requested section on mount. Skipped in
  // starburst because the second section doesn't exist.
  useEffect(() => {
    if (emotionUi === 'starburst') return;
    if (initialSection !== 'quadrants') return;
    const el = quadrantsRef.current;
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

          {isStarburst ? (
            // Starburst — direct route into the radial selector. No
            // quadrant picker is shown because starburst users must
            // never see HEP/HEN/LEP/LEN labels (Bug 1 fix).
            <button
              type="button"
              className="lm-help"
              onClick={onPickStarburst}
            >
              <span>
                Need help naming your feelings?
                <br />
                Explore from emotions.
              </span>
              <Sparkle size={20} weight="regular" />
            </button>
          ) : (
            <button
              type="button"
              className="lm-help"
              onClick={() => scrollTo(quadrantsRef.current)}
            >
              <span>
                Need help naming your feelings?
                <br />
                Select from below.
              </span>
              <CaretDown size={20} weight="regular" />
            </button>
          )}
        </section>

        {/* Page 2 — classic-only quadrant picker. Tapping a quadrant
            enters the emotion grid centered on it. Hidden entirely in
            starburst mode so HEP/HEN/LEP/LEN labels never surface. */}
        {!isStarburst && (
          <section className="lm-section lm-section--quads" ref={quadrantsRef}>
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
