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
import LogDetailScreen from './screens/LogDetailScreen';
import LogsScreen from './screens/LogsScreen';
import { ALL_LOGS, TODAY_KEY, formatClock, type LogEntry } from './data/mockLogs';
import type { Detected } from './lib/emotionDetect';
import type { EmotionSelection, Quadrant } from './theme/emotions';

type Screen =
  | 'home'
  | 'logMethod'
  | 'voice'
  | 'emotionGrid'
  | 'emotionReview'
  | 'logDetail'
  | 'logs'
  | 'chat'
  | 'account';

/** Where the user came from when entering the log-detail screen. The × close
 *  button uses this to return them to the right spot (home after a fresh
 *  log, or the logs history if they were tapping into a past log there). */
type DetailOrigin = 'home' | 'logs';

const PLACEHOLDER: Partial<Record<Screen, { title: string; body: string }>> = {
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
  const [logs, setLogs] = useState<LogEntry[]>(ALL_LOGS);

  // Log-detail screen state — id of the log being viewed + where to return
  // to when the user hits ×.
  const [viewingLogId, setViewingLogId] = useState<string | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>('home');

  // Emotion-selector flow state
  const [entryQuadrant, setEntryQuadrant] = useState<Quadrant>('hep');
  const [emotionSelected, setEmotionSelected] = useState<EmotionSelection[]>([]);
  const [emotionContext, setEmotionContext] = useState('');

  function submitVoiceLog(chips: Detected[], transcript: string) {
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
      body: transcript,
      chips: chips.map((c) => ({ text: c.text, quadrant: c.quadrant })),
    };
    setLogs((prev) => [...prev, entry]);
    openLogDetail(entry.id, 'home');
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
      body: emotionContext.trim() || undefined,
      chips: emotionSelected.map((s) => ({ text: s.name, quadrant: s.quadrant })),
    };
    setLogs((prev) => [...prev, entry]);
    openLogDetail(entry.id, 'home');
  }

  // ── Log-detail routing ─────────────────────────────────────────────
  function openLogDetail(id: string, origin: DetailOrigin) {
    setViewingLogId(id);
    setDetailOrigin(origin);
    setScreen('logDetail');
  }
  function closeLogDetail() {
    // Send the user back to wherever they entered from. 'logs' is still a
    // placeholder for now; routing to it just shows that placeholder.
    setScreen(detailOrigin);
  }
  function addToThisLog() {
    // TODO: implement true append semantics — for the prototype this just
    // opens a fresh log-method flow. The new entry becomes its own log; we'll
    // refactor to attach it to the parent log when the data model grows.
    setScreen('logMethod');
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
          onOpenLog={(id) => openLogDetail(id, 'home')}
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

      {screen === 'logDetail' && viewingLogId &&
        (() => {
          const log = logs.find((l) => l.id === viewingLogId);
          if (!log) return null;
          return (
            <LogDetailScreen
              log={log}
              onClose={closeLogDetail}
              onAddToLog={addToThisLog}
            />
          );
        })()}

      {screen === 'logs' && (
        <LogsScreen
          logs={logs}
          onOpenLog={(id) => openLogDetail(id, 'logs')}
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

      {/* Fixed-position fade overlays — sit above content (z:15) but
          below the pill nav (z:20). Top: solid white through the iOS
          safe-area then fades out, so content visibly fades behind
          the notch. Bottom: transparent at the top, solid white at
          the bottom, so content fades into the area under the nav. */}
      <div className="app-fade app-fade--top" aria-hidden="true" />
      <div className="app-fade app-fade--bottom" aria-hidden="true" />

      {showNav && <PillNav active={navTab} onSelect={handleNav} />}
    </div>
  );
}
