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
  onPickQuadrant: (q: Quadrant) => void;
  /** Which snap section to land on when this screen mounts.
   *  Defaults to 'methods' (the speak/type page). Set to 'quadrants'
   *  when returning from the EmotionGridScreen's back button so the
   *  user lands on the category picker, not the method picker. */
  initialSection?: 'methods' | 'quadrants';
}

// Layout matches the user's sketch:
//   HEP   HEN
//   LEP   LEN
const QUADRANT_GRID: Quadrant[] = ['hep', 'hen', 'lep', 'len'];

export default function LogMethodScreen({
  onBack,
  onSpeak,
  onPickQuadrant,
  initialSection = 'methods',
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const quadrantsRef = useRef<HTMLElement>(null);
  const methodsRef = useRef<HTMLElement>(null);

  function scrollTo(el: HTMLElement | null) {
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Land on the requested section on mount. Instant scroll (no smooth)
  // so the screen feels like it "opens there" rather than animating
  // from the top — important when arriving from EmotionGrid back, where
  // smooth-animating from methods → quadrants would read as a transition.
  useEffect(() => {
    if (initialSection !== 'quadrants') return;
    const el = quadrantsRef.current;
    const sc = scrollRef.current;
    if (!el || !sc) return;
    sc.scrollTop = el.offsetTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        </section>

        {/* Page 2 — pick a quadrant. Tapping a quadrant enters the
            emotion grid centered on it; the grid still lets you pan
            to the other three quadrants. */}
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
      </div>
    </div>
  );
}
