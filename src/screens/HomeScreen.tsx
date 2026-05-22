import { useState } from 'react';
import { Plus, CalendarBlank } from '@phosphor-icons/react';
import WeekMoodCard from '../components/WeekMoodCard';
import { TODAY, TODAY_KEY, type LogEntry } from '../data/mockLogs';

const USER_NAME = 'Rohan';

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface Props {
  logs: LogEntry[];
  onLog: () => void;
  onViewLogs: () => void;
  onOpenLog?: (id: string) => void;
}

export default function HomeScreen({ logs, onLog, onViewLogs, onOpenLog }: Props) {
  const [selectedKey, setSelectedKey] = useState(TODAY_KEY);

  return (
    <div className="screen" id="home">
      <div className="wordmark">Tenor</div>

      <div className="home-scroll">
        <header className="hero">
          <h1 className="greeting">
            {greetingFor(TODAY.getHours())},
            <br />
            <em>{USER_NAME}.</em>
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
