import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import {
  INTENSITY_ORDER,
  quadrantColor,
  type EmotionSelection,
  type Quadrant,
} from '../theme/emotions';

interface Props {
  entryQuadrant: Quadrant;
  selected: EmotionSelection[];
  onToggle: (sel: EmotionSelection) => void;
  onBack: () => void;
  onNext: () => void;
  max?: number;
}

// — Geometry ————————————————————————————————————————————————
// The pannable plane is square. Four quadrants occupy the four
// corners; chips inside each quadrant sit on a 3×4 grid tilted
// toward the plane's outer corner so the strongest emotion lands
// in the corner and the mildest near the plane center. Kept tight
// so several quadrants' chips are visible at once.
const PLANE = 600;
const HALF = PLANE / 2;
const QUAD_INNER = 20; // gap from plane center where chips start
const QUAD_OUTER = 290; // distance from plane center where chips end
const COLS = 3;
const ROWS = 4;

// Which corner of the plane each quadrant occupies — matches sketch:
//   HEP top-left,  HEN top-right
//   LEP bot-left,  LEN bot-right
const QUAD_DIR: Record<Quadrant, { sx: -1 | 1; sy: -1 | 1 }> = {
  hep: { sx: -1, sy: -1 },
  hen: { sx: 1, sy: -1 },
  lep: { sx: -1, sy: 1 },
  len: { sx: 1, sy: 1 },
};

interface ChipPos {
  quadrant: Quadrant;
  name: string;
  cx: number;
  cy: number;
}

/** Centroid of a quadrant — used to scroll-center on entry. */
function quadrantCenter(q: Quadrant): { x: number; y: number } {
  const d = QUAD_DIR[q];
  const mid = (QUAD_INNER + QUAD_OUTER) / 2;
  return { x: HALF + d.sx * mid, y: HALF + d.sy * mid };
}

function buildPositions(): ChipPos[] {
  const out: ChipPos[] = [];
  const range = QUAD_OUTER - QUAD_INNER;
  for (const q of Object.keys(QUAD_DIR) as Quadrant[]) {
    const d = QUAD_DIR[q];
    // Build the 12 cell centers in cartesian order, then sort by
    // distance from the plane's outer corner: closest cell takes
    // the strongest emotion (rank 11), farthest takes the mildest (0).
    const corner = { x: HALF + d.sx * QUAD_OUTER, y: HALF + d.sy * QUAD_OUTER };
    const cells: { x: number; y: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const fx = (c + 0.5) / COLS;
        const fy = (r + 0.5) / ROWS;
        const x = HALF + d.sx * (QUAD_INNER + fx * range);
        const y = HALF + d.sy * (QUAD_INNER + fy * range);
        cells.push({ x, y });
      }
    }
    cells.sort(
      (a, b) =>
        Math.hypot(a.x - corner.x, a.y - corner.y) -
        Math.hypot(b.x - corner.x, b.y - corner.y),
    );
    const list = INTENSITY_ORDER[q];
    // rank index 11 (strongest) → cells[0] (closest to corner)
    list.forEach((name, intensity) => {
      const cellIdx = list.length - 1 - intensity;
      const { x, y } = cells[cellIdx];
      out.push({ quadrant: q, name, cx: x, cy: y });
    });
  }
  return out;
}

// — Fisheye tuning —————————————————————————————————————————
// Lite fisheye: chips near the viewport center stay full size and
// fully opaque; chips farther away scale and fade — never to zero.
const FISHEYE_RADIUS = 240;
const SCALE_FLOOR = 0.7;
const OPACITY_FLOOR = 0.55;

export default function EmotionGridScreen({
  entryQuadrant,
  selected,
  onToggle,
  onBack,
  onNext,
  max = 5,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const rafRef = useRef<number | null>(null);

  const positions = useMemo(buildPositions, []);
  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.name)),
    [selected],
  );
  const capReached = selected.length >= max;

  // Mutate chip transforms directly on scroll — avoids re-rendering
  // 48 chips on every scroll tick.
  function applyFisheye() {
    const vp = viewportRef.current;
    if (!vp) return;
    const vcx = vp.scrollLeft + vp.clientWidth / 2;
    const vcy = vp.scrollTop + vp.clientHeight / 2;
    chipRefs.current.forEach((el, key) => {
      const pos = positions.find((p) => p.name === key);
      if (!pos) return;
      const dist = Math.hypot(pos.cx - vcx, pos.cy - vcy);
      const t = Math.min(1, dist / FISHEYE_RADIUS);
      const scale = 1 - (1 - SCALE_FLOOR) * t;
      const opacity = 1 - (1 - OPACITY_FLOOR) * t;
      el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
    });
  }

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // Center the viewport on the entry quadrant's centroid.
    const c = quadrantCenter(entryQuadrant);
    vp.scrollLeft = c.x - vp.clientWidth / 2;
    vp.scrollTop = c.y - vp.clientHeight / 2;
    applyFisheye();

    function onScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyFisheye();
      });
    }
    vp.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      vp.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryQuadrant]);

  function chipStyle(q: Quadrant, isSelected: boolean): CSSProperties {
    // Clean white circles with a strong quadrant-colored ring so the
    // border alone communicates which quadrant a chip belongs to.
    // Selected: solid quadrant fill with white text — high contrast
    // against neighbors.
    return {
      background: isSelected ? quadrantColor(q, 0.95) : 'rgba(255,255,255,0.95)',
      borderColor: quadrantColor(q, isSelected ? 1 : 0.85),
      color: isSelected ? '#fff' : 'var(--charcoal)',
    };
  }

  const left = max - selected.length;

  return (
    <div className="screen" id="emotion-grid">
      <div className="wordmark">Tenor</div>

      <header className="eg-header">
        <BackButton onClick={onBack} />
        <div className="eg-counter" aria-live="polite">
          <strong>{selected.length}</strong>
          <span>selected · {left} left</span>
        </div>
        <span className="eg-spacer" aria-hidden="true" />
      </header>

      <div className="eg-viewport" ref={viewportRef} aria-label="Emotion grid">
        <div
          className="eg-plane"
          style={{ width: PLANE, height: PLANE }}
          role="group"
        >
          {positions.map((p) => {
            const isSelected = selectedSet.has(p.name);
            const disabled = !isSelected && capReached;
            return (
              <button
                key={p.name}
                type="button"
                ref={(el) => {
                  if (el) chipRefs.current.set(p.name, el);
                  else chipRefs.current.delete(p.name);
                }}
                className={
                  'eg-chip' +
                  (isSelected ? ' eg-chip--on' : '') +
                  (disabled ? ' eg-chip--disabled' : '')
                }
                style={{
                  left: p.cx,
                  top: p.cy,
                  ...chipStyle(p.quadrant, isSelected),
                }}
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onToggle({ name: p.name, quadrant: p.quadrant })}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="eg-footer">
        <p className="eg-hint">drag to explore more emotions</p>
        <button
          type="button"
          className="btn-primary eg-next"
          disabled={selected.length === 0}
          onClick={onNext}
        >
          next
          <CaretRight size={16} weight="bold" />
        </button>
      </footer>
    </div>
  );
}
