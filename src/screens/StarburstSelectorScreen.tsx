// StarburstSelectorScreen — Emotion Selector v2 (variant: 'starburst')
// =====================================================================
// Shows the 6 Junto base emotions arranged radially on the same pannable
// fisheye plane that EmotionGridScreen uses, with a centre "numb" chip.
// Tapping a base emotion surfaces a definition card with two actions:
// pick the base outright, or "Go deeper →" to bloom its sub-emotions
// outward on the same plane. Sub-emotion picks auto-deselect the parent.
// Selection cap is 5 (same as classic).
//
// What's shared with EmotionGridScreen — the viewport pan / scroll-pad
// logic, the rAF fisheye transform loop, snap haptics, the click-vs-
// drag suppression, and chip aesthetics. What's different — chip
// placement (polar instead of 4-quadrant grid), per-base palettes
// (CSS-variable lookup via baseEmotionColor), and the two-layer model
// with bloom + breadcrumb + dual-action definition card.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { ArrowLeft, CaretRight } from '@phosphor-icons/react';
import BackButton from '../components/BackButton';
import {
  BASE_TO_QUADRANT,
  EMOTION_DEFINITIONS,
  STARBURST_BASES,
  STARBURST_SUB_EMOTIONS,
  baseEmotionColor,
  type BaseEmotion,
  type EmotionSelection,
} from '../theme/emotions';
import * as haptics from '../lib/haptics';

interface Props {
  selected: EmotionSelection[];
  onToggle: (sel: EmotionSelection) => void;
  onBack: () => void;
  onNext: () => void;
  max?: number;
}

// — Geometry —————————————————————————————————————————————————
// Layer 1 sits at radius 200px from centre (the "numb" chip is at 0,0);
// layer 2 blooms outward in concentric arcs starting at radius 320px,
// each ring 140px farther out. Each base owns a 60° wedge of the circle,
// so a base's sub-emotions stay within ±30° of the base's angle. With
// up to 22 sub-emotions per base, we pack 3 per ring so the chips don't
// overlap — fisheye + pan takes care of close-quarters legibility.
const CHIP = 130;
const BASE_RADIUS = 200;
const SUB_RING_START = 320;
const SUB_RING_GAP = 140;
const SUB_PER_RING = 3;
const WEDGE_DEG = 60;

// Scroll-pad so any chip can be panned to viewport centre and grown by
// the fisheye. Biggest sub-emotion list (Sadness, 22) → 8 rings → max
// radius ≈ 320 + 7×140 = 1300. Add ~400 of slack each side.
const PLANE_HALF = 1300 + 400;
const PLANE_W = PLANE_HALF * 2;
const PLANE_H = PLANE_HALF * 2;
const CENTER_X = PLANE_HALF;
const CENTER_Y = PLANE_HALF;

// — Fisheye tuning — matches EmotionGridScreen so motion feels familiar.
const FISHEYE_RADIUS = 240;
const SCALE_CEIL = 1.08;
const SCALE_FLOOR = 0.6;
const OPACITY_FLOOR = 0.42;

// Title-case "awe-struck" → "Awe-Struck", "numb" → "Numb". Sub-emotions
// are stored lowercase to match the DB enum convention; we title-case
// for display only.
function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\w)/g, (_, p, c) => p + c.toUpperCase());
}

interface ChipPos {
  /** Layer-1 chips use 'base' or 'numb'; layer-2 chips use 'sub'. */
  kind: 'numb' | 'base' | 'sub';
  /** Lowercase emotion identifier — what gets logged as emotion_name. */
  name: string;
  /** The starburst base this chip belongs to. NULL only for 'numb'. */
  base: BaseEmotion | null;
  cx: number;
  cy: number;
}

/** Polar → Cartesian on the plane, with 0° pointing north (top). */
function polarXY(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER_X + radius * Math.cos(rad),
    y: CENTER_Y + radius * Math.sin(rad),
  };
}

const BASES = Object.keys(STARBURST_BASES) as BaseEmotion[];

function buildLayer1(): ChipPos[] {
  const numb: ChipPos = { kind: 'numb', name: 'numb', base: null, cx: CENTER_X, cy: CENTER_Y };
  const bases: ChipPos[] = BASES.map((b) => {
    const { x, y } = polarXY(STARBURST_BASES[b].angle, BASE_RADIUS);
    return { kind: 'base', name: b, base: b, cx: x, cy: y };
  });
  return [numb, ...bases];
}

function buildBloom(base: BaseEmotion): ChipPos[] {
  const subs = STARBURST_SUB_EMOTIONS[base];
  const baseAngle = STARBURST_BASES[base].angle;
  return subs.map((name, i) => {
    const ringIdx = Math.floor(i / SUB_PER_RING);
    const inRing = i % SUB_PER_RING;
    const r = SUB_RING_START + ringIdx * SUB_RING_GAP;
    // Spread `SUB_PER_RING` chips evenly across the wedge, leaving a
    // half-step margin at each edge so the wedges of adjacent bases
    // don't visually fight at the seams.
    const step = WEDGE_DEG / SUB_PER_RING;
    const angle = baseAngle - WEDGE_DEG / 2 + step * (inRing + 0.5);
    const { x, y } = polarXY(angle, r);
    return { kind: 'sub', name, base, cx: x, cy: y };
  });
}

export default function StarburstSelectorScreen({
  selected,
  onToggle,
  onBack,
  onNext,
  max = 5,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const rafRef = useRef<number | null>(null);

  // Which base emotion is currently "bloomed" (showing sub-emotions).
  // null = layer 1 only. Tapping "Go deeper" sets this; the back arrow
  // / breadcrumb back-tap clears it.
  const [bloomedBase, setBloomedBase] = useState<BaseEmotion | null>(null);

  const positions = useMemo<ChipPos[]>(() => {
    const layer1 = buildLayer1();
    if (!bloomedBase) return layer1;
    return [...layer1, ...buildBloom(bloomedBase)];
  }, [bloomedBase]);

  const initialCentered = positions.find((p) => p.kind === 'numb') ?? positions[0];
  const centeredRef = useRef<string>(initialCentered.name);
  const [centered, setCentered] = useState<ChipPos>(initialCentered);

  // — Mouse-drag pan (touch uses native overflow scrolling) — copied
  //   verbatim from EmotionGridScreen so the gesture feels identical
  //   across the two variants.
  const dragRef = useRef<{
    sx: number; sy: number; sLeft: number; sTop: number; moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const capturedPointerRef = useRef<number | null>(null);
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
      try {
        vp.setPointerCapture(e.pointerId);
        capturedPointerRef.current = e.pointerId;
      } catch {
        // ignore — pointer already gone
      }
    }
    if (drag.moved) {
      vp.scrollLeft = drag.sLeft - dx;
      vp.scrollTop = drag.sTop - dy;
    }
  }
  function onPointerUp() {
    const moved = dragRef.current?.moved ?? false;
    dragRef.current = null;
    if (capturedPointerRef.current !== null) {
      const vp = viewportRef.current;
      try {
        vp?.releasePointerCapture(capturedPointerRef.current);
      } catch {
        // ignore
      }
      capturedPointerRef.current = null;
    }
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

  // Fisheye: same model as the classic grid. We also use it to pick
  // the chip nearest viewport centre — that's the chip the definition
  // card describes.
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

  // Prime Taptic on mount so the first scroll tick isn't silent.
  useEffect(() => {
    haptics.prime();
  }, []);

  // Centre on the "numb" chip on mount, and re-centre on the bloomed
  // base when the user drills in — keeps the just-selected base in
  // view as the sub-emotions appear around it.
  const userInteractedRef = useRef(false);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    function markInteracted() {
      userInteractedRef.current = true;
    }
    vp.addEventListener('pointerdown', markInteracted, { once: true });
    vp.addEventListener('wheel', markInteracted, { once: true, passive: true });
    vp.addEventListener('touchstart', markInteracted, { once: true, passive: true });
    return () => {
      vp.removeEventListener('pointerdown', markInteracted);
      vp.removeEventListener('wheel', markInteracted);
      vp.removeEventListener('touchstart', markInteracted);
    };
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    // Reset the interaction lock when bloom state flips so the
    // re-centre below actually fires.
    userInteractedRef.current = false;
    const target = bloomedBase
      ? positions.find((p) => p.kind === 'base' && p.name === bloomedBase) ?? positions[0]
      : positions.find((p) => p.kind === 'numb') ?? positions[0];
    vp.scrollLeft = target.cx - vp.clientWidth / 2;
    vp.scrollTop = target.cy - vp.clientHeight / 2;
  }, [bloomedBase, positions]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    applyFisheye();

    let lastCenteredKey: string | null = null;
    function onScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        applyFisheye();

        const v = viewportRef.current;
        if (!v) return;
        const vcx = v.scrollLeft + v.clientWidth / 2;
        const vcy = v.scrollTop + v.clientHeight / 2;
        let nearestKey: string | null = null;
        let nearestDist = Infinity;
        for (const p of positions) {
          const d = Math.hypot(p.cx - vcx, p.cy - vcy);
          if (d < nearestDist) {
            nearestDist = d;
            nearestKey = p.name;
          }
        }
        if (nearestKey && nearestKey !== lastCenteredKey) {
          lastCenteredKey = nearestKey;
          haptics.snap();
        }
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
  }, [positions]);

  // — Chip styling. 'numb' uses the neutral palette; base + sub chips
  //   use the base's per-palette CSS variables. Selected = solid
  //   primary; unselected = light tint (300/200) so multiple unselected
  //   chips still differentiate by colour.
  function chipStyle(chip: ChipPos, isSelected: boolean): CSSProperties {
    if (chip.kind === 'numb') {
      return {
        background: isSelected ? 'var(--n-400)' : 'var(--n-200)',
        borderColor: isSelected ? 'var(--n-700)' : 'transparent',
        color: 'var(--charcoal)',
      };
    }
    const b = chip.base!;
    const meta = STARBURST_BASES[b];
    return {
      background: isSelected
        ? baseEmotionColor(b)
        : baseEmotionColor(b, meta.primaryShade === 500 ? 300 : 200),
      borderColor: isSelected
        ? baseEmotionColor(b, meta.primaryShade === 500 ? 700 : 600)
        : 'transparent',
      color: 'var(--charcoal)',
      // Layer-1 base chips are larger than sub chips per spec.
      width: chip.kind === 'base' ? `${CHIP}px` : `${CHIP - 18}px`,
      height: chip.kind === 'base' ? `${CHIP}px` : `${CHIP - 18}px`,
    };
  }

  // — Selection handlers. Base emotion picks (from the def card)
  //   replace any sub-emotion of the same base in the current
  //   selection — and vice versa — so the user can't have BOTH 'joy'
  //   and 'excited' picked at once.
  function pickBase(b: BaseEmotion) {
    const exists = selected.find((s) => s.name === b);
    if (exists) {
      haptics.softTap();
      onToggle({ name: b, quadrant: BASE_TO_QUADRANT[b], baseEmotion: b });
      return;
    }
    // Remove any sub-emotion that belongs to this base before adding.
    for (const s of selected) {
      if (s.baseEmotion === b && s.name !== b) {
        onToggle(s); // toggle off
      }
    }
    if (capReached) return;
    haptics.tap();
    onToggle({ name: b, quadrant: BASE_TO_QUADRANT[b], baseEmotion: b });
  }

  function pickSub(name: string, b: BaseEmotion) {
    const exists = selected.find((s) => s.name === name);
    if (exists) {
      haptics.softTap();
      onToggle({ name, quadrant: BASE_TO_QUADRANT[b], baseEmotion: b });
      return;
    }
    // Auto-deselect the parent base if it's selected — spec rule.
    const parentSelected = selected.find((s) => s.name === b);
    if (parentSelected) {
      onToggle(parentSelected);
    }
    if (capReached && !parentSelected) return;
    haptics.tap();
    onToggle({ name, quadrant: BASE_TO_QUADRANT[b], baseEmotion: b });
  }

  function pickNumb() {
    const exists = selected.find((s) => s.name === 'numb');
    if (exists) {
      haptics.softTap();
      // Use a placeholder quadrant for back-compat; numb's lane is
      // independent (chips render with the neutral palette).
      onToggle({ name: 'numb', quadrant: 'len', baseEmotion: null });
      return;
    }
    if (capReached) return;
    haptics.tap();
    onToggle({ name: 'numb', quadrant: 'len', baseEmotion: null });
  }

  // Chip click — for layer-1 bases this just snap-centres (the def
  // card surfaces Select / Go deeper actions). For 'numb' and sub
  // chips the click directly toggles selection.
  function onChipClick(chip: ChipPos) {
    if (chip.kind === 'numb') {
      pickNumb();
      return;
    }
    if (chip.kind === 'sub') {
      pickSub(chip.name, chip.base!);
      return;
    }
    // Base chip: just bring it to centre so the def card pops up.
    const vp = viewportRef.current;
    if (vp) {
      vp.scrollTo({
        left: chip.cx - vp.clientWidth / 2,
        top: chip.cy - vp.clientHeight / 2,
        behavior: 'smooth',
      });
    }
  }

  const left = max - selected.length;
  const isSelected = selectedSet.has(centered.name);

  return (
    <div className="screen" id="starburst">
      <header className="eg-header">
        <BackButton
          onClick={() => {
            if (bloomedBase) {
              setBloomedBase(null);
              return;
            }
            onBack();
          }}
        />
        <div className="eg-counter" aria-live="polite">
          <strong>{selected.length}</strong>
          <span>selected · {left} left</span>
        </div>
        <span className="eg-spacer" aria-hidden="true" />
      </header>

      {bloomedBase && (
        <button
          type="button"
          className="sb-breadcrumb"
          onClick={() => setBloomedBase(null)}
          aria-label={`Back to base emotions`}
        >
          <ArrowLeft size={14} weight="bold" />
          {STARBURST_BASES[bloomedBase].label}
          <span aria-hidden="true"> →</span>
        </button>
      )}

      <div
        className={'eg-viewport' + (dragging ? ' eg-viewport--dragging' : '')}
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        aria-label="Starburst emotion plane"
      >
        <div
          className="eg-plane"
          style={{ width: PLANE_W, height: PLANE_H }}
          role="group"
        >
          {positions.map((p) => {
            const isSel = selectedSet.has(p.name);
            const label = titleCase(p.name);
            const disabled = !isSel && capReached;
            return (
              <button
                key={`${p.kind}:${p.name}`}
                type="button"
                ref={(el) => {
                  if (el) chipRefs.current.set(p.name, el);
                  else chipRefs.current.delete(p.name);
                }}
                className={
                  'eg-chip sb-chip sb-chip--' + p.kind +
                  (isSel ? ' eg-chip--on' : '') +
                  (disabled ? ' eg-chip--disabled' : '')
                }
                style={{
                  left: p.cx,
                  top: p.cy,
                  ...chipStyle(p, isSel),
                }}
                aria-pressed={isSel}
                disabled={disabled}
                onClick={() => onChipClick(p)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="eg-footer sb-footer">
        <div className="eg-def" aria-live="polite">
          {centered.kind === 'numb' ? (
            <>
              <span className="eg-def__word sb-def__word--numb">
                &ldquo;Numb&rdquo;
              </span>
              <p className="eg-def__body">
                {EMOTION_DEFINITIONS.numb}
              </p>
            </>
          ) : centered.kind === 'base' ? (
            <>
              <span
                className="eg-def__word"
                style={{
                  background: baseEmotionColor(centered.base!, 200),
                }}
              >
                &ldquo;{STARBURST_BASES[centered.base!].label}&rdquo;
              </span>
              <p className="eg-def__body">
                {STARBURST_BASES[centered.base!].label} — select this, or
                explore more specific feelings.
              </p>
            </>
          ) : (
            <>
              <span
                className="eg-def__word"
                style={{
                  background: baseEmotionColor(centered.base!, 200),
                }}
              >
                &ldquo;{titleCase(centered.name)}&rdquo;
              </span>
              <p className="eg-def__body">
                {EMOTION_DEFINITIONS[centered.name] ?? ''}
              </p>
            </>
          )}
        </div>

        {/* Layer-1 base centred → dual-action row (Select + Go deeper).
            Sub centred → single Select. 'numb' centred → no extra row
            (the chip toggles directly). All paths still surface the
            "next" button at the bottom of the footer. */}
        {centered.kind === 'base' && (
          <div className="sb-actions">
            <button
              type="button"
              className="btn-secondary sb-actions__select"
              onClick={() => pickBase(centered.base!)}
              disabled={!isSelected && capReached}
            >
              {isSelected ? 'Selected' : `Select ${STARBURST_BASES[centered.base!].label}`}
            </button>
            <button
              type="button"
              className="btn-primary sb-actions__deeper"
              onClick={() => {
                haptics.tap();
                setBloomedBase(centered.base!);
              }}
            >
              Go deeper
              <CaretRight size={14} weight="bold" />
            </button>
          </div>
        )}
        {centered.kind === 'sub' && (
          <div className="sb-actions sb-actions--single">
            <button
              type="button"
              className="btn-primary sb-actions__select"
              onClick={() => pickSub(centered.name, centered.base!)}
              disabled={!isSelected && capReached}
            >
              {isSelected ? 'Selected' : `Select ${titleCase(centered.name)}`}
            </button>
          </div>
        )}

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
