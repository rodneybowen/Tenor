import type { CSSProperties } from 'react';
import {
  getWeek,
  logsForDay,
  quadrantsForDay,
  TODAY_KEY,
  type LogEntry,
} from '../data/mockLogs';
import { dotBackground } from '../theme/emotions';
import LogEntryCard from './LogEntryCard';

interface Props {
  logs: LogEntry[];
  selectedKey: string;
  onSelectDay: (dateKey: string) => void;
  onOpenLog?: (id: string) => void;
}

export default function WeekMoodCard({
  logs,
  selectedKey,
  onSelectDay,
  onOpenLog,
}: Props) {
  const week = getWeek();
  const selectedDay = week.find((d) => d.dateKey === selectedKey) ?? week[0];
  const dayLogs = logsForDay(selectedKey, logs);
  const selectedIsToday = selectedKey === TODAY_KEY;

  return (
    <section className="week-card" aria-label="This week's mood">
      <h2 className="week-card__title">This week's mood</h2>

      <div className="day-row" role="tablist" aria-label="Days this week">
        {week.map((day) => {
          const quadrants = quadrantsForDay(day.dateKey, logs);
          const hasLogs = quadrants.length > 0;
          const isSelected = day.dateKey === selectedKey;

          let dotClass = 'day__dot ';
          let dotStyle: CSSProperties = {};
          if (day.isFuture) {
            dotClass += 'day__dot--future';
          } else if (hasLogs) {
            dotClass += 'day__dot--logged';
            dotStyle = { background: dotBackground(quadrants) };
          } else {
            dotClass += 'day__dot--empty';
          }

          return (
            <button
              key={day.dateKey}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-label={`${day.label}${hasLogs ? `, ${quadrants.length} logged` : ', no logs'}`}
              disabled={day.isFuture}
              className={
                'day' +
                (day.isToday ? ' day--today' : '') +
                (isSelected ? ' day--selected' : '')
              }
              onClick={() => onSelectDay(day.dateKey)}
            >
              <span className="day__letter">{day.letter}</span>
              <span className={dotClass} style={dotStyle} />
            </button>
          );
        })}
      </div>

      <div className="day-label">{selectedDay.label}</div>

      {dayLogs.length > 0 ? (
        <div className="log-list">
          {dayLogs.map((entry) => (
            <LogEntryCard key={entry.id} entry={entry} onOpen={onOpenLog} />
          ))}
        </div>
      ) : (
        <p className="log-empty__msg">
          {selectedIsToday ? 'no logs today yet' : 'no logs on this day'}
        </p>
      )}
    </section>
  );
}
