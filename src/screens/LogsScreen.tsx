import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import {
  TODAY,
  TODAY_KEY,
  dateFromKey,
  isFuturePeriod,
  logsForDay,
  logsInPeriod,
  periodDayKeys,
  periodLabel,
  periodStart,
  quadrantCountsInPeriod,
  quadrantsForDay,
  shiftPeriod,
  type LogEntry,
  type LogView,
} from '../data/mockLogs';
import {
  dotBackground,
  quadrantBlendBackground,
  quadrantColor,
  shadeQuadrant,
  type Quadrant,
} from '../theme/emotions';
import DayLogList from '../components/DayLogList';

interface Props {
  logs: LogEntry[];
  onOpenLog: (id: string) => void;
}

const VIEWS: { id: LogView; label: string }[] = [
  { id: 'D', label: 'D' },
  { id: 'W', label: 'W' },
  { id: 'M', label: 'M' },
  { id: 'Y', label: 'Y' },
];

const QUAD_ORDER: Quadrant[] = ['hep', 'lep', 'hen', 'len'];
const WEEK_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Deterministic seeded PRNG so randomized bubble positions are stable per
// (view, anchor) — same week always gets the same layout; switching views
// reshuffles. Tiny inline helpers to avoid a separate utility module.
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ────────────────────────────────────────────────────────────────────
// Top-level screen
// ────────────────────────────────────────────────────────────────────

export default function LogsScreen({ logs, onOpenLog }: Props) {
  const [view, setView] = useState<LogView>('W');
  // Anchor = first date of the current period. Defaults to the week
  // containing TODAY so a freshly-opened Logs tab feels current.
  const [anchor, setAnchor] = useState<Date>(() => periodStart('W', TODAY));

  function changeView(next: LogView) {
    setView(next);
    // Tapping a tab always lands on the period that contains TODAY,
    // regardless of where the user was browsing. Drill-down from a
    // Week-bar / Month-cell still routes to a specific target via
    // drillTo() — the tab tap is the "go home" gesture.
    setAnchor(periodStart(next, TODAY));
  }
  function go(dir: -1 | 1) {
    const candidate = shiftPeriod(view, anchor, dir);
    // Don't let forward navigation cross into future periods.
    if (dir === 1 && isFuturePeriod(view, candidate)) return;
    setAnchor(candidate);
  }
  function drillTo(nextView: LogView, target: Date) {
    setView(nextView);
    setAnchor(periodStart(nextView, target));
  }

  const periodLogs = useMemo(
    () => logsInPeriod(view, anchor, logs),
    [view, anchor],
  );
  const forwardDisabled = isFuturePeriod(view, shiftPeriod(view, anchor, 1));

  // Swipe state. The chart strip translates with the finger; on
  // release we either snap to an adjacent period (commit + reset) or
  // bounce back to centre. Only D and W get this — M / Y stick to the
  // chevrons because their visualisations aren't a continuous strip.
  const stripRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [snapping, setSnapping] = useState(false);

  const isStripView = view === 'D' || view === 'W';

  function commit(dir: -1 | 1) {
    // Animate the strip the rest of the way to the snap position, then
    // update the anchor and reset transform without a transition. The
    // 220ms matches the .mood-strip--snap CSS transition.
    const width = stripRef.current?.offsetWidth ?? window.innerWidth;
    setSnapping(true);
    setDragX(dir === 1 ? -width : width);
    window.setTimeout(() => {
      setSnapping(false);
      go(dir);
      setDragX(0);
    }, 220);
  }

  function onSwipePointerDown(e: React.PointerEvent) {
    if (!isStripView) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    swipe.current = { x: e.clientX, y: e.clientY, locked: false };
    setSnapping(false);
  }
  function onSwipePointerMove(e: React.PointerEvent) {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.locked) {
      // Wait until the gesture is clearly horizontal before locking —
      // otherwise vertical scrolls would tug the chart sideways.
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        swipe.current = null;
        return;
      }
      s.locked = true;
    }
    // Future periods are off-limits — give a small rubber-band tug
    // forward so the gesture still feels alive but caps quickly.
    const futureBlocked = isFuturePeriod(view, shiftPeriod(view, anchor, 1));
    let clamped = dx;
    if (futureBlocked && clamped < 0) clamped = Math.max(clamped * 0.3, -window.innerWidth * 0.12);
    setDragX(clamped);
  }
  function onSwipePointerUp() {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !s.locked) return;
    const width = stripRef.current?.offsetWidth ?? window.innerWidth;
    const threshold = width * 0.4;
    if (Math.abs(dragX) >= threshold) {
      const dir: -1 | 1 = dragX > 0 ? -1 : 1;
      // Forward into the future was already clamped at rubber-band
      // range, so this can only trigger for the allowed direction.
      const futureBlocked = isFuturePeriod(view, shiftPeriod(view, anchor, 1));
      if (dir === 1 && futureBlocked) {
        setSnapping(true);
        setDragX(0);
        window.setTimeout(() => setSnapping(false), 220);
        return;
      }
      commit(dir);
    } else {
      setSnapping(true);
      setDragX(0);
      window.setTimeout(() => setSnapping(false), 220);
    }
  }

  // Title + 3-panel strip, rendered OUTSIDE the keyed view-anim wrapper
  // so it doesn't unmount on anchor change. The middle panel is always
  // the current period; prev / next are pre-rendered so the swipe
  // reveals the new chart smoothly. After commit() updates anchor, the
  // strip recomputes its 3 panels — what was "next" becomes the new
  // centre — and dragX resets to 0 with no transition, masking the swap.
  const chartStrip = isStripView && (
    <>
      <h3 className="logs-section__title">
        {view === 'D' ? "Your day's mood" : "Your week's mood"}
      </h3>
      <div className="mood-strip-wrap" ref={stripRef}>
        <div
          className={'mood-strip' + (snapping ? ' mood-strip--snap' : '')}
          style={{ transform: `translateX(calc(-33.3333% + ${dragX}px))` }}
        >
          <div className="mood-strip__panel">
            <ChartPanel view={view} anchor={shiftPeriod(view, anchor, -1)} logs={logs} />
          </div>
          <div className="mood-strip__panel">
            <ChartPanel view={view} anchor={anchor} logs={logs} />
          </div>
          <div className="mood-strip__panel">
            <ChartPanel view={view} anchor={shiftPeriod(view, anchor, 1)} logs={logs} />
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="screen" id="logs">
      <div className="logs-shell">
        <DwmyToggle value={view} onChange={changeView} />

        <PeriodNav
          label={periodLabel(view, anchor)}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          forwardDisabled={forwardDisabled}
        />

        <div
          className="logs-body"
          onPointerDown={onSwipePointerDown}
          onPointerMove={onSwipePointerMove}
          onPointerUp={onSwipePointerUp}
          onPointerCancel={() => {
            swipe.current = null;
            setSnapping(true);
            setDragX(0);
            window.setTimeout(() => setSnapping(false), 220);
          }}
        >
          {chartStrip}
          {/* Keyed wrapper → React unmounts/remounts on view change, so the
              fade-up entry animation re-fires per switch. The visualization
              for D/W/M/Y is structurally too different to tween element-by-
              element; a clean crossfade reads better. */}
          <div
            key={`v-${view}-${anchor.toISOString()}`}
            className="logs-view-anim"
          >
            {view === 'D' && (
              <DayBody anchor={anchor} logs={logs} onOpenLog={onOpenLog} />
            )}
            {view === 'W' && (
              <WeekBody
                anchor={anchor}
                logs={logs}
                onDrillToDay={(d) => drillTo('D', d)}
              />
            )}
            {view === 'M' && (
              <MonthBody
                anchor={anchor}
                logs={logs}
                onDrillToDay={(d) => drillTo('D', d)}
              />
            )}
            {view === 'Y' && (
              <YearBody
                anchor={anchor}
                logs={logs}
                onDrillToMonth={(m) => drillTo('M', m)}
              />
            )}
          </div>

          {/* The bubble breakdown — shared by every view except Day, which
              renders the line graph in its place. Keyed so the bubbles get
              fresh randomized positions per (view, anchor) and animate in. */}
          {view !== 'D' && (
            <div
              key={`b-${view}-${anchor.toISOString()}`}
              className="logs-view-anim"
            >
              <Breakdown
                view={view}
                counts={quadrantCountsInPeriod(view, anchor, logs)}
                empty={periodLogs.length === 0}
                seed={`${view}-${anchor.toISOString()}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// D / W / M / Y toggle
// ────────────────────────────────────────────────────────────────────

function DwmyToggle({
  value,
  onChange,
}: {
  value: LogView;
  onChange: (v: LogView) => void;
}) {
  return (
    <div className="dwmy" role="tablist" aria-label="Time range">
      {VIEWS.map((v) => {
        const active = value === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={'dwmy__seg' + (active ? ' dwmy__seg--on' : '')}
            onClick={() => onChange(v.id)}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Period navigator (chevrons + label)
// ────────────────────────────────────────────────────────────────────

function PeriodNav({
  label,
  onPrev,
  onNext,
  forwardDisabled,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  forwardDisabled: boolean;
}) {
  return (
    <div className="pnav">
      <button
        type="button"
        className="pnav__chev"
        aria-label="Previous period"
        onClick={onPrev}
      >
        <CaretLeft size={18} weight="regular" />
      </button>
      <span className="pnav__label">{label}</span>
      <button
        type="button"
        className="pnav__chev"
        aria-label="Next period"
        disabled={forwardDisabled}
        onClick={onNext}
      >
        <CaretRight size={18} weight="regular" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Day view — list of log cards + mood line graph
// ────────────────────────────────────────────────────────────────────

function DayBody({
  anchor,
  logs,
  onOpenLog,
}: {
  anchor: Date;
  logs: LogEntry[];
  onOpenLog: (id: string) => void;
}) {
  const key = periodDayKeys('D', anchor)[0];
  const dayLogs = logsForDay(key, logs);

  return dayLogs.length === 0 ? (
    <p className="logs-empty">no logs on this day</p>
  ) : (
    <DayLogList dayLogs={dayLogs} allLogs={logs} onOpen={onOpenLog} />
  );
}

// Single chart panel inside the swipeable strip. Looks up its own
// adjacent-period carry-over so each panel is self-contained.
function ChartPanel({
  view,
  anchor,
  logs,
}: {
  view: LogView;
  anchor: Date;
  logs: LogEntry[];
}) {
  if (view === 'D') {
    const key = periodDayKeys('D', anchor)[0];
    const dayLogs = logsForDay(key, logs);
    const prevDate = new Date(anchor);
    prevDate.setDate(prevDate.getDate() - 1);
    const nextDate = new Date(anchor);
    nextDate.setDate(nextDate.getDate() + 1);
    const leadingQ = lastQuadrantOfDay(prevDate, logs);
    const trailingQ = firstQuadrantOfDay(nextDate, logs);
    // Empty day still renders the bands so the swipe strip stays the
    // same height across periods — only the spline + dots are absent.
    return (
      <DayMoodLine
        logs={dayLogs}
        leadingQ={leadingQ}
        trailingQ={trailingQ}
        edge
      />
    );
  }
  return <WeekMoodLine anchor={anchor} logs={logs} />;
}

// Vertical band order (top → bottom): HEP, LEP, baseline, LEN, HEN.
// Y-coordinate (0..1, 0 = top) for each quadrant's band center.
const BAND_Y: Record<Quadrant, number> = {
  hep: 0.12,
  lep: 0.36,
  len: 0.64,
  hen: 0.88,
};

// Node granularity = unique emotion category in encounter order.
// A single log can yield 1–4 nodes — one per distinct quadrant
// appearing in its chips, in chip order, with duplicates dropped.
// Same rule for every input mode (speak/type orders chips by
// transcript position; emotion-selector orders by selection).
// If a log has no chips with quadrant tags, fall back to the
// precomputed `quadrants` array so the log still contributes
// at least one node and the line doesn't gap.
function quadrantsForLog(log: LogEntry): Quadrant[] {
  const seen = new Set<Quadrant>();
  const seq: Quadrant[] = [];
  const chips = log.chips ?? [];
  for (const c of chips) {
    const q = c.quadrant as Quadrant | null;
    if (!q || seen.has(q)) continue;
    seen.add(q);
    seq.push(q);
  }
  if (seq.length > 0) return seq;
  for (const q of log.quadrants) {
    if (seen.has(q)) continue;
    seen.add(q);
    seq.push(q);
  }
  return seq;
}

type MoodPoint = { tx: number; ty: number; quadrant: Quadrant };

export function DayMoodLine({
  logs,
  leadingQ,
  trailingQ,
  edge = false,
}: {
  logs: LogEntry[];
  leadingQ?: Quadrant;
  trailingQ?: Quadrant;
  edge?: boolean;
}) {
  // Flatten across logs in chronological order: log 1's nodes, then
  // log 2's nodes, etc. X spaces uniformly across the total count.
  const flat: Quadrant[] = [];
  for (const l of logs) {
    for (const q of quadrantsForLog(l)) flat.push(q);
  }
  const pts: MoodPoint[] = [];
  // Carry-over from previous day — invisible anchor that lets the spline
  // enter from off-screen left so the chart visibly continues across
  // period boundaries when the user swipes between days.
  if (edge && leadingQ) pts.push({ tx: -0.12, ty: BAND_Y[leadingQ], quadrant: leadingQ });
  flat.forEach((q, i) => {
    pts.push({
      tx: flat.length === 1 ? 0.5 : i / (flat.length - 1),
      ty: BAND_Y[q],
      quadrant: q,
    });
  });
  if (edge && trailingQ) pts.push({ tx: 1.12, ty: BAND_Y[trailingQ], quadrant: trailingQ });
  return <MoodLine pts={pts} ariaLabel="Mood across the day" edge={edge} />;
}

function WeekMoodLine({ anchor, logs }: { anchor: Date; logs: LogEntry[] }) {
  // Each weekday owns a 1/7 horizontal slot. Within a day, its nodes
  // (one per unique quadrant per log, same rule as DayMoodLine) are
  // distributed evenly inside that slot. Empty days contribute nothing
  // — the spline connects the last node of the previous logged day
  // directly to the first node of the next logged day, jumping the
  // empty slot. Leading / trailing empty days simply trim the line.
  const keys = periodDayKeys('W', anchor);
  const pts: MoodPoint[] = [];
  keys.forEach((k, dayIdx) => {
    const dayNodes: Quadrant[] = [];
    for (const l of logsForDay(k, logs)) {
      for (const q of quadrantsForLog(l)) dayNodes.push(q);
    }
    const n = dayNodes.length;
    if (n === 0) return;
    dayNodes.forEach((q, j) => {
      pts.push({
        tx: (dayIdx + (j + 0.5) / n) / 7,
        ty: BAND_Y[q],
        quadrant: q,
      });
    });
  });
  // Carry-over from the previous week's last logged day, and into the
  // next week's first logged day — same continuity story as the daily
  // chart, just bookended by whole weeks.
  const prevWeekAnchor = shiftPeriod('W', anchor, -1);
  const nextWeekAnchor = shiftPeriod('W', anchor, 1);
  const leadingQ = lastQuadrantOfWeek(prevWeekAnchor, logs);
  const trailingQ = firstQuadrantOfWeek(nextWeekAnchor, logs);
  const withCarry: MoodPoint[] = [];
  if (leadingQ) withCarry.push({ tx: -0.12, ty: BAND_Y[leadingQ], quadrant: leadingQ });
  withCarry.push(...pts);
  if (trailingQ) withCarry.push({ tx: 1.12, ty: BAND_Y[trailingQ], quadrant: trailingQ });
  // Always render the chart shell (bands) so empty weeks inside the
  // swipe strip keep the same height as logged weeks.
  return <MoodLine pts={withCarry} ariaLabel="Mood across the week" edge />;
}

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lastQuadrantOfDay(date: Date, logs: LogEntry[]): Quadrant | undefined {
  const dayLogs = logsForDay(dayKeyOf(date), logs);
  for (let i = dayLogs.length - 1; i >= 0; i--) {
    const qs = quadrantsForLog(dayLogs[i]);
    if (qs.length) return qs[qs.length - 1];
  }
  return undefined;
}

function firstQuadrantOfDay(date: Date, logs: LogEntry[]): Quadrant | undefined {
  const dayLogs = logsForDay(dayKeyOf(date), logs);
  for (const l of dayLogs) {
    const qs = quadrantsForLog(l);
    if (qs.length) return qs[0];
  }
  return undefined;
}

function lastQuadrantOfWeek(anchor: Date, logs: LogEntry[]): Quadrant | undefined {
  const keys = periodDayKeys('W', anchor);
  for (let i = keys.length - 1; i >= 0; i--) {
    const dayLogs = logsForDay(keys[i], logs);
    for (let j = dayLogs.length - 1; j >= 0; j--) {
      const qs = quadrantsForLog(dayLogs[j]);
      if (qs.length) return qs[qs.length - 1];
    }
  }
  return undefined;
}

function firstQuadrantOfWeek(anchor: Date, logs: LogEntry[]): Quadrant | undefined {
  const keys = periodDayKeys('W', anchor);
  for (const k of keys) {
    const dayLogs = logsForDay(k, logs);
    for (const l of dayLogs) {
      const qs = quadrantsForLog(l);
      if (qs.length) return qs[0];
    }
  }
  return undefined;
}

function MoodLine({
  pts,
  ariaLabel,
  edge = false,
}: {
  pts: MoodPoint[];
  ariaLabel: string;
  edge?: boolean;
}) {
  const W = 320;
  // Edge mode is 3/4 as tall and runs flush to the SVG's horizontal
  // edges — points with tx<0 or tx>1 (carry-over from prev/next period)
  // land off-screen and only contribute their connecting segment.
  const H = edge ? 150 : 200;
  const padX = edge ? 0 : 12;
  const padY = 12;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const points = pts.map((p) => ({
    x: padX + p.tx * innerW,
    y: padY + p.ty * innerH,
    tx: p.tx,
    quadrant: p.quadrant,
  }));

  // Two-point days get a single quadratic Bézier whose control point
  // sits on the chord-perpendicular such that:
  //   - descending chord → curve bows ABOVE (cap): looks like a soft landing
  //   - ascending chord → curve bows BELOW (cup): the line ends pointing
  //     steeply upward — reads as "slowly but surely uplifting"
  // Three-or-more-point days use a Catmull-Rom cubic spline so the line
  // is C1-continuous through every interior point (no "glued segments").
  // fromX/Y/toX/toY capture the chord endpoints so each segment can
  // host its own linearGradient running between the two points in
  // user-space coords — colors flow smoothly along the curve.
  type Segment = {
    d: string;
    from: Quadrant;
    to: Quadrant;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  };
  const segments: Segment[] = [];

  if (points.length === 2) {
    const p = points[0];
    const next = points[1];
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= 0.1) {
      // Perpendicular choice flips on trend so the curve always sits on
      // the "outside" of the trend direction (cap for down, cup for up).
      // SVG y grows downward → dy>0 is descending in mood.
      const useDown = dy > 0;
      const perpX = useDown ? dy / dist : -dy / dist;
      const perpY = useDown ? -dx / dist : dx / dist;
      const bulge = Math.min(dist * 0.24, 50);
      const midX = (p.x + next.x) / 2;
      const midY = (p.y + next.y) / 2;
      const cx = midX + perpX * bulge;
      const cy = midY + perpY * bulge;
      segments.push({
        d: `M ${p.x} ${p.y} Q ${cx} ${cy} ${next.x} ${next.y}`,
        from: p.quadrant,
        to: next.quadrant,
        fromX: p.x,
        fromY: p.y,
        toX: next.x,
        toY: next.y,
      });
    }
  } else if (points.length >= 3) {
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i];
      const next = points[i + 1];
      const prev = points[i - 1] ?? p;
      const after = points[i + 2] ?? next;
      // Catmull-Rom → cubic Bézier control points share tangents at joins,
      // giving smooth (C1-continuous) transitions through every point.
      const c1x = p.x + (next.x - prev.x) / 6;
      const c1y = p.y + (next.y - prev.y) / 6;
      const c2x = next.x - (after.x - p.x) / 6;
      const c2y = next.y - (after.y - p.y) / 6;
      segments.push({
        d: `M ${p.x} ${p.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`,
        from: p.quadrant,
        to: next.quadrant,
        fromX: p.x,
        fromY: p.y,
        toX: next.x,
        toY: next.y,
      });
    }
  }

  // useId scopes gradient IDs to this DayMoodLine instance — avoids
  // collisions if multiple charts ever mount on the same screen.
  const gradId = useId().replace(/:/g, '');

  return (
    <svg
      className={'day-mood' + (edge ? ' day-mood--edge' : '')}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Four colored bands: HEP yellow → LEP green → (baseline) → LEN blue → HEN coral. */}
      {(['hep', 'lep', 'len', 'hen'] as Quadrant[]).map((q, i) => (
        <rect
          key={q}
          x={padX}
          y={padY + (i / 4) * innerH}
          width={innerW}
          height={innerH / 4}
          fill={quadrantColor(q, 0.18)}
        />
      ))}
      {/* Baseline divider between positive (above) and negative (below). */}
      <line
        x1={padX}
        x2={padX + innerW}
        y1={padY + innerH / 2}
        y2={padY + innerH / 2}
        stroke="rgba(34, 34, 34, 0.35)"
        strokeWidth={1}
      />
      {/* One linearGradient per segment, running in user-space coords
          from the source point to the destination point — colors flow
          smoothly along each leg of the curve. */}
      <defs>
        {segments.map((s, i) => (
          <linearGradient
            key={i}
            id={`mood-${gradId}-${i}`}
            gradientUnits="userSpaceOnUse"
            x1={s.fromX}
            y1={s.fromY}
            x2={s.toX}
            y2={s.toY}
          >
            <stop offset="0%" stopColor={quadrantColor(s.from, 0.95)} />
            <stop offset="100%" stopColor={quadrantColor(s.to, 0.95)} />
          </linearGradient>
        ))}
      </defs>
      {segments.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={`url(#mood-${gradId}-${i})`}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Points on each log so a single-log day still has something to
          render. Carry-over anchors at tx<0 or tx>1 are skipped here —
          they only exist to extend the spline off-screen. */}
      {points.map((p, i) =>
        p.tx < 0 || p.tx > 1 ? null : (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4.5}
            fill={quadrantColor(p.quadrant, 1)}
            stroke="#ffffff"
            strokeWidth={1.5}
          />
        ),
      )}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────
// Week view — 7 stacked bars
// ────────────────────────────────────────────────────────────────────

function WeekBody({
  anchor,
  logs,
  onDrillToDay,
}: {
  anchor: Date;
  logs: LogEntry[];
  onDrillToDay: (d: Date) => void;
}) {
  const keys = periodDayKeys('W', anchor);
  return (
    <>
      <div className="day-row" role="tablist" aria-label="Days this week">
        {keys.map((key, i) => {
          const date = dateFromKey(key);
          const isFuture = date.getTime() > TODAY.getTime() && key !== TODAY_KEY;
          const quads = quadrantsForDay(key, logs);
          const hasLogs = quads.length > 0;
          const isToday = key === TODAY_KEY;

          let dotClass = 'day__dot ';
          let dotStyle: CSSProperties = {};
          if (isFuture) {
            dotClass += 'day__dot--future';
          } else if (hasLogs) {
            dotClass += 'day__dot--logged';
            dotStyle = { background: dotBackground(quads) };
          } else {
            dotClass += 'day__dot--empty';
          }

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={false}
              aria-label={
                hasLogs
                  ? `${WEEK_LETTERS[i]}, ${quads.length} log${quads.length === 1 ? '' : 's'}`
                  : `${WEEK_LETTERS[i]}, no logs`
              }
              disabled={isFuture}
              className={'day' + (isToday ? ' day--today' : '')}
              onClick={() => !isFuture && onDrillToDay(date)}
            >
              <span className="day__letter">{WEEK_LETTERS[i]}</span>
              <span className={dotClass} style={dotStyle} />
            </button>
          );
        })}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Month view — 7-col calendar of gradient dots
// ────────────────────────────────────────────────────────────────────

function MonthBody({
  anchor,
  logs,
  onDrillToDay,
}: {
  anchor: Date;
  logs: LogEntry[];
  onDrillToDay: (d: Date) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDow = new Date(year, month, 1).getDay(); // 0 Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { key: string | null; date: Date | null }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ key: null, date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ key: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, date });
  }
  // Pad to a multiple of 7 (trailing empty cells).
  while (cells.length % 7) cells.push({ key: null, date: null });

  return (
    <div className="month-grid">
      {WEEK_LETTERS.map((l, i) => (
        <span key={i} className="month-grid__head">{l}</span>
      ))}
      {cells.map((cell, i) => {
        if (!cell.key || !cell.date) {
          return <span key={`pad-${i}`} className="month-grid__cell month-grid__cell--pad" />;
        }
        const isFuture = cell.date.getTime() > TODAY.getTime() && cell.key !== TODAY_KEY;
        const isToday = cell.key === TODAY_KEY;
        const quads = quadrantsForDay(cell.key, logs);
        const hasLogs = quads.length > 0;
        return (
          <button
            key={cell.key}
            type="button"
            className={
              'month-grid__cell' +
              (isFuture ? ' month-grid__cell--future' : '') +
              (isToday ? ' month-grid__cell--today' : '')
            }
            disabled={isFuture}
            aria-label={`${cell.date.toDateString()}${hasLogs ? ', ' + quads.length + ' logged' : ', no logs'}`}
            onClick={() => !isFuture && onDrillToDay(cell.date as Date)}
          >
            <span
              className={
                'month-grid__dot' +
                (isFuture ? ' month-grid__dot--future' : hasLogs ? ' month-grid__dot--filled' : ' month-grid__dot--empty')
              }
              style={hasLogs ? { background: dotBackground(quads) } : undefined}
            />
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Year view — 4×3 grid of month pies
// ────────────────────────────────────────────────────────────────────

function YearBody({
  anchor,
  logs,
  onDrillToMonth,
}: {
  anchor: Date;
  logs: LogEntry[];
  onDrillToMonth: (d: Date) => void;
}) {
  const year = anchor.getFullYear();
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, m) => {
        const firstOfMonth = new Date(year, m, 1);
        const isFutureMonth =
          firstOfMonth.getTime() > periodStart('M', TODAY).getTime();
        const counts = quadrantCountsInPeriod('M', firstOfMonth, logs);
        const total = QUAD_ORDER.reduce((s, q) => s + counts[q], 0);
        return (
          <button
            key={m}
            type="button"
            className={'year-grid__cell' + (isFutureMonth ? ' year-grid__cell--future' : '')}
            disabled={isFutureMonth}
            onClick={() => !isFutureMonth && onDrillToMonth(firstOfMonth)}
            aria-label={`${MONTH_NAMES_SHORT[m]} ${year}, ${total} log${total === 1 ? '' : 's'}`}
          >
            <span className="year-grid__label">{MONTH_NAMES_SHORT[m]}</span>
            {total === 0 || isFutureMonth ? (
              <span className="year-grid__pie year-grid__pie--empty" />
            ) : (
              <span
                className="year-grid__pie year-grid__pie--blend"
                style={{ background: quadrantBlendBackground(counts) }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Breakdown bubbles (shared by W / M / Y views)
// ────────────────────────────────────────────────────────────────────

const BREAKDOWN_TITLE: Record<LogView, string> = {
  D: '',
  W: "Your week's breakdown",
  M: "Your month's breakdown",
  Y: "Your year's breakdown",
};

function Breakdown({
  view,
  counts,
  empty,
  seed,
}: {
  view: LogView;
  counts: Record<Quadrant, number>;
  empty: boolean;
  seed: string;
}) {
  return (
    <section className="logs-section">
      <h3 className="logs-section__title">{BREAKDOWN_TITLE[view]}</h3>
      {empty ? (
        <p className="logs-empty">no logs in this period</p>
      ) : (
        <BreakdownBubbles counts={counts} seed={seed} />
      )}
    </section>
  );
}

function BreakdownBubbles({
  counts,
  seed,
}: {
  counts: Record<Quadrant, number>;
  seed: string;
}) {
  // Sort by count desc so the largest bubble leads (left).
  const items = QUAD_ORDER
    .map((q) => ({ q, n: counts[q] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  if (items.length === 0) return null;

  const total = items.reduce((s, x) => s + x.n, 0);
  const maxN = items[0].n;
  const rng = mulberry32(hashSeed(seed));

  // Area-proportional radii. Max radius is capped so even 4 max-sized
  // bubbles fit horizontally with comfortable gaps + Y-jitter headroom,
  // never clipping the viewBox.
  const R_MAX = 30;
  const R_MIN = 16;
  const radii = items.map((x) =>
    Math.max(R_MIN, Math.min(R_MAX, R_MIN + Math.sqrt(x.n / maxN) * (R_MAX - R_MIN))),
  );

  // Left-to-right packing: each bubble's center is offset by its own
  // radius plus the previous bubble's radius plus the gap.
  const W = 320;
  const H = 200;
  const gap = 12;
  const cy = H / 2;
  const totalRowW =
    radii.reduce((s, r) => s + r * 2, 0) + (radii.length - 1) * gap;
  const startX = (W - totalRowW) / 2;
  let cursor = startX;
  // Per-(view, anchor) randomized jitter so the cluster looks different
  // in W vs M vs Y — but stays deterministic per pair so re-entering a
  // period gives the same layout.
  const positions = radii.map((r) => {
    const x = cursor + r;
    cursor += r * 2 + gap;
    // Y offset within ±18 so the bubble is never within R_MAX of the edge.
    const yOffset = (rng() - 0.5) * 36;
    const xOffset = (rng() - 0.5) * 8;
    return { x: x + xOffset, y: cy + yOffset };
  });

  return (
    <svg
      className="breakdown"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Quadrant breakdown by share"
    >
      {items.map((item, i) => {
        const r = radii[i];
        const { x, y } = positions[i];
        const pct = Math.round((item.n / total) * 100);
        const fontSize = Math.max(12, r * 0.5);
        // Each bubble gets its own subtle, randomized drift cycle so the
        // cluster looks gently alive instead of mechanical.
        const driftStyle = {
          '--fx': `${(rng() - 0.5) * 6}px`,
          '--fy': `${(rng() - 0.5) * 6}px`,
          '--float-dur': `${7 + rng() * 4}s`,
          '--float-delay': `${rng() * -6}s`,
        } as React.CSSProperties;
        return (
          <g
            key={item.q}
            className="breakdown__bubble"
            style={driftStyle}
          >
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={quadrantColor(item.q, 1)}
              stroke={shadeQuadrant(item.q, 0.28, 0.6)}
              strokeWidth={1}
            />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fontWeight={400}
              fontFamily="var(--font-sans)"
              fill="var(--charcoal)"
            >
              {pct}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
