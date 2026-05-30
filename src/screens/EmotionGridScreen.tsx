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
  EMOTION_DEFINITIONS,
  INTENSITY_ORDER,
  quadrantColor,
  shadeQuadrant,
  tintQuadrant,
  type EmotionSelection,
  type Quadrant,
} from '../theme/emotions';
import { useVocabulary, type Emotion, type VocabByCategory } from '../lib/vocabulary';
import * as haptics from '../lib/haptics';

interface Props {
  entryQuadrant: Quadrant;
  selected: EmotionSelection[];
  onToggle: (sel: EmotionSelection) => void;
  onBack: () => void;
  onNext: () => void;
  max?: number;
}

// — Geometry ————————————————————————————————————————————————
// Each quadrant fills its corner of the plane with up to COLS×ROWS
// circular chips on a CHIP+GAP cell pitch. Chips are placed in
// mild → strong order, sorted by distance from the INNER corner
// (closest to plane center). Mildest sits at the seam; strongest
// reaches toward the outer corner. Categories with fewer emotions
// just leave the outer-corner cells empty.
const CHIP = 116;
const GAP = 4;
const CELL = CHIP + GAP;
const COLS = 6;
const ROWS = 9;
const QUAD_INNER = CHIP / 2 + GAP / 2;
const EDGE_MARGIN = 2;
const INNER_HALF_W =
  QUAD_INNER + (COLS - 1) * CELL + CHIP / 2 + EDGE_MARGIN;
const INNER_HALF_H =
  QUAD_INNER + (ROWS - 1) * CELL + CHIP / 2 + EDGE_MARGIN;
// Scroll-pad so even the outermost chip can be panned to viewport
// center (and enlarged by the fisheye).
const SCROLL_PAD_X = 220;
const SCROLL_PAD_Y = 400;
const PLANE_W = (INNER_HALF_W + SCROLL_PAD_X) * 2;
const PLANE_H = (INNER_HALF_H + SCROLL_PAD_Y) * 2;
const CENTER_X = PLANE_W / 2;
const CENTER_Y = PLANE_H / 2;

// Sketch layout: HEP top-left, HEN top-right, LEP bot-left, LEN bot-right.
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

/** Geometric center of a quadrant's chip grid — used for entry scroll-centering. */
function quadrantCenter(q: Quadrant): { x: number; y: number } {
  const d = QUAD_DIR[q];
  const midX = QUAD_INNER + ((COLS - 1) * CELL) / 2;
  const midY = QUAD_INNER + ((ROWS - 1) * CELL) / 2;
  return { x: CENTER_X + d.sx * midX, y: CENTER_Y + d.sy * midY };
}

function buildPositions(vocab: VocabByCategory): ChipPos[] {
  const out: ChipPos[] = [];
  for (const q of Object.keys(QUAD_DIR) as Quadrant[]) {
    const d = QUAD_DIR[q];
    // Cell centers sorted by distance from the INNER corner (col 0, row 0).
    // cells[0] is closest to the plane-center seam (mildest goes here);
    // cells[last] is the outer corner (strongest).
    const cells: { x: number; y: number; rank: number }[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = CENTER_X + d.sx * (QUAD_INNER + col * CELL);
        const y = CENTER_Y + d.sy * (QUAD_INNER + row * CELL);
        cells.push({ x, y, rank: Math.hypot(col, row) });
      }
    }
    cells.sort((a, b) => a.rank - b.rank);
    const list = vocab[q] ?? [];
    for (let i = 0; i < list.length && i < cells.length; i++) {
      const c = cells[i];
      out.push({ quadrant: q, name: list[i].name, cx: c.x, cy: c.y });
    }
  }
  return out;
}

// Static fallback used while the sheet CSV is in flight (or if the
// network/CORS ever blocks the fetch). Keeps the app usable offline.
function fallbackVocab(): VocabByCategory {
  const fb: VocabByCategory = { hep: [], lep: [], hen: [], len: [] };
  for (const q of Object.keys(INTENSITY_ORDER) as Quadrant[]) {
    fb[q] = INTENSITY_ORDER[q].map((name): Emotion => ({
      name,
      tier: 'Moderate',
      definition: EMOTION_DEFINITIONS[name] ?? '',
    }));
  }
  return fb;
}

// — Fisheye tuning —————————————————————————————————————————
const FISHEYE_RADIUS = 240;
const SCALE_CEIL = 1.08;
const SCALE_FLOOR = 0.6;
const OPACITY_FLOOR = 0.42;

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

  // Live vocabulary from the published Google Sheet (cached at
  // module level). Until it arrives, show the static fallback so
  // the screen never blanks.
  const { vocab } = useVocabulary();
  const byCategory: VocabByCategory = vocab?.byCategory ?? fallbackVocab();
  const definitionByName: Record<string, string> = useMemo(() => {
    if (vocab) return vocab.definitions;
    return EMOTION_DEFINITIONS;
  }, [vocab]);

  const positions = useMemo(() => buildPositions(byCategory), [byCategory]);

  const initialCentered = useMemo<ChipPos>(() => {
    const eq = positions.find((p) => p.quadrant === entryQuadrant);
    return eq ?? positions[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const centeredRef = useRef<string>(initialCentered.name);
  const [centered, setCentered] = useState<ChipPos>(initialCentered);

  // Mouse-only pointer drag — explicit 2D pan (including diagonal)
  // that the trackpad's axis-biased gesture won't give. Touch stays
  // on native overflow scrolling.
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

  const selectedSet = useMemo(
    () => new Set(selected.map((s) => s.name)),
    [selected],
  );
  const capReached = selected.length >= max;

  // Mutate chip transforms directly on scroll — avoids re-rendering
  // every chip on every scroll tick. Also picks the chip closest to
  // viewport center so the definition card knows what to show.
  function applyFisheye() {
    const vp = viewportRef.current;
    if (!vp) return;
    const vcx = vp.scrollLeft + vp.clientWidth / 2;
    const vcy = vp.scrollTop + vp.clientHeight / 2;
    let nearest: ChipPos | null = null;
    let nearestDist = Infinity;
    chipRefs.current.forEach((el, key) => {
      const pos = positions.find((p) => p.name === key);
      if (!pos) return;
      const dist = Math.hypot(pos.cx - vcx, pos.cy - vcy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = pos;
      }
      const t = Math.min(1, dist / FISHEYE_RADIUS);
      const scale = SCALE_CEIL - (SCALE_CEIL - SCALE_FLOOR) * t;
      const opacity = 1 - (1 - OPACITY_FLOOR) * t;
      el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
    });
    if (nearest && (nearest as ChipPos).name !== centeredRef.current) {
      centeredRef.current = (nearest as ChipPos).name;
      setCentered(nearest);
    }
  }

  // Entry centering: runs once when the screen mounts or the entry
  // quadrant changes. Deliberately NOT re-run when positions change
  // (e.g. live vocab loads) so the user's scroll position isn't
  // yanked back to centroid mid-explore.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const c = quadrantCenter(entryQuadrant);
    vp.scrollLeft = c.x - vp.clientWidth / 2;
    vp.scrollTop = c.y - vp.clientHeight / 2;
  }, [entryQuadrant]);

  // Listeners + fisheye apply: also re-attaches when positions change
  // (live vocab → new chip set) so the listener closure stays fresh.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    applyFisheye();

    function onScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyFisheye();
      });
    }
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
      if (nearest < 14) haptics.snap();
    }
    vp.addEventListener('scroll', onScroll, { passive: true });
    vp.addEventListener('scrollend', onScrollEnd);
    return () => {
      vp.removeEventListener('scroll', onScroll);
      vp.removeEventListener('scrollend', onScrollEnd);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions]);

  function chipStyle(q: Quadrant, isSelected: boolean): CSSProperties {
    // Unselected: light quadrant tint (charcoal text still passes
    // WCAG AA on every quadrant). Selected: vibrant fill + thick
    // darker-quadrant ring (selection signal #3 alongside saturation
    // and bolder weight).
    return {
      background: isSelected ? quadrantColor(q, 1) : quadrantColor(q, 0.4),
      borderColor: isSelected ? shadeQuadrant(q, 0.35) : 'transparent',
      color: 'var(--charcoal)',
    };
  }

  const left = max - selected.length;

  return (
    <div className="screen" id="emotion-grid">

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
                  if (isSelected) haptics.softTap();
                  else haptics.tap();
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
        <div className="eg-def" aria-live="polite">
          <span
            className="eg-def__word"
            style={{ background: tintQuadrant(centered.quadrant, 0.6, 1) }}
          >
            &ldquo;{centered.name}&rdquo;
          </span>
          <p className="eg-def__body">{definitionByName[centered.name] ?? ''}</p>
        </div>
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
