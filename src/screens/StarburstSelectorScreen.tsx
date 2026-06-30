// StarburstSelectorScreen — Emotion Selector v2 (variant: 'starburst')
// =====================================================================
// The sketched starburst plane:
//   - "Numb" chip at the centre (0,0). Larger than the base chips,
//     tap to select.
//   - 6 base emotion chips at 60° increments around the centre.
//   - Before the first unlock: each base owns a CLUSTER (chip + dotted
//     stub line + a plain-white "Get more specific?" card with a black
//     pill button). The whole cluster is a single fisheye transform
//     target — the card is on the plane and only reads as "fully
//     visible" when its chip is snapped to centre.
//   - Tapping "Yes, let's get specific" on ANY base is a one-time
//     GLOBAL unlock. After that:
//       * All "Get more specific?" cards disappear everywhere.
//       * Each base keeps a dotted-line directional indicator pointing
//         outward, suggesting that sub-emotions live further out.
//       * Sub-emotion chips for the 6 bases exist on the plane, but
//         only one base's are rendered at any moment — the base whose
//         coordinates are nearest the viewport centre (within
//         PROXIMITY_RADIUS). This avoids visual fight between
//         neighbouring bases' fans.
//   - A bottom-pinned definition card mirrors the classic selector —
//     it always shows the centred chip's name + definition. Sub chips
//     get an explicit "Select" CTA.
//
// CRITICAL RULE: when emotion_ui === 'starburst' the strings HEP / HEN
// / LEP / LEN must never surface in the UI. None of this screen
// renders those — base + sub chips display lowercase emotion names,
// Title-cased at render time.

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
// Chip intrinsic sizes. Sub chips are clearly smaller than base
// (Fix 4 — base ≈ 52px radius, sub ≈ 36px radius). The fisheye scale
// grows the centred chip to ~55–65% of a typical 375px viewport.
const NUMB_CHIP = 138;
const BASE_CHIP = 116;
const SUB_CHIP = 72;
const BASE_RADIUS = 220;
// SUB_RADIUS bumped to 300 — well over the 240px floor in Fix 4 —
// so subs don't touch at max fisheye scale and they don't crowd the
// adjacent base chips when the user pans outward.
const SUB_RADIUS = 300;
// Fan step per chip pair. With SUB_RADIUS=300, SCALE_CEIL=1.75 and
// SUB_CHIP=72, a 30° step yields ~157px arc separation vs 126px
// chip diameter at max scale → ~31px gap. Caps keep dense (5+) and
// sparse (3-4) bases visually balanced.
const FAN_STEP_DEG = 30;
const MIN_FAN_DEG = 60;
const MAX_FAN_DEG = 130;

// Per-base affordance — dotted line + plain-white card with the
// "Yes, let's get specific" pill. Lives inside each cluster wrapper
// in the cluster's local coordinate space. After the global unlock
// the card vanishes but the dotted stub stays as a directional
// indicator (per Bug 5). STUB_LEN trimmed so the card stays inside
// the viewport mask at max fisheye scale (Fix 3, Jul 1 2026).
const STUB_LEN = 60;
const STUB_START = BASE_CHIP / 2 + 2;
const STUB_END = STUB_START + STUB_LEN;
const BADGE_OFFSET = STUB_END + 14;

// Per-sub proximity gate. After unlock, every sub chip exists in the
// DOM but each one's opacity is forced to 0 + pointer-events: none
// until the viewport centre is within PROXIMITY_RADIUS of its own
// coordinates (Fix 5, Jul 1 2026). Combined with a wide SUB_RADIUS
// this naturally restricts visibility to one base's fan at a time.
const PROXIMITY_RADIUS = 280;

// Scroll-pad so the outermost chip can be panned to viewport centre.
const PLANE_HALF = BASE_RADIUS + SUB_RADIUS + 600;
const PLANE_W = PLANE_HALF * 2;
const PLANE_H = PLANE_HALF * 2;
const CENTER_X = PLANE_HALF;
const CENTER_Y = PLANE_HALF;

// — Fisheye tuning ————————————————————————————————————————————
// Same linear-interpolation formula as EmotionGridScreen. SCALE_CEIL
// raised so the centred chip fills ~55–65% of a typical 375–400px
// viewport. FISHEYE_RADIUS and SCALE_FLOOR match classic for the
// same off-centre roll-off feel.
const FISHEYE_RADIUS = 240;
const SCALE_CEIL = 1.75;
const SCALE_FLOOR = 0.55;
const OPACITY_FLOOR = 0.42;

function titleCase(s: string): string {
  return s.replace(/(^|[\s-])(\w)/g, (_, p, c) => p + c.toUpperCase());
}

interface ChipPos {
  kind: 'numb' | 'sub';
  /** Lowercase emotion identifier — what gets logged as emotion_name. */
  name: string;
  /** Starburst base this chip belongs to. NULL only for 'numb'. */
  base: BaseEmotion | null;
  cx: number;
  cy: number;
}

interface CenteredChip {
  kind: 'numb' | 'base' | 'sub';
  name: string;
  base: BaseEmotion | null;
}

/** Polar → Cartesian on the plane, 0° = north (top). */
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
  /** Outward unit vector (from centre, normalized). */
  ux: number;
  uy: number;
  angle: number;
}

const BASE_POSITIONS: Record<BaseEmotion, BasePos> = (() => {
  const out = {} as Record<BaseEmotion, BasePos>;
  for (const b of BASES) {
    const angle = STARBURST_BASES[b].angle;
    const { x, y } = polarXY(angle, BASE_RADIUS);
    const dx = x - CENTER_X;
    const dy = y - CENTER_Y;
    const len = Math.hypot(dx, dy) || 1;
    out[b] = { base: b, cx: x, cy: y, ux: dx / len, uy: dy / len, angle };
  }
  return out;
})();

const NUMB_POS: ChipPos = {
  kind: 'numb', name: 'numb', base: null, cx: CENTER_X, cy: CENTER_Y,
};

const NUMB_CENTERED: CenteredChip = { kind: 'numb', name: 'numb', base: null };

/** Bloom sub-emotion chip positions around a given base — radius
 *  SUB_RADIUS from the parent, fanned at equal angles centred on the
 *  outward radial. */
function buildBloom(base: BaseEmotion): ChipPos[] {
  const subs = STARBURST_SUB_EMOTIONS[base];
  const { cx, cy, angle } = BASE_POSITIONS[base];
  const n = subs.length;
  if (n === 0) return [];
  // Fan = (n-1) chip-pair steps, each FAN_STEP_DEG wide, clamped to
  // the visible-bounds. Validated to keep chip edges from touching
  // at max fisheye scale.
  const fan = Math.min(MAX_FAN_DEG, Math.max(MIN_FAN_DEG, (n - 1) * FAN_STEP_DEG));
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

export default function StarburstSelectorScreen({
  selected,
  onToggle,
  onBack,
  onNext,
  max = 5,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // fisheyeRefs holds every element that needs the scale/opacity
  // transform. Key: 'numb', a base name, or a sub name. The element
  // is a chip button for numb + subs, and the cluster wrapper for
  // bases (so the chip + affordance scale together).
  const fisheyeRefs = useRef(new Map<string, HTMLElement>());
  const rafRef = useRef<number | null>(null);

  // One-time global unlock. Once true, "Get more specific?" cards
  // are hidden everywhere and sub-emotions become reachable on the
  // plane. Does not persist to the DB — pre-unlock state is implicit
  // when the user re-enters the selector (per spec).
  const [subEmotionsUnlocked, setSubEmotionsUnlocked] = useState(false);

  // Which base's sub-emotions to render right now (only one set on
  // screen at a time, per Bug 5).
  const [proximityBase, setProximityBase] = useState<BaseEmotion | null>(null);
  const proximityBaseRef = useRef<BaseEmotion | null>(null);

  // Centred chip — drives the bottom definition card.
  const [centered, setCentered] = useState<CenteredChip>(NUMB_CENTERED);
  const centeredKeyRef = useRef<string>('numb');

  // After the global unlock, ALL bases' sub-emotions exist on the
  // plane simultaneously (Fix 5). Per-sub opacity gating in
  // applyFisheye handles "only one fan visible at a time" so this
  // memo no longer cares about proximityBase.
  const subChips = useMemo<ChipPos[]>(() => {
    if (!subEmotionsUnlocked) return [];
    const out: ChipPos[] = [];
    for (const b of BASES) out.push(...buildBloom(b));
    return out;
  }, [subEmotionsUnlocked]);

  /** Every fisheye-managed target's position. Used by applyFisheye
   *  to look up where each registered ref lives on the plane, by the
   *  scroll listener to find the nearest target, and by the
   *  breadcrumb / def-card tracking. */
  const fisheyeTargets = useMemo(() => {
    const list: { key: string; cx: number; cy: number; kind: 'numb' | 'base' | 'sub'; base: BaseEmotion | null; name: string }[] = [
      { key: 'numb', cx: NUMB_POS.cx, cy: NUMB_POS.cy, kind: 'numb', base: null, name: 'numb' },
    ];
    for (const b of BASES) {
      list.push({
        key: b,
        cx: BASE_POSITIONS[b].cx,
        cy: BASE_POSITIONS[b].cy,
        kind: 'base',
        base: b,
        name: b,
      });
    }
    for (const s of subChips) {
      list.push({ key: s.name, cx: s.cx, cy: s.cy, kind: 'sub', base: s.base, name: s.name });
    }
    return list;
  }, [subChips]);

  // — Mouse-drag pan (touch uses native overflow scrolling). Copied
  //   verbatim from EmotionGridScreen so the gesture feels identical.
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

  /** Apply fisheye scale/opacity to every registered target. Also
   *  finds the nearest base for proximity-based sub rendering and
   *  the nearest chip for the bottom def card. */
  function applyFisheye() {
    const vp = viewportRef.current;
    if (!vp) return;
    const vcx = vp.scrollLeft + vp.clientWidth / 2;
    const vcy = vp.scrollTop + vp.clientHeight / 2;

    let nearestChip: typeof fisheyeTargets[number] | null = null;
    let nearestChipDist = Infinity;
    let nearestBase: BaseEmotion | null = null;
    let nearestBaseDist = Infinity;

    fisheyeRefs.current.forEach((el, key) => {
      const target = fisheyeTargets.find((t) => t.key === key);
      if (!target) return;
      const dist = Math.hypot(target.cx - vcx, target.cy - vcy);
      const t = Math.min(1, dist / FISHEYE_RADIUS);
      const scale = SCALE_CEIL - (SCALE_CEIL - SCALE_FLOOR) * t;
      const fisheyeOpacity = 1 - (1 - OPACITY_FLOOR) * t;

      // Per-sub proximity gate (Fix 5). Sub chips fade fully out
      // when the user's pan position is beyond PROXIMITY_RADIUS,
      // and ease in over the final ~80px so the transition reads
      // as natural fisheye + reveal rather than a hard switch.
      let opacity = fisheyeOpacity;
      let gated = false;
      if (target.kind === 'sub') {
        if (dist >= PROXIMITY_RADIUS) {
          opacity = 0;
          gated = true;
        } else {
          const easeBand = 80;
          const proxT = Math.max(
            0,
            Math.min(1, (PROXIMITY_RADIUS - dist) / easeBand),
          );
          opacity = fisheyeOpacity * proxT;
          if (proxT < 0.05) gated = true;
        }
      }

      el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
      el.style.pointerEvents = gated ? 'none' : '';

      // Only consider visible chips for "centred" tracking. Gated
      // (invisible) subs would otherwise steal focus from the
      // numb / base they're nominally closer to.
      if (!gated && dist < nearestChipDist) {
        nearestChipDist = dist;
        nearestChip = target;
      }
    });

    for (const b of BASES) {
      const p = BASE_POSITIONS[b];
      const d = Math.hypot(p.cx - vcx, p.cy - vcy);
      if (d < nearestBaseDist) {
        nearestBaseDist = d;
        nearestBase = b;
      }
    }

    // Proximity update — only emit when we cross the radius threshold
    // so we don't thrash React state on every rAF tick.
    const proxNow = nearestBaseDist <= PROXIMITY_RADIUS ? nearestBase : null;
    if (proxNow !== proximityBaseRef.current) {
      proximityBaseRef.current = proxNow;
      setProximityBase(proxNow);
    }

    // Centred-chip update for the bottom def card.
    if (nearestChip && (nearestChip as typeof fisheyeTargets[number]).key !== centeredKeyRef.current) {
      const c = nearestChip as typeof fisheyeTargets[number];
      centeredKeyRef.current = c.key;
      setCentered({ kind: c.kind, name: c.name, base: c.base });
    }
  }

  useEffect(() => {
    haptics.prime();
  }, []);

  // Centre on "numb" on mount.
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
      let nearest = Infinity;
      for (const p of fisheyeTargets) {
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
  }, [fisheyeTargets]);

  // — Chip styling ———————————————————————————————————————————
  // Bug 2: default state is the pastel palette-100 fill; the saturated
  // primary only appears once the chip is selected. Borders use the
  // primary shade so an unselected chip is still visually anchored.
  // Fix 2 — pastel at rest, saturated on select. Base + sub chips
  // share the same fill/border/text shape; sub chips only differ in
  // size. Border is palette-300 at rest (subtle anchor) and the
  // primary darker shade on select. Ripe Lemon is so bright we use
  // neutral-900 text on its selected fill for contrast.
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
    return { ...paletteChipStyle(b, isSelected, SUB_CHIP), fontSize: '13px' };
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

  function unlockSubEmotions() {
    haptics.tap();
    setSubEmotionsUnlocked(true);
  }

  const left = max - selected.length;

  // — Global SVG layer ——————————————————————————————————————————
  // Centre→base spokes (always solid). After unlock we also draw
  // base→sub spokes for the rendered (proximity) base only.
  const renderGlobalLines = () => (
    <svg
      className="sb-lines"
      width={PLANE_W}
      height={PLANE_H}
      aria-hidden="true"
    >
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
      {subEmotionsUnlocked &&
        proximityBase &&
        subChips.map((s) => {
          const p = BASE_POSITIONS[proximityBase];
          return (
            <line
              key={`sub-spoke-${s.name}`}
              x1={p.cx}
              y1={p.cy}
              x2={s.cx}
              y2={s.cy}
              stroke="currentColor"
              strokeWidth={1.2}
              style={{ color: baseEmotionColor(proximityBase, 300) }}
            />
          );
        })}
    </svg>
  );

  // — Per-base cluster ——————————————————————————————————————————
  // Wrapper at the base's plane coord. Fisheye scales the wrapper,
  // so the chip + (locked: dotted stub + white card / unlocked:
  // dotted directional stub) all scale together as the user pans.
  function renderBaseCluster(b: BaseEmotion) {
    const meta = STARBURST_BASES[b];
    const pos = BASE_POSITIONS[b];
    const isSel = selectedSet.has(b);
    const disabled = !isSel && capReached;
    // Anchor points for the stub + badge in the cluster's local
    // coordinate space (chip centre = (0, 0)).
    const stubX1 = pos.ux * STUB_START;
    const stubY1 = pos.uy * STUB_START;
    const stubX2 = pos.ux * STUB_END;
    const stubY2 = pos.uy * STUB_END;
    const badgeX = pos.ux * BADGE_OFFSET;
    const badgeY = pos.uy * BADGE_OFFSET;
    const SVG_R = STUB_END + 4;

    return (
      <div
        key={`cluster-${b}`}
        className="sb-cluster"
        ref={(el) => {
          if (el) fisheyeRefs.current.set(b, el);
          else fisheyeRefs.current.delete(b);
        }}
        style={{ left: pos.cx, top: pos.cy }}
      >
        <button
          type="button"
          className={
            'eg-chip sb-chip sb-chip--base' +
            (isSel ? ' eg-chip--on' : '') +
            (disabled ? ' eg-chip--disabled' : '')
          }
          style={baseChipStyle(b, isSel)}
          aria-pressed={isSel}
          disabled={disabled}
          onClick={() => pickBase(b)}
        >
          {meta.label}
        </button>

        {/* Dotted stub. Always present — pre-unlock it leads to the
            white card; post-unlock it stays as a directional cue
            pointing toward the sub-emotion fan that lives further
            out. */}
        <svg
          className="sb-cluster__stub"
          width={SVG_R * 2}
          height={SVG_R * 2}
          style={{ left: -SVG_R, top: -SVG_R }}
          aria-hidden="true"
        >
          <line
            x1={SVG_R + stubX1}
            y1={SVG_R + stubY1}
            x2={SVG_R + stubX2}
            y2={SVG_R + stubY2}
            stroke="currentColor"
            strokeWidth={1.2}
            strokeDasharray="3 5"
            strokeLinecap="round"
            style={{ color: baseEmotionColor(b, 400) }}
          />
        </svg>

        {/* "Get more specific?" card — plain white, dark text, black
            pill. Hidden globally once subEmotionsUnlocked flips true
            (Bug 5). Per Bug 3 it lives on the plane so the fisheye
            naturally renders it "fully visible" only when the chip is
            snapped to centre. */}
        {!subEmotionsUnlocked && (
          <div
            className="sb-cluster__card"
            style={{ left: badgeX, top: badgeY }}
          >
            <span className="sb-cluster__hint">Get more specific?</span>
            <button
              type="button"
              className="sb-cluster__btn"
              onClick={unlockSubEmotions}
            >
              Yes, let&rsquo;s get specific
              <CaretRight size={11} weight="bold" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // — Numb + sub chips ————————————————————————————————————————
  // Rendered as flat buttons (no cluster wrapper). Fisheye scales
  // the button directly.
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
        style={{
          left: p.cx,
          top: p.cy,
          ...style,
        }}
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

  // — Bottom definition card ——————————————————————————————————
  // Mirrors the classic EmotionGridScreen's def card. The pill-shaped
  // word label uses the centred chip's palette as a soft tint so the
  // colour cue is consistent with the chip itself. Sub chips get an
  // explicit "Select" CTA so the user has a tap target in the card
  // (the chip is already on the plane but this is the affordance the
  // classic flow established).
  function renderDefCard() {
    const word = centered.name;
    const definition = word === 'numb'
      ? getEmotionDefinition('numb')
      : centered.kind === 'base'
      ? STARBURST_BASES[centered.base!].definition
      : getEmotionDefinition(word);
    const display = centered.kind === 'base'
      ? STARBURST_BASES[centered.base!].label
      : titleCase(word);

    let pillStyle: CSSProperties = { background: 'var(--n-200)' };
    if (centered.base) {
      pillStyle = { background: baseEmotionColor(centered.base, 200) };
    }

    const showSubSelectBtn = centered.kind === 'sub';
    const isSubSelected = selectedSet.has(word);
    const subDisabled = !isSubSelected && capReached;

    return (
      <div className="eg-def sb-def" aria-live="polite">
        <span className="eg-def__word" style={pillStyle}>
          &ldquo;{display}&rdquo;
        </span>
        <p className="eg-def__body">{definition}</p>
        {showSubSelectBtn && (
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

      {subEmotionsUnlocked && proximityBase && (
        <div
          className="sb-breadcrumb"
          aria-live="polite"
        >
          <ArrowLeft size={14} weight="bold" />
          {STARBURST_BASES[proximityBase].label}
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

          {BASES.map((b) => renderBaseCluster(b))}

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
