import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { CaretRight } from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import {
  INTENSITY_ORDER,
  quadrantColor,
  shadeQuadrant,
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
// Chip-cell layout. Each quadrant fills its corner of the plane
// with a COLS×ROWS grid of fixed-size circular buttons sitting on
// a cell pitch of CHIP + GAP. The plane is taller than the viewport
// so vertical panning reveals each quadrant's high/low rows.
//   col 0 = closest to plane center seam (mildest of that row)
//   col COLS-1 = closest to outer corner (strongest of that row)
// Same for rows. Intensity radiates from plane center → outer corner.
const CHIP = 116;
const GAP = 4;
const CELL = CHIP + GAP;
const COLS = 3;
const ROWS = 4;
// Distance from plane center to the first chip's center, chosen so
// chips facing each other across the seam also have a 4px edge gap.
const QUAD_INNER = CHIP / 2 + GAP / 2;
const EDGE_MARGIN = 2;
// Half-extent of the chip cluster (center → outermost chip edge).
const INNER_HALF_W =
  QUAD_INNER + (COLS - 1) * CELL + CHIP / 2 + EDGE_MARGIN;
const INNER_HALF_H =
  QUAD_INNER + (ROWS - 1) * CELL + CHIP / 2 + EDGE_MARGIN;
// Extra padding on every side of the plane so the user can scroll
// past the chip cluster — even the outermost chip can be brought to
// the viewport center (and enlarged by the fisheye). Sized just
// past half the typical mobile viewport so edge chips can center
// without panning into excessive empty space.
const SCROLL_PAD_X = 220;
const SCROLL_PAD_Y = 400;
const PLANE_W = (INNER_HALF_W + SCROLL_PAD_X) * 2;
const PLANE_H = (INNER_HALF_H + SCROLL_PAD_Y) * 2;
const CENTER_X = PLANE_W / 2;
const CENTER_Y = PLANE_H / 2;

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

/** Geometric center of a quadrant's chip grid — used to scroll-center on entry. */
function quadrantCenter(q: Quadrant): { x: number; y: number } {
  const d = QUAD_DIR[q];
  const midX = QUAD_INNER + ((COLS - 1) * CELL) / 2;
  const midY = QUAD_INNER + ((ROWS - 1) * CELL) / 2;
  return { x: CENTER_X + d.sx * midX, y: CENTER_Y + d.sy * midY };
}

function buildPositions(): ChipPos[] {
  const out: ChipPos[] = [];
  for (const q of Object.keys(QUAD_DIR) as Quadrant[]) {
    const d = QUAD_DIR[q];
    // Build cell centers in (col, row) order. Then sort by distance
    // from the OUTER corner cell so cells[0] is the corner-most
    // (strongest) and cells[last] is the center-most (mildest).
    const cells: { x: number; y: number; rank: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = CENTER_X + d.sx * (QUAD_INNER + col * CELL);
        const y = CENTER_Y + d.sy * (QUAD_INNER + row * CELL);
        const dCol = COLS - 1 - col;
        const dRow = ROWS - 1 - row;
        cells.push({ x, y, rank: Math.hypot(dCol, dRow) });
      }
    }
    cells.sort((a, b) => a.rank - b.rank);
    const list = INTENSITY_ORDER[q];
    list.forEach((name, intensity) => {
      // intensity 0 = mildest → cells[last]; max = strongest → cells[0]
      const cellIdx = list.length - 1 - intensity;
      const c = cells[cellIdx];
      out.push({ quadrant: q, name, cx: c.x, cy: c.y });
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

/** Web Vibration API — real haptic on Android browsers, a no-op
 *  on iOS Safari (Apple doesn't ship it) and desktop browsers. */
function haptic(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(ms);
  }
}

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

  // Mouse-only pointer drag — gives explicit 2D pan (including
  // diagonal) that the trackpad's axis-biased gesture won't.
  // Touch is left to native overflow scrolling so mobile momentum
  // + snap keeps feeling right.
  const dragRef = useRef<{
    sx: number; sy: number; sLeft: number; sTop: number; moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const vp = viewportRef.current;
    if (!vp) return;
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      sLeft: vp.scrollLeft,
      sTop: vp.scrollTop,
      moved: false,
    };
    vp.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const vp = viewportRef.current;
    if (!drag || !vp) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      setDragging(true);
    }
    if (drag.moved) {
      vp.scrollLeft = drag.sLeft - dx;
      vp.scrollTop = drag.sTop - dy;
    }
  }

  function onPointerUp() {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (moved) {
      // Swallow the click that fires right after a drag-pan so a
      // chip under the cursor doesn't get selected on release.
      suppressClickRef.current = true;
      requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    }
    setDragging(false);
  }

  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

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
    // When scroll settles, see if it landed on a chip (CSS snap
    // pulls it there). If yes, a tiny haptic confirms the snap.
    function onScrollEnd() {
      const v = viewportRef.current;
      if (!v) return;
      const vcx = v.scrollLeft + v.clientWidth / 2;
      const vcy = v.scrollTop + v.clientHeight / 2;
      let nearest = Infinity;
      for (const p of positions) {
        const d = Math.hypot(p.cx - vcx, p.cy - vcy);
        if (d < nearest) nearest = d;
      }
      // 14px is comfortably tighter than half a cell — only fires
      // when the snap genuinely landed on a chip, not on free pans
      // into the empty scroll-padding zones.
      if (nearest < 14) haptic(8);
    }
    vp.addEventListener('scroll', onScroll, { passive: true });
    vp.addEventListener('scrollend', onScrollEnd);
    return () => {
      vp.removeEventListener('scroll', onScroll);
      vp.removeEventListener('scrollend', onScrollEnd);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryQuadrant]);

  function chipStyle(q: Quadrant, isSelected: boolean): CSSProperties {
    // Unselected: filled with a light quadrant tint — charcoal text
    // still reads with strong contrast (the pastel base + 0.22 alpha
    // sits well above the WCAG AA threshold on white).
    // Selected: vibrant full-strength fill + thick darker-quadrant
    // ring — three differentiation signals (saturation, ring, weight).
    return {
      background: isSelected ? quadrantColor(q, 1) : quadrantColor(q, 0.4),
      borderColor: isSelected ? shadeQuadrant(q, 0.35) : 'transparent',
      color: 'var(--charcoal)',
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

      <div
        className={'eg-viewport' + (dragging ? ' eg-viewport--dragging' : '')}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        aria-label="Emotion grid"
      >
        <div
          className="eg-plane"
          style={{ width: PLANE_W, height: PLANE_H }}
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
                onClick={() => {
                  haptic(isSelected ? 6 : 12);
                  onToggle({ name: p.name, quadrant: p.quadrant });
                }}
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
