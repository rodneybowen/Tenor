import { useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import BlobField from './components/BlobField';
import GrainOverlay from './components/GrainOverlay';
import PillNav, { type NavTab } from './components/PillNav';
import HomeScreen from './screens/HomeScreen';
import LogMethodScreen from './screens/LogMethodScreen';
import VoiceScreen from './screens/VoiceScreen';
import EmotionGridScreen from './screens/EmotionGridScreen';
import EmotionReviewScreen from './screens/EmotionReviewScreen';
import ConfirmationScreen from './screens/ConfirmationScreen';
import { MOCK_LOGS, TODAY_KEY, formatClock, type LogEntry } from './data/mockLogs';
import type { Detected } from './lib/emotionDetect';
import type { EmotionSelection, Quadrant } from './theme/emotions';

type Screen =
  | 'home'
  | 'logMethod'
  | 'voice'
  | 'emotionGrid'
  | 'emotionReview'
  | 'confirmation'
  | 'logs'
  | 'chat'
  | 'account';

type ConfirmMode = 'speak' | 'select';

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
};

const isDemo = new URLSearchParams(window.location.search).get('demo') === '1';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [logs, setLogs] = useState<LogEntry[]>(MOCK_LOGS);

  // Speak flow + emotion flow both end up on the same Confirmation screen.
  const [confirmChips, setConfirmChips] = useState<Detected[]>([]);
  const [confirmTime, setConfirmTime] = useState('');
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>('speak');

  // Emotion-selector flow state
  const [entryQuadrant, setEntryQuadrant] = useState<Quadrant>('hep');
  const [emotionSelected, setEmotionSelected] = useState<EmotionSelection[]>([]);
  const [emotionContext, setEmotionContext] = useState('');

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
    setConfirmMode('speak');
    setScreen('confirmation');
  }

  function pickQuadrant(q: Quadrant) {
    setEntryQuadrant(q);
    setEmotionSelected([]);
    setEmotionContext('');
    setScreen('emotionGrid');
  }

  function toggleEmotion(sel: EmotionSelection) {
    setEmotionSelected((prev) => {
      const idx = prev.findIndex((s) => s.name === sel.name);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      if (prev.length >= 5) return prev;
      return [...prev, sel];
    });
  }

  function removeEmotion(name: string) {
    setEmotionSelected((prev) => prev.filter((s) => s.name !== name));
  }

  function submitEmotionLog() {
    if (emotionSelected.length === 0) return;
    const now = new Date();
    const time = formatClock(now);
    const quadrants = Array.from(new Set(emotionSelected.map((s) => s.quadrant)));
    const entry: LogEntry = {
      id: `e${Date.now()}`,
      dateKey: TODAY_KEY,
      time,
      ts: Date.now(),
      mode: 'select',
      keywords: emotionSelected.map((s) => s.name),
      quadrants,
    };
    setLogs((prev) => [...prev, entry]);
    // Reuse the Confirmation screen's chip shape so it can render the
    // same colored pills the Speak flow does.
    setConfirmChips(
      emotionSelected.map((s) => ({ text: s.name, quadrant: s.quadrant })),
    );
    setConfirmTime(time);
    setConfirmMode('select');
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
          onPickQuadrant={pickQuadrant}
        />
      )}

      {screen === 'voice' && (
        <VoiceScreen
          demo={isDemo}
          onBack={() => setScreen('logMethod')}
          onConfirm={submitVoiceLog}
        />
      )}

      {screen === 'emotionGrid' && (
        <EmotionGridScreen
          entryQuadrant={entryQuadrant}
          selected={emotionSelected}
          onToggle={toggleEmotion}
          onBack={() => setScreen('logMethod')}
          onNext={() => setScreen('emotionReview')}
        />
      )}

      {screen === 'emotionReview' && (
        <EmotionReviewScreen
          selected={emotionSelected}
          context={emotionContext}
          onContextChange={setEmotionContext}
          onRemove={removeEmotion}
          onBack={() => setScreen('emotionGrid')}
          onSubmit={submitEmotionLog}
        />
      )}

      {screen === 'confirmation' && (
        <ConfirmationScreen
          chips={confirmChips}
          time={confirmTime}
          mode={confirmMode}
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
