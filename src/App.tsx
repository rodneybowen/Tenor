import { useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import BlobField from './components/BlobField';
import GrainOverlay from './components/GrainOverlay';
import PillNav, { type NavTab } from './components/PillNav';
import HomeScreen from './screens/HomeScreen';
import LogMethodScreen from './screens/LogMethodScreen';
import VoiceScreen from './screens/VoiceScreen';
import ConfirmationScreen from './screens/ConfirmationScreen';
import { MOCK_LOGS, TODAY_KEY, formatClock, type LogEntry } from './data/mockLogs';
import type { Detected } from './lib/emotionDetect';
import type { Quadrant } from './theme/emotions';

type Screen =
  | 'home'
  | 'logMethod'
  | 'voice'
  | 'confirmation'
  | 'logs'
  | 'chat'
  | 'account'
  | 'emotion';

const PLACEHOLDER: Partial<Record<Screen, { title: string; body: string }>> = {
  logs: {
    title: 'Logs',
    body: 'The log history screen (day / week / month / year) is the next screen to build.',
  },
  chat: {
    title: 'Chat',
    body: 'The communications tab with your therapist is out of scope for this prototype.',
  },
  account: {
    title: 'Account',
    body: 'The account tab is out of scope for this prototype.',
  },
  emotion: {
    title: 'Emotion selector',
    body: 'The quadrant + emotion-grid flow is the next distinct flow after Speak.',
  },
};

const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);
  const [confirmChips, setConfirmChips] = useState<Detected[]>([]);
  const [confirmTime, setConfirmTime] = useState('');

  function submitVoiceLog(chips: Detected[]) {
    const now = new Date();
    const time = formatClock(now);
    const quadrants = Array.from(
      new Set(chips.map((c) => c.quadrant).filter((q): q is Quadrant => q !== null)),
    );
    const entry: LogEntry = {
      id: `v${Date.now()}`,
      dateKey: TODAY_KEY,
      time,
      ts: Date.now(),
      mode: 'speak',
      keywords: chips.map((c) => c.text),
      quadrants,
    };
    setLogs((prev) => [...prev, entry]);
    setConfirmChips(chips);
    setConfirmTime(time);
    setScreen('confirmation');
  }

  function handleNav(tab: NavTab) {
    setScreen(tab === 'home' ? 'home' : tab);
  }

  const navTab: NavTab =
    screen === 'logs' || screen === 'chat' || screen === 'account'
      ? screen
      : 'home';
  const showNav =
    screen === 'home' ||
    screen === 'logs' ||
    screen === 'chat' ||
    screen === 'account';

  return (
    <div className="app-root">
      <BlobField />
      <GrainOverlay />

      {screen === 'home' && (
        <HomeScreen
          logs={logs}
          onLog={() => setScreen('logMethod')}
          onViewLogs={() => setScreen('logs')}
        />
      )}

      {screen === 'logMethod' && (
        <LogMethodScreen
          onBack={() => setScreen('home')}
          onSpeak={() => setScreen('voice')}
          onPickEmotions={() => setScreen('emotion')}
        />
      )}

      {screen === 'voice' && (
        <VoiceScreen
          demo={isDemo}
          onBack={() => setScreen('logMethod')}
          onConfirm={submitVoiceLog}
        />
      )}

      {screen === 'confirmation' && (
        <ConfirmationScreen
          chips={confirmChips}
          time={confirmTime}
          onAddAnother={() => setScreen('logMethod')}
          onViewLogs={() => setScreen('home')}
        />
      )}

      {PLACEHOLDER[screen] && (
        <div className="placeholder" role="dialog" aria-modal="true">
          <h2>{PLACEHOLDER[screen]!.title}</h2>
          <p>{PLACEHOLDER[screen]!.body}</p>
          <button type="button" onClick={() => setScreen('home')}>
            <ArrowLeft size={16} weight="bold" />
            back to home
          </button>
        </div>
      )}

      {showNav && <PillNav active={navTab} onSelect={handleNav} />}
    </div>
  );
}
