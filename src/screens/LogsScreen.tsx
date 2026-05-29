import { useMemo, useState } from 'react';
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
import LogEntryCard from '../components/LogEntryCard';

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
    if (next === 'D') {
      // Switching to Day → land on today, not the start of whatever
      // period the user was browsing. Drill-down from a Week-bar /
      // Month-cell still routes to that specific day via drillTo().
      setAnchor(periodStart('D', TODAY));
    } else {
      // For W / M / Y keep the user's browsing context — re-anchor
      // to the equivalent period containing the current anchor.
      setAnchor(periodStart(next, anchor));
    }
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

        <div className="logs-body">
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

  return (
    <>
      {dayLogs.length === 0 ? (
        <p className="logs-empty">no logs on this day</p>
      ) : (
        <div className="logs-list">
          {dayLogs.map((entry) => (
            <LogEntryCard key={entry.id} entry={entry} onOpen={onOpenLog} />
          ))}
        </div>
      )}

      {dayLogs.length > 0 && (
        <section className="logs-section">
          <h3 className="logs-section__title">Your day&apos;s mood</h3>
          <DayMoodLine logs={dayLogs} />
        </section>
      )}
    </>
  );
}

// Vertical band order (top → bottom): HEP, LEP, baseline, LEN, HEN.
// Y-coordinate (0..1, 0 = top) for each quadrant's band center.
const BAND_Y: Record<Quadrant, number> = {
  hep: 0.12,
  lep: 0.36,
  len: 0.64,
  hen: 0.88,
};

function DayMoodLine({ logs }: { logs: LogEntry[] }) {
  const W = 320;
  const H = 200;
  const padX = 12;
  const padY = 12;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  // Points: x by chronological order index, y by primary quadrant's band.
  const points = logs.map((l, i) => {
    const q = (l.quadrants[0] ?? 'lep') as Quadrant;
    const t = logs.length === 1 ? 0.5 : i / (logs.length - 1);
    return {
      x: padX + t * innerW,
      y: padY + BAND_Y[q] * innerH,
      quadrant: q,
    };
  });

  // Two-point days get a single quadratic Bézier whose control point
  // sits on the chord-perpendicular such that:
  //   - descending chord → curve bows ABOVE (cap): looks like a soft landing
  //   - ascending chord → curve bows BELOW (cup): the line ends pointing
  //     steeply upward — reads as "slowly but surely uplifting"
  // Three-or-more-point days use a Catmull-Rom cubic spline so the line
  // is C1-continuous through every interior point (no "glued segments").
  type Segment = { d: string; from: Quadrant; to: Quadrant };
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
      });
    }
  }

  return (
    <svg
      className="day-mood"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Mood across the day"
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
      {/* Line segments, each colored by its destination quadrant for a soft
          color-shift along the curve. */}
      {segments.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill="none"
          stroke={quadrantColor(s.to, 0.95)}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Points on each log so a single-log day still has something to render. */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4.5}
          fill={quadrantColor(p.quadrant, 1)}
          stroke="#ffffff"
          strokeWidth={1.5}
        />
      ))}
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
    <div className="week-bars">
      {keys.map((key, i) => {
        const date = dateFromKey(key);
        const isFuture = date.getTime() > TODAY.getTime() && key !== TODAY_KEY;
        const quads = quadrantsForDay(key, logs);
        const hasLogs = quads.length > 0;
        const isToday = key === TODAY_KEY;

        // Per-quadrant counts inside this day for the stacked segments.
        const counts: Record<Quadrant, number> = { hep: 0, lep: 0, hen: 0, len: 0 };
        for (const q of quads) counts[q] += 1;
        const total = quads.length || 1;

        return (
          <button
            key={key}
            type="button"
            className={
              'week-bars__col' +
              (isFuture ? ' week-bars__col--future' : '') +
              (isToday ? ' week-bars__col--today' : '')
            }
            aria-label={
              hasLogs
                ? `${WEEK_LETTERS[i]}, ${quads.length} log${quads.length === 1 ? '' : 's'}`
                : `${WEEK_LETTERS[i]}, no logs`
            }
            disabled={isFuture}
            onClick={() => !isFuture && onDrillToDay(date)}
          >
            <span className="week-bars__letter">{WEEK_LETTERS[i]}</span>
            <div
              className={
                'week-bars__bar' +
                (!hasLogs ? ' week-bars__bar--empty' : '')
              }
            >
              {hasLogs &&
                QUAD_ORDER.map((q) =>
                  counts[q] > 0 ? (
                    <span
                      key={q}
                      className="week-bars__seg"
                      style={{
                        height: `${(counts[q] / total) * 100}%`,
                        background: quadrantColor(q, 0.75),
                      }}
                    />
                  ) : null,
                )}
            </div>
          </button>
        );
      })}
    </div>
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
              fontWeight={600}
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
