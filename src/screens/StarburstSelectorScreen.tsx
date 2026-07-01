// StarburstSelectorScreen — Emotion Selector v2 (variant: 'starburst')
// =====================================================================
//
// Layout
//   - "Numb" chip at centre (0,0).
//   - 6 base emotion chips at 60° increments, radius 220 from centre.
//   - Pre-unlock: each base has a "Get more specific?" card 180px
//     further outward along its radial. The card is its own snap
//     node (Fix 2) — pan past the chip to bring it to centre.
//   - Tapping "Yes, let's get specific" on any card is a one-time
//     GLOBAL unlock. Cards disappear. Sub-emotion chips for the 6
//     bases come into existence on the plane.
//
// Sub-emotion visibility — state machine (Jul 2 2026, replaces all
// coordinate-based proximity logic):
//   activeBase: BaseEmotion | null
//     - Toggled by base-chip snap events. Snap on a base chip
//       whose `base !== activeBase` → activeBase = that base. Snap
//       on the SAME chip again (the return-journey snap after
//       panning past) → activeBase = null.
//     - Sub chips of base B render visible iff
//         activeBase === B          AND
//         panDot > BASE_RADIUS      (user has panned past the chip
//                                    along its outward radial axis)
//       — both conditions per Jul 2 spec. All other base's subs stay
//       at opacity: 0, pointer-events: none regardless of position.
//
// Dotted-line indicator
//   - Pre-unlock: long dotted line from chip → card position. Always
//     visible while !subEmotionsUnlocked.
//   - Post-unlock: short dotted stub from chip pointing outward.
//     Visible by default; HIDDEN when this base is the activeBase
//     AND the user has panned past the chip (sub-emotions are
//     expanded — the line has done its job).
//
// CRITICAL RULE: when emotion_ui === 'starburst' the strings
// HEP / HEN / LEP / LEN must never surface in the UI.

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
  STARBURST_BASES,
  STARBURST_SUB_EMOTIONS,
  baseEmotionColor,
  getEmotionDefinition,
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

// — Geometry ——————————————————————————————————————————————————
const NUMB_CHIP = 138;
const BASE_CHIP = 116;
const SUB_CHIP = 72;
const BASE_RADIUS = 220;
const SUB_RADIUS = 300;
const CARD_OFFSET = 180;
const POST_UNLOCK_STUB_LEN = 70;

const FAN_STEP_DEG = 30;
const MIN_FAN_DEG = 60;
const MAX_FAN_DEG = 130;

// Threshold for "settled on this snap target" — used for the
// scrollend toggle and haptic.
const SNAP_THRESHOLD_PX = 24;

const PLANE_HALF = BASE_RADIUS + SUB_RADIUS + 600;
const PLANE_W = PLANE_HALF * 2;
const PLANE_H = PLANE_HALF * 2;
const CENTER_X = PLANE_HALF;
const CENTER_Y = PLANE_HALF;

// — Fisheye tuning ————————————————————————————————————————————
// Scale formula (Jul 2 2026): max 1.2× at viewport centre, 0.75× at
// or beyond FISHEYE_RADIUS — keeps chips legible without ballooning.
// SCALE_FLOOR (0.75) lives inline in the formula below.
const FISHEYE_RADIUS = 240;
const SCALE_CEIL = 1.2;
const OPACITY_FLOOR = 0.42;

function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\w)/g, (_, p, c) => p + c.toUpperCase());
}

interface ChipPos {
  kind: 'numb' | 'sub';
  name: string;
  base: BaseEmotion | null;
  cx: number;
  cy: number;
}

interface CenteredItem {
  kind: 'numb' | 'base' | 'sub' | 'card';
  name: string;
  base: BaseEmotion | null;
}

function polarXY(angleDeg: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER_X + radius * Math.cos(rad),
    y: CENTER_Y + radius * Math.sin(rad),
  };
}

const BASES = Object.keys(STARBURST_BASES) as BaseEmotion[];

interface BasePos {
  base: BaseEmotion;
  cx: number;
  cy: number;
  /** Outward unit vector from centre, normalized. */
  ux: number;
  uy: number;
  angle: number;
  card_cx: number;
  card_cy: number;
}

const BASE_POSITIONS: Record<BaseEmotion, BasePos> = (() => {
  const out = {} as Record<BaseEmotion, BasePos>;
  for (const b of BASES) {
    const angle = STARBURST_BASES[b].angle;
    const { x, y } = polarXY(angle, BASE_RADIUS);
    const dx = x - CENTER_X;
    const dy = y - CENTER_Y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    out[b] = {
      base: b,
      cx: x,
      cy: y,
      ux,
      uy,
      angle,
      card_cx: x + ux * CARD_OFFSET,
      card_cy: y + uy * CARD_OFFSET,
    };
  }
  return out;
})();

const NUMB_POS: ChipPos = {
  kind: 'numb', name: 'numb', base: null, cx: CENTER_X, cy: CENTER_Y,
};

const NUMB_CENTERED: CenteredItem = { kind: 'numb', name: 'numb', base: null };

function buildBloom(base: BaseEmotion): ChipPos[] {
  const subs = STARBURST_SUB_EMOTIONS[base];
  const { cx, cy, angle } = BASE_POSITIONS[base];
  const n = subs.length;
  if (n === 0) return [];
  const fan = Math.min(
    MAX_FAN_DEG,
    Math.max(MIN_FAN_DEG, (n - 1) * FAN_STEP_DEG),
  );
  return subs.map((name, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const subAngle = angle - fan / 2 + t * fan;
    const rad = ((subAngle - 90) * Math.PI) / 180;
    return {
      kind: 'sub',
      name,
      base,
      cx: cx + SUB_RADIUS * Math.cos(rad),
      cy: cy + SUB_RADIUS * Math.sin(rad),
    };
  });
}

interface FisheyeTarget {
  key: string;
  cx: number;
  cy: number;
  kind: 'numb' | 'base' | 'sub' | 'card';
  base: BaseEmotion | null;
  name: string;
}

export default function StarburstSelectorScreen({
  selected,
  onToggle,
  onBack,
  onNext,
  max = 5,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const fisheyeRefs = useRef(new Map<string, HTMLElement>());
  // Refs to the per-base dotted stub lines (post-unlock). The lines
  // are mutated directly in applyFisheye to avoid re-rendering on
  // every pan tick.
  const dottedRefs = useRef(new Map<BaseEmotion, SVGLineElement>());
  const rafRef = useRef<number | null>(null);

  const [subEmotionsUnlocked, setSubEmotionsUnlocked] = useState(false);

  // State machine — activeBase is the last base chip snapped to
  // centre. Drives sub visibility, dotted-line collapse, and the
  // breadcrumb. Toggles off when the same chip is snapped a second
  // time (return-journey snap).
  const [activeBase, setActiveBase] = useState<BaseEmotion | null>(null);
  const activeBaseRef = useRef<BaseEmotion | null>(null);
  useEffect(() => {
    activeBaseRef.current = activeBase;
  }, [activeBase]);

  const [centered, setCentered] = useState<CenteredItem>(NUMB_CENTERED);
  const centeredKeyRef = useRef<string>('numb');

  // Sub chips for every base exist on the plane after unlock. The
  // state machine in applyFisheye decides which ones are visible.
  const subChips = useMemo<ChipPos[]>(() => {
    if (!subEmotionsUnlocked) return [];
    const out: ChipPos[] = [];
    for (const b of BASES) out.push(...buildBloom(b));
    return out;
  }, [subEmotionsUnlocked]);

  const fisheyeTargets = useMemo<FisheyeTarget[]>(() => {
    const list: FisheyeTarget[] = [
      { key: 'numb', cx: NUMB_POS.cx, cy: NUMB_POS.cy, kind: 'numb', base: null, name: 'numb' },
    ];
    for (const b of BASES) {
      const p = BASE_POSITIONS[b];
      list.push({ key: b, cx: p.cx, cy: p.cy, kind: 'base', base: b, name: b });
      if (!subEmotionsUnlocked) {
        list.push({
          key: `card-${b}`,
          cx: p.card_cx,
          cy: p.card_cy,
          kind: 'card',
          base: b,
          name: `card-${b}`,
        });
      }
    }
    for (const s of subChips) {
      list.push({ key: s.name, cx: s.cx, cy: s.cy, kind: 'sub', base: s.base, name: s.name });
    }
    return list;
  }, [subChips, subEmotionsUnlocked]);

  // — Mouse-drag pan —————————————————————————————————————————
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
      sx: e.clientX, sy: e.clientY,
      sLeft: vp.scrollLeft, sTop: vp.scrollTop,
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
        // ignore
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

  /** Apply fisheye scale + visibility. Sub visibility is driven by
   *  the activeBase + panPast state machine; coordinate-based
   *  proximity is no longer used (Jul 2 spec). */
  function applyFisheye() {
    const vp = viewportRef.current;
    if (!vp) return;
    const vcx = vp.scrollLeft + vp.clientWidth / 2;
    const vcy = vp.scrollTop + vp.clientHeight / 2;
    const panX = vcx - CENTER_X;
    const panY = vcy - CENTER_Y;

    // Project the current pan offset onto each base's outward radial
    // axis. panPast[b] is true once that projection exceeds the
    // chip's radius — i.e. the user has panned past the chip outward.
    const panPast: Record<string, boolean> = {};
    for (const b of BASES) {
      const p = BASE_POSITIONS[b];
      const panDot = panX * p.ux + panY * p.uy;
      panPast[b] = panDot > BASE_RADIUS;
    }
    const ab = activeBaseRef.current;

    let nearestVisible: FisheyeTarget | null = null;
    let nearestVisibleDist = Infinity;

    fisheyeRefs.current.forEach((el, key) => {
      const target = fisheyeTargets.find((t) => t.key === key);
      if (!target) return;
      const dist = Math.hypot(target.cx - vcx, target.cy - vcy);
      const t = Math.min(1, dist / FISHEYE_RADIUS);
      // Capped, gently-easing scale (Jul 2 spec). Max 1.2× at dead
      // centre; 0.75× at or beyond FISHEYE_RADIUS.
      const scale = Math.min(
        SCALE_CEIL,
        0.75 + 0.45 * (1 - t),
      );
      const fisheyeOpacity = 1 - (1 - OPACITY_FLOOR) * t;

      let opacity = fisheyeOpacity;
      let gated = false;
      if (target.kind === 'sub') {
        // State-machine visibility (Jul 2 spec): exactly the
        // activeBase's subs are visible, and only once the user has
        // panned past that base chip outward.
        const visible = target.base === ab && !!panPast[target.base!];
        opacity = visible ? 1 : 0;
        gated = !visible;
      }

      el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      el.style.pointerEvents = gated ? 'none' : '';

      if (!gated && dist < nearestVisibleDist) {
        nearestVisibleDist = dist;
        nearestVisible = target;
      }
    });

    // Post-unlock dotted stub lines — hidden for the activeBase
    // while expanded (subs visible), visible everywhere else.
    if (subEmotionsUnlocked) {
      dottedRefs.current.forEach((el, b) => {
        const expanded = ab === b && !!panPast[b];
        el.style.opacity = expanded ? '0' : '1';
      });
    }

    if (nearestVisible) {
      const c = nearestVisible as FisheyeTarget;
      if (c.key !== centeredKeyRef.current) {
        centeredKeyRef.current = c.key;
        setCentered({ kind: c.kind, name: c.name, base: c.base });
      }
    }
  }

  useEffect(() => {
    haptics.prime();
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    vp.scrollLeft = CENTER_X - vp.clientWidth / 2;
    vp.scrollTop = CENTER_Y - vp.clientHeight / 2;
  }, []);

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
        for (const p of fisheyeTargets) {
          const d = Math.hypot(p.cx - vcx, p.cy - vcy);
          if (d < nearestDist) {
            nearestDist = d;
            nearestKey = p.key;
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
      let nearest: FisheyeTarget | null = null;
      let nearestDist = Infinity;
      for (const p of fisheyeTargets) {
        const d = Math.hypot(p.cx - vcx, p.cy - vcy);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = p;
        }
      }
      if (!nearest || nearestDist >= SNAP_THRESHOLD_PX) return;
      haptics.snap();
      // Toggle activeBase on a base-chip snap. Same base again →
      // null (return-journey toggle). Different base → switch.
      if (nearest.kind === 'base' && nearest.base) {
        const b = nearest.base;
        setActiveBase((prev) => (prev === b ? null : b));
      }
    }
    // Gap-breathing (Jul 2 2026) — on touchstart the plane shrinks
    // to 0.9× via the --sb-gap-factor CSS var ("inhale"); on
    // touchend it eases back to 1.0× over 200ms. The plane has the
    // matching transition rule in CSS so React doesn't need to
    // re-render anything.
    function onTouchStart() {
      vp?.style.setProperty('--sb-gap-factor', '0.9');
    }
    function onTouchEnd() {
      vp?.style.setProperty('--sb-gap-factor', '1');
    }
    vp.addEventListener('scroll', onScroll, { passive: true });
    vp.addEventListener('scrollend', onScrollEnd);
    vp.addEventListener('touchstart', onTouchStart, { passive: true });
    vp.addEventListener('touchend', onTouchEnd, { passive: true });
    vp.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      vp.removeEventListener('scroll', onScroll);
      vp.removeEventListener('scrollend', onScrollEnd);
      vp.removeEventListener('touchstart', onTouchStart);
      vp.removeEventListener('touchend', onTouchEnd);
      vp.removeEventListener('touchcancel', onTouchEnd);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [fisheyeTargets, subEmotionsUnlocked]);

  // Re-run applyFisheye whenever activeBase changes so subs collapse
  // instantly (no waiting for the next scroll tick).
  useEffect(() => {
    applyFisheye();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBase]);

  // — Chip styling ———————————————————————————————————————————
  function numbStyle(isSelected: boolean): CSSProperties {
    return {
      background: isSelected ? 'var(--n-300)' : 'var(--n-100)',
      borderColor: isSelected ? 'var(--n-700)' : 'var(--n-300)',
      color: 'var(--n-800)',
      width: `${NUMB_CHIP}px`,
      height: `${NUMB_CHIP}px`,
    };
  }
  function paletteChipStyle(
    b: BaseEmotion,
    isSelected: boolean,
    size: number,
  ): CSSProperties {
    const meta = STARBURST_BASES[b];
    const primary = meta.primaryShade;
    return {
      background: isSelected
        ? baseEmotionColor(b, primary)
        : baseEmotionColor(b, 100),
      borderColor: isSelected
        ? baseEmotionColor(b, primary === 500 ? 700 : 600)
        : baseEmotionColor(b, 300),
      color: meta.palette === 'ripe-lemon'
        ? 'var(--n-900)'
        : isSelected
        ? 'var(--n-900)'
        : baseEmotionColor(b, 600),
      width: `${size}px`,
      height: `${size}px`,
    };
  }
  function baseChipStyle(b: BaseEmotion, isSelected: boolean): CSSProperties {
    return paletteChipStyle(b, isSelected, BASE_CHIP);
  }
  function subChipStyle(b: BaseEmotion, isSelected: boolean): CSSProperties {
    return paletteChipStyle(b, isSelected, SUB_CHIP);
  }

  // — Selection handlers ————————————————————————————————————
  function pickBase(b: BaseEmotion) {
    const exists = selected.find((s) => s.name === b);
    if (exists) {
      haptics.softTap();
      onToggle({ name: b, quadrant: BASE_TO_QUADRANT[b], baseEmotion: b });
      return;
    }
    for (const s of selected) {
      if (s.baseEmotion === b && s.name !== b) onToggle(s);
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
    const parentSelected = selected.find((s) => s.name === b);
    if (parentSelected) onToggle(parentSelected);
    if (capReached && !parentSelected) return;
    haptics.tap();
    onToggle({ name, quadrant: BASE_TO_QUADRANT[b], baseEmotion: b });
  }

  function pickNumb() {
    const exists = selected.find((s) => s.name === 'numb');
    if (exists) {
      haptics.softTap();
      onToggle({ name: 'numb', quadrant: 'len', baseEmotion: null });
      return;
    }
    if (capReached) return;
    haptics.tap();
    onToggle({ name: 'numb', quadrant: 'len', baseEmotion: null });
  }

  // Unlock the sub-emotion layer AND immediately mark the tapped
  // card's base as the active one (Bug 1 fix, Jul 2 2026). Without
  // the second setter, sub visibility would wait for a base-chip
  // scrollend snap that may never fire — leaving the user stranded
  // with an unlocked plane but no visible subs.
  function unlockSubEmotions(base: BaseEmotion) {
    haptics.tap();
    setSubEmotionsUnlocked(true);
    setActiveBase(base);
  }

  const left = max - selected.length;

  // — Global SVG layer ——————————————————————————————————————————
  const renderGlobalLines = () => (
    <svg
      className="sb-lines"
      width={PLANE_W}
      height={PLANE_H}
      aria-hidden="true"
    >
      {/* Centre→base spokes — always rendered. */}
      {BASES.map((b) => {
        const p = BASE_POSITIONS[b];
        return (
          <line
            key={`spoke-${b}`}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={p.cx}
            y2={p.cy}
            stroke="currentColor"
            strokeWidth={1.2}
            style={{ color: baseEmotionColor(b, 200) }}
          />
        );
      })}

      {/* Pre-unlock: long dotted line from chip out to the card. */}
      {!subEmotionsUnlocked &&
        BASES.map((b) => {
          const p = BASE_POSITIONS[b];
          const startX = p.cx + p.ux * (BASE_CHIP / 2);
          const startY = p.cy + p.uy * (BASE_CHIP / 2);
          const endX = p.card_cx - p.ux * 40;
          const endY = p.card_cy - p.uy * 40;
          return (
            <line
              key={`stub-${b}`}
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke="currentColor"
              strokeWidth={1.4}
              strokeDasharray="3 5"
              strokeLinecap="round"
              style={{ color: baseEmotionColor(b, 400) }}
            />
          );
        })}

      {/* Post-unlock: short dotted directional cue. Opacity is
          toggled per base in applyFisheye via dottedRefs. */}
      {subEmotionsUnlocked &&
        BASES.map((b) => {
          const p = BASE_POSITIONS[b];
          const startX = p.cx + p.ux * (BASE_CHIP / 2);
          const startY = p.cy + p.uy * (BASE_CHIP / 2);
          const endX = p.cx + p.ux * (BASE_CHIP / 2 + POST_UNLOCK_STUB_LEN);
          const endY = p.cy + p.uy * (BASE_CHIP / 2 + POST_UNLOCK_STUB_LEN);
          return (
            <line
              key={`stub-post-${b}`}
              ref={(el) => {
                if (el) dottedRefs.current.set(b, el);
                else dottedRefs.current.delete(b);
              }}
              x1={startX}
              y1={startY}
              x2={endX}
              y2={endY}
              stroke="currentColor"
              strokeWidth={1.4}
              strokeDasharray="3 5"
              strokeLinecap="round"
              style={{ color: baseEmotionColor(b, 400), transition: 'opacity 150ms ease' }}
            />
          );
        })}

      {/* Base→sub spokes for the activeBase only. The visibility of
          the lines is implicit — when activeBase changes the lines
          re-render; when subs collapse the lines are not drawn. */}
      {subEmotionsUnlocked &&
        activeBase &&
        subChips
          .filter((s) => s.base === activeBase)
          .map((s) => {
            const p = BASE_POSITIONS[activeBase];
            return (
              <line
                key={`sub-spoke-${s.name}`}
                x1={p.cx}
                y1={p.cy}
                x2={s.cx}
                y2={s.cy}
                stroke="currentColor"
                strokeWidth={1.2}
                style={{ color: baseEmotionColor(activeBase, 300) }}
              />
            );
          })}
    </svg>
  );

  // — Chip / card renderers ————————————————————————————————————
  function renderBaseChip(b: BaseEmotion) {
    const meta = STARBURST_BASES[b];
    const pos = BASE_POSITIONS[b];
    const isSel = selectedSet.has(b);
    const disabled = !isSel && capReached;
    return (
      <button
        key={`base:${b}`}
        type="button"
        ref={(el) => {
          if (el) fisheyeRefs.current.set(b, el);
          else fisheyeRefs.current.delete(b);
        }}
        className={
          'eg-chip sb-chip sb-chip--base' +
          (isSel ? ' eg-chip--on' : '') +
          (disabled ? ' eg-chip--disabled' : '')
        }
        style={{ left: pos.cx, top: pos.cy, ...baseChipStyle(b, isSel) }}
        aria-pressed={isSel}
        disabled={disabled}
        onClick={() => pickBase(b)}
      >
        {meta.label}
      </button>
    );
  }

  function renderFlatChip(p: ChipPos) {
    const isSel = selectedSet.has(p.name);
    const label = titleCase(p.name);
    const disabled = !isSel && capReached;
    const style: CSSProperties = p.kind === 'numb'
      ? numbStyle(isSel)
      : subChipStyle(p.base!, isSel);
    return (
      <button
        key={`${p.kind}:${p.name}`}
        type="button"
        ref={(el) => {
          if (el) fisheyeRefs.current.set(p.name, el);
          else fisheyeRefs.current.delete(p.name);
        }}
        className={
          'eg-chip sb-chip sb-chip--' + p.kind +
          (isSel ? ' eg-chip--on' : '') +
          (disabled ? ' eg-chip--disabled' : '')
        }
        style={{ left: p.cx, top: p.cy, ...style }}
        aria-pressed={isSel}
        disabled={disabled}
        onClick={() => {
          if (p.kind === 'numb') pickNumb();
          else pickSub(p.name, p.base!);
        }}
      >
        {label}
      </button>
    );
  }

  function renderCard(b: BaseEmotion) {
    const p = BASE_POSITIONS[b];
    return (
      <div
        key={`card-${b}`}
        className="sb-card"
        ref={(el) => {
          if (el) fisheyeRefs.current.set(`card-${b}`, el);
          else fisheyeRefs.current.delete(`card-${b}`);
        }}
        style={{ left: p.card_cx, top: p.card_cy }}
      >
        <span className="sb-card__hint">Get more specific?</span>
        <button
          type="button"
          className="sb-card__btn"
          onClick={() => unlockSubEmotions(b)}
        >
          Yes, let&rsquo;s get specific
          <CaretRight size={11} weight="bold" />
        </button>
      </div>
    );
  }

  // — Bottom definition card ——————————————————————————————————
  function renderDefCard() {
    const effectiveKind = centered.kind === 'card' ? 'base' : centered.kind;
    const word = effectiveKind === 'base' && centered.base ? centered.base : centered.name;
    const definition = word === 'numb'
      ? getEmotionDefinition('numb')
      : effectiveKind === 'base' && centered.base
      ? STARBURST_BASES[centered.base].definition
      : getEmotionDefinition(word);
    const display = effectiveKind === 'base' && centered.base
      ? STARBURST_BASES[centered.base].label
      : titleCase(word);

    let pillStyle: CSSProperties = { background: 'var(--n-200)' };
    if (centered.base) {
      pillStyle = { background: baseEmotionColor(centered.base, 200) };
    }

    const showSubSelectBtn = effectiveKind === 'sub';
    const isSubSelected = selectedSet.has(word);
    const subDisabled = !isSubSelected && capReached;

    return (
      <div className="eg-def sb-def" aria-live="polite">
        <span className="eg-def__word" style={pillStyle}>
          &ldquo;{display}&rdquo;
        </span>
        <p className="eg-def__body">{definition}</p>
        {showSubSelectBtn && centered.base && (
          <button
            type="button"
            className="btn-primary sb-def__select"
            onClick={() => pickSub(word, centered.base!)}
            disabled={subDisabled}
          >
            {isSubSelected ? 'Selected' : `Select ${display}`}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="screen" id="starburst">
      <header className="eg-header">
        <BackButton onClick={onBack} />
        <div className="eg-counter" aria-live="polite">
          <strong>{selected.length}</strong>
          <span>selected · {left} left</span>
        </div>
        <span className="eg-spacer" aria-hidden="true" />
      </header>

      {activeBase && (
        <div className="sb-breadcrumb" aria-live="polite">
          <ArrowLeft size={14} weight="bold" />
          {STARBURST_BASES[activeBase].label}
          <span aria-hidden="true"> →</span>
        </div>
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
          {renderGlobalLines()}

          {renderFlatChip(NUMB_POS)}

          {BASES.map((b) => renderBaseChip(b))}

          {!subEmotionsUnlocked && BASES.map((b) => renderCard(b))}

          {subChips.map((s) => renderFlatChip(s))}
        </div>
      </div>

      <footer className="eg-footer sb-footer">
        {renderDefCard()}

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
