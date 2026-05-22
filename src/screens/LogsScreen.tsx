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

// ────────────────────────────────────────────────────────────────────
// Top-level screen
// ────────────────────────────────────────────────────────────────────

export default function LogsScreen({ logs, onOpenLog }: Props) {
  const [view, setView] = useState<LogView>('W');
  // Anchor = first date of the current period. Defaults to the week
  // containing TODAY so a freshly-opened Logs tab feels current.
  const [anchor, setAnchor] = useState<Date>(() => periodStart('W', TODAY));

  function changeView(next: LogView) {
    // Re-anchor to the equivalent period containing the current anchor.
    setView(next);
    setAnchor(periodStart(next, anchor));
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
          {view === 'D' && (
            <DayBody
              anchor={anchor}
              logs={logs}
              onOpenLog={onOpenLog}
            />
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

          {/* The bubble breakdown — shared by every view except Day, which
              renders the line graph in its place. */}
          {view !== 'D' && (
            <Breakdown
              view={view}
              counts={quadrantCountsInPeriod(view, anchor, logs)}
              empty={periodLogs.length === 0}
            />
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

  // Smooth path via Catmull-Rom → cubic-bezier conversion. Per-segment
  // path strings let us colorize each leg by its destination quadrant.
  const segments = points.slice(0, -1).map((p, i) => {
    const next = points[i + 1];
    const prev = points[i - 1] ?? p;
    const after = points[i + 2] ?? next;
    const c1x = p.x + (next.x - prev.x) / 6;
    const c1y = p.y + (next.y - prev.y) / 6;
    const c2x = next.x - (after.x - p.x) / 6;
    const c2y = next.y - (after.y - p.y) / 6;
    return {
      d: `M ${p.x} ${p.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`,
      from: p.quadrant,
      to: next.quadrant,
    };
  });

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
              <MonthPie counts={counts} total={total} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function MonthPie({ counts, total }: { counts: Record<Quadrant, number>; total: number }) {
  const r = 24;
  const c = r + 2;
  // Conic-like SVG slices via path arcs.
  let acc = 0;
  return (
    <svg className="year-grid__pie" viewBox={`0 0 ${(c) * 2} ${(c) * 2}`}>
      {QUAD_ORDER.map((q) => {
        const v = counts[q];
        if (v === 0) return null;
        const frac = v / total;
        const start = acc;
        const end = acc + frac;
        acc = end;
        const a0 = start * Math.PI * 2 - Math.PI / 2;
        const a1 = end * Math.PI * 2 - Math.PI / 2;
        const x0 = c + r * Math.cos(a0);
        const y0 = c + r * Math.sin(a0);
        const x1 = c + r * Math.cos(a1);
        const y1 = c + r * Math.sin(a1);
        const large = frac > 0.5 ? 1 : 0;
        // Full circle → render as a circle to avoid the start==end degenerate arc.
        if (frac === 1) {
          return <circle key={q} cx={c} cy={c} r={r} fill={quadrantColor(q, 0.85)} />;
        }
        return (
          <path
            key={q}
            d={`M ${c} ${c} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`}
            fill={quadrantColor(q, 0.85)}
          />
        );
      })}
    </svg>
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
}: {
  view: LogView;
  counts: Record<Quadrant, number>;
  empty: boolean;
}) {
  return (
    <section className="logs-section">
      <h3 className="logs-section__title">{BREAKDOWN_TITLE[view]}</h3>
      {empty ? (
        <p className="logs-empty">no logs in this period</p>
      ) : (
        <BreakdownBubbles counts={counts} />
      )}
    </section>
  );
}

function BreakdownBubbles({ counts }: { counts: Record<Quadrant, number> }) {
  // Sort by count desc so the largest bubble anchors near the visual center
  // and smaller bubbles cluster around it.
  const items = QUAD_ORDER
    .map((q) => ({ q, n: counts[q] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  if (items.length === 0) return null;

  const maxN = items[0].n;
  // Area-proportional radii. Tighter ceiling (46) keeps the cluster from
  // dominating the 320×200 viewBox when 3–4 quadrants are present.
  const radii = items.map((x) => Math.max(16, Math.min(46, 14 + Math.sqrt(x.n / maxN) * 32)));

  // Hand-tuned anchors with enough separation that ~46px bubbles only just
  // graze each other — reads as a loose cluster, not a Venn diagram.
  const anchors: { x: number; y: number }[] = [
    { x: 90, y: 90 },   // largest
    { x: 215, y: 70 },  // upper-right
    { x: 175, y: 160 }, // bottom-center
    { x: 270, y: 155 }, // bottom-right
  ];

  return (
    <svg
      className="breakdown"
      viewBox="0 0 320 200"
      role="img"
      aria-label="Quadrant breakdown"
    >
      {items.map((item, i) => {
        const r = radii[i];
        const { x, y } = anchors[i];
        return (
          <circle
            key={item.q}
            cx={x}
            cy={y}
            r={r}
            fill={quadrantColor(item.q, 0.7)}
            stroke={shadeQuadrant(item.q, 0.3, 0.8)}
            strokeWidth={1.5}
          />
        );
      })}
    </svg>
  );
}
