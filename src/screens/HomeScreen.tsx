import { useState } from 'react';
import { Plus, CalendarBlank } from '@phosphor-icons/react';
import WeekMoodCard from '../components/WeekMoodCard';
import { TODAY, TODAY_KEY, type LogEntry } from '../data/mockLogs';

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface Props {
  logs: LogEntry[];
  /** From the signed-in profile when Supabase is on; falls back to
   *  'Rohan' for the mock/dev experience so the screen still looks
   *  populated without an auth session. */
  displayName?: string | null;
  onLog: () => void;
  onViewLogs: () => void;
  onOpenLog?: (id: string) => void;
}

export default function HomeScreen({
  logs,
  displayName,
  onLog,
  onViewLogs,
  onOpenLog,
}: Props) {
  const name = displayName?.trim() || 'Rohan';
  const [selectedKey, setSelectedKey] = useState(TODAY_KEY);

  return (
    <div className="screen" id="home">

      <div className="home-scroll">
        <header className="hero">
          <h1 className="greeting">
            {greetingFor(TODAY.getHours())},
            <br />
            <em>{name}.</em>
          </h1>

          <div className="fab-zone">
            <button
              type="button"
              className="fab"
              aria-label="Log how you're feeling"
              onClick={onLog}
            >
              <Plus size={34} weight="light" />
            </button>
            <span className="fab-hint">how are you feeling?</span>
          </div>
        </header>

        <WeekMoodCard
          logs={logs}
          selectedKey={selectedKey}
          onSelectDay={setSelectedKey}
          onOpenLog={onOpenLog}
        />

        <div className="card-actions">
          <button type="button" className="btn-primary" onClick={onLog}>
            <Plus size={16} weight="bold" />
            log your mood
          </button>
          <button type="button" className="btn-secondary" onClick={onViewLogs}>
            <CalendarBlank size={16} weight="regular" />
            view all logs
          </button>
        </div>
      </div>
    </div>
  );
}
