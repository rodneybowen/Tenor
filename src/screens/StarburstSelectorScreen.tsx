// StarburstSelectorScreen — Emotion Selector v2 (variant: 'starburst')
// =====================================================================
// Sketched starburst plane:
//   - "Numb" chip at the centre (0,0). Larger than the base chips, tap
//      to select.
//   - 6 base emotion chips at 60° increments, radius 220px from centre.
//      Tap to select.
//   - Each non-bloomed base owns a cluster: chip + a dotted line
//      extending ~100px outward + "Get more specific?" text + "Yes,
//      let's get specific" pill. The whole cluster is a single fisheye
//      transform target — chip, line, and affordance scale and move
//      together as the user pans (per Fix 2, Jun 29 2026).
//   - Tapping "Yes, let's get specific" blooms that base — sub-emotions
//      appear around its coordinates at radius 180px, fanned outward at
//      equal angles. Only one base expanded at a time.
//
// Shared with EmotionGridScreen — viewport pan, scroll-pad, the rAF
// fisheye transform loop, snap haptics, click-vs-drag suppression, chip
// aesthetics, and footer "next" CTA.
//
// CRITICAL RULE: when emotion_ui === 'starburst' the strings HEP / HEN
// / LEP / LEN must never appear in the UI. None of this screen renders
// those — base + sub chips display lowercase emotion names, title-cased
// at render.

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
// Chip sizes are intrinsic; the fisheye scale grows the centred chip
// to ~60% of viewport width per spec (Fix 1, Jun 29 2026). Base chips
// sit at BASE_RADIUS, sub chips at SUB_RADIUS from their PARENT (NOT
// from centre, per spec).
const NUMB_CHIP = 138; // larger than base chips
const BASE_CHIP = 116;
const SUB_CHIP = 96;
const BASE_RADIUS = 220;
const SUB_RADIUS = 180;

// Affordance — dotted line + badge — lives inside each base cluster.
// Offsets are relative to the chip centre in pre-scale coordinates.
// STUB_LEN trimmed to 80 so when the chip is fisheye-magnified at
// viewport centre, the badge still fits inside the screen mask.
const STUB_LEN = 80;
const STUB_START = BASE_CHIP / 2 + 2;
const STUB_END = STUB_START + STUB_LEN;
const BADGE_OFFSET = STUB_END + 12;

// Sub-emotion bloom fan. Smaller fans for short sub lists keep them
// tight under the parent; longer lists (Sadness = 22) open up to a
// half-circle so chips don't all collapse onto each other.
const MIN_FAN_DEG = 70;
const MAX_FAN_DEG = 180;

// Scroll-pad so the outermost chip can be panned to viewport centre.
const PLANE_HALF = BASE_RADIUS + SUB_RADIUS + 600;
const PLANE_W = PLANE_HALF * 2;
const PLANE_H = PLANE_HALF * 2;
const CENTER_X = PLANE_HALF;
const CENTER_Y = PLANE_HALF;

// — Fisheye tuning ———————————————————————————————————————————
// Same linear-interpolation formula as EmotionGridScreen. SCALE_CEIL
// raised so the centred base chip fills ~55–65% of a typical 375–400px
// viewport per Fix 1 spec (Jun 29 2026): 116px chip * 1.75 ≈ 203px on
// a 375px viewport (54%); 138px numb chip * 1.75 ≈ 241px (64%).
// FISHEYE_RADIUS and SCALE_FLOOR match classic for the same off-centre
// roll-off feel.
const FISHEYE_RADIUS = 240;
const SCALE_CEIL = 1.75;
const SCALE_FLOOR = 0.6;
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

/** Bloom sub-emotions around a base — radius SUB_RADIUS from the
 *  parent, fanned at equal angles centred on the outward radial. */
function buildBloom(base: BaseEmotion): ChipPos[] {
  const subs = STARBURST_SUB_EMOTIONS[base];
  const { cx, cy, angle } = BASE_POSITIONS[base];
  const n = subs.length;
  if (n === 0) return [];
  const fan = Math.min(MAX_FAN_DEG, Math.max(MIN_FAN_DEG, (n - 1) * 16));
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
  // transform. Keyed by 'numb' / base name / sub name. For numb +
  // subs the element is the chip button; for bases the element is
  // the cluster wrapper (chip + affordance scale together).
  const fisheyeRefs = useRef(new Map<string, HTMLElement>());
  const rafRef = useRef<number | null>(null);

  const [bloomedBase, setBloomedBase] = useState<BaseEmotion | null>(null);

  const subChips = useMemo<ChipPos[]>(
    () => (bloomedBase ? buildBloom(bloomedBase) : []),
    [bloomedBase],
  );

  // All fisheye-managed positions, including cluster wrappers (base
  // chips) so the centre-finding code knows about them.
  const fisheyeTargets = useMemo(() => {
    const list: { key: string; cx: number; cy: number }[] = [
      { key: 'numb', cx: NUMB_POS.cx, cy: NUMB_POS.cy },
    ];
    for (const b of BASES) {
      list.push({ key: b, cx: BASE_POSITIONS[b].cx, cy: BASE_POSITIONS[b].cy });
    }
    for (const s of subChips) {
      list.push({ key: s.name, cx: s.cx, cy: s.cy });
    }
    return list;
  }, [subChips]);

  // — Mouse-drag pan (touch uses native overflow scrolling). Copied
  //   from EmotionGridScreen.
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

  // Apply fisheye scale/opacity to every registered target each rAF.
  function applyFisheye() {
    const vp = viewportRef.current;
    if (!vp) return;
    const vcx = vp.scrollLeft + vp.clientWidth / 2;
    const vcy = vp.scrollTop + vp.clientHeight / 2;
    fisheyeRefs.current.forEach((el, key) => {
      const target = fisheyeTargets.find((t) => t.key === key);
      if (!target) return;
      const dist = Math.hypot(target.cx - vcx, target.cy - vcy);
      const t = Math.min(1, dist / FISHEYE_RADIUS);
      const scale = SCALE_CEIL - (SCALE_CEIL - SCALE_FLOOR) * t;
      const opacity = 1 - (1 - OPACITY_FLOOR) * t;
      el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      el.style.opacity = opacity.toFixed(3);
    });
  }

  useEffect(() => {
    haptics.prime();
  }, []);

  // Centre on "numb" on mount, and re-centre on the bloomed base when
  // the user drills in.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const target = bloomedBase
      ? BASE_POSITIONS[bloomedBase]
      : { cx: CENTER_X, cy: CENTER_Y };
    vp.scrollLeft = target.cx - vp.clientWidth / 2;
    vp.scrollTop = target.cy - vp.clientHeight / 2;
  }, [bloomedBase]);

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
  function numbStyle(isSelected: boolean): CSSProperties {
    return {
      background: 'var(--n-200)',
      borderColor: isSelected ? 'var(--n-700)' : 'transparent',
      color: 'var(--n-800)',
      width: `${NUMB_CHIP}px`,
      height: `${NUMB_CHIP}px`,
    };
  }
  function baseChipStyle(b: BaseEmotion, isSelected: boolean): CSSProperties {
    const meta = STARBURST_BASES[b];
    return {
      background: baseEmotionColor(b),
      borderColor: isSelected
        ? baseEmotionColor(b, meta.primaryShade === 500 ? 700 : 600)
        : 'transparent',
      // Ripe Lemon needs neutral-900 text for legibility.
      color: meta.palette === 'ripe-lemon' ? 'var(--n-900)' : 'var(--n-800)',
      width: `${BASE_CHIP}px`,
      height: `${BASE_CHIP}px`,
    };
  }
  function subChipStyle(b: BaseEmotion, isSelected: boolean): CSSProperties {
    const meta = STARBURST_BASES[b];
    return {
      background: baseEmotionColor(b, 100),
      borderColor: isSelected
        ? baseEmotionColor(b, 700)
        : baseEmotionColor(b, 400),
      color: meta.palette === 'ripe-lemon'
        ? 'var(--n-900)'
        : baseEmotionColor(b, 700),
      width: `${SUB_CHIP}px`,
      height: `${SUB_CHIP}px`,
      fontSize: '14px',
    };
  }

  // — Selection handlers. Base picks replace any sub of the same base
  //   (and vice versa) so the user can't have both "joy" and "excited".
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

  function expandBase(b: BaseEmotion) {
    haptics.tap();
    setBloomedBase(b);
  }

  const left = max - selected.length;

  // Global SVG layer — only renders the long-haul spokes (centre→base,
  // and base→sub when bloomed). The per-base dotted stub now lives
  // inside each cluster wrapper so it scales with the chip (Fix 2).
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
      {bloomedBase &&
        subChips.map((s) => {
          const p = BASE_POSITIONS[bloomedBase];
          return (
            <line
              key={`sub-spoke-${s.name}`}
              x1={p.cx}
              y1={p.cy}
              x2={s.cx}
              y2={s.cy}
              stroke="currentColor"
              strokeWidth={1.2}
              style={{ color: baseEmotionColor(bloomedBase, 300) }}
            />
          );
        })}
    </svg>
  );

  // — Per-base cluster ————————————————————————————————————————
  // Wrapper at the base's plane coord. Fisheye scales the wrapper, so
  // the chip + dotted stub + badge all grow and shrink together as the
  // user pans (per Fix 2). The chip stays the click target for
  // selection; the affordance is hidden once that base is bloomed.
  function renderBaseCluster(b: BaseEmotion) {
    const meta = STARBURST_BASES[b];
    const pos = BASE_POSITIONS[b];
    const isSel = selectedSet.has(b);
    const disabled = !isSel && capReached;
    const isBloomed = bloomedBase === b;
    // Anchors for the dotted stub + badge, in the cluster's local
    // coordinate space (chip centre = (0, 0)).
    const stubX1 = pos.ux * STUB_START;
    const stubY1 = pos.uy * STUB_START;
    const stubX2 = pos.ux * STUB_END;
    const stubY2 = pos.uy * STUB_END;
    const badgeX = pos.ux * BADGE_OFFSET;
    const badgeY = pos.uy * BADGE_OFFSET;
    // The SVG canvas inside the cluster spans ±SVG_R around the chip
    // centre so the dotted stub fits regardless of outward direction.
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

        {!isBloomed && (
          <>
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
            <div
              className="sb-cluster__badge"
              style={{ left: badgeX, top: badgeY }}
            >
              <span className="sb-cluster__hint">Get more specific?</span>
              <button
                type="button"
                className="sb-cluster__btn"
                onClick={() => expandBase(b)}
                style={{
                  background: baseEmotionColor(b, 100),
                  color: baseEmotionColor(b, 700),
                  borderColor: baseEmotionColor(b, 300),
                }}
              >
                Yes, let&rsquo;s get specific
                <CaretRight size={11} weight="bold" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // — Numb + sub chips ————————————————————————————————————————
  // Rendered as flat buttons (no cluster wrapper); fisheye scales the
  // button directly.
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
          aria-label="Back to base emotions"
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
          {renderGlobalLines()}

          {renderFlatChip(NUMB_POS)}

          {BASES.map((b) => renderBaseCluster(b))}

          {subChips.map((s) => renderFlatChip(s))}
        </div>
      </div>

      <footer className="eg-footer sb-footer">
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
