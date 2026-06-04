import { useEffect, useRef, useState } from 'react';
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
import AuthScreen from './screens/AuthScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import { ALL_LOGS, TODAY_KEY, formatClock, type LogEntry } from './data/mockLogs';
import type { Detected } from './lib/emotionDetect';
import type { EmotionSelection, Quadrant } from './theme/emotions';
import { useAuth } from './lib/useAuth';
import {
  supabase,
  fetchLogs,
  insertLog,
  dbLogToLogEntry,
} from './lib/supabase';

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
type DetailOrigin = 'home' | 'logs' | 'post-log';

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
  // Auth gate. When Supabase env vars aren't set, useAuth returns
  // 'disabled' and we render the full app on mocks — preserves the
  // pre-Supabase dev experience exactly. When they ARE set we route
  // through AuthScreen / ProfileSetupScreen until a profile exists.
  const auth = useAuth();
  const screenIsAuth =
    auth.state.status === 'unauthenticated' ||
    auth.state.status === 'needs-profile';

  const [screen, setScreen] = useState<Screen>('home');
  // Initial logs state: ALL_LOGS in mock/dev mode (no Supabase env vars
  // → fully offline preview), empty when Supabase is wired (real data
  // arrives via fetchLogs once the user authenticates).
  const [logs, setLogs] = useState<LogEntry[]>(() =>
    supabase ? [] : ALL_LOGS,
  );

  // When the user authenticates (or arrives already authenticated),
  // pull their real logs from Supabase. RLS guarantees we only get
  // rows they own. New accounts come back with [] → clean slate.
  // App-wide press haptic — fires `tap()` on any <button> click.
  // Capacitor's Haptics plugin no-ops on web/desktop, so this is safe
  // everywhere. Capture phase so it always runs even if a child stops
  // propagation. Skipped for disabled buttons.
  useEffect(() => {
    function onPointerDown(e: Event) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const btn = t.closest('button') as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      void import('./lib/haptics').then((h) => h.tap());
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  useEffect(() => {
    if (auth.state.status !== 'authenticated') return;
    let cancelled = false;
    fetchLogs()
      .then((dbLogs) => {
        if (cancelled) return;
        setLogs(dbLogs.map(dbLogToLogEntry));
      })
      .catch((err) => {
        console.error('[tenor] fetchLogs failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.state.status]);

  // Log-detail screen state — id of the log being viewed + where to return
  // to when the user hits ×.
  const [viewingLogId, setViewingLogId] = useState<string | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin>('home');

  // Submission guard — second-line defense against the duplicate-log
  // bug: if a rapid second tap leaks past the screen's disabled UI,
  // the in-flight insert simply early-returns instead of double-writing.
  const submittingRef = useRef(false);

  // Emotion-selector flow state
  const [entryQuadrant, setEntryQuadrant] = useState<Quadrant>('hep');
  const [emotionSelected, setEmotionSelected] = useState<EmotionSelection[]>([]);
  const [emotionContext, setEmotionContext] = useState('');

  async function submitVoiceLog(chips: Detected[], transcript: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitVoiceLogInner(chips, transcript);
    } finally {
      submittingRef.current = false;
    }
  }
  async function submitVoiceLogInner(chips: Detected[], transcript: string) {
    const now = new Date();
    const time = formatClock(now);
    const quadrants = Array.from(
      new Set(chips.map((c) => c.quadrant).filter((q): q is Quadrant => q !== null)),
    );

    // Authenticated → write through Supabase, then mirror into local state
    // so the home week card refreshes immediately.
    if (auth.state.status === 'authenticated') {
      try {
        const result = await insertLog({
          mode: 'speak',
          dateKey: TODAY_KEY,
          body: transcript,
          chips: chips.map((c) => ({ text: c.text, quadrant: c.quadrant })),
        });
        const entry = dbLogToLogEntry(result);
        setLogs((prev) => [...prev, entry]);
        openLogDetail(entry.id, 'post-log');
        return;
      } catch (err) {
        console.error('[tenor] insertLog (voice) failed', err);
        // Fall through to local-only entry so the user isn't blocked.
      }
    }

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
    openLogDetail(entry.id, 'post-log');
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

  async function submitEmotionLog() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submitEmotionLogInner();
    } finally {
      submittingRef.current = false;
    }
  }
  async function submitEmotionLogInner() {
    if (emotionSelected.length === 0) return;
    const now = new Date();
    const time = formatClock(now);
    const quadrants = Array.from(new Set(emotionSelected.map((s) => s.quadrant)));

    if (auth.state.status === 'authenticated') {
      try {
        const result = await insertLog({
          mode: 'select',
          dateKey: TODAY_KEY,
          body: emotionContext.trim() || null,
          chips: emotionSelected.map((s) => ({
            text: s.name,
            quadrant: s.quadrant,
          })),
        });
        const entry = dbLogToLogEntry(result);
        setLogs((prev) => [...prev, entry]);
        openLogDetail(entry.id, 'post-log');
        return;
      } catch (err) {
        console.error('[tenor] insertLog (emotion) failed', err);
        // Fall through to local-only entry so the user isn't blocked.
      }
    }

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
    openLogDetail(entry.id, 'post-log');
  }

  // ── Log-detail routing ─────────────────────────────────────────────
  function openLogDetail(id: string, origin: DetailOrigin) {
    setViewingLogId(id);
    setDetailOrigin(origin);
    setScreen('logDetail');
  }
  function closeLogDetail() {
    // Send the user back to wherever they entered from. Post-log returns
    // to home (most natural after-submission destination).
    setScreen(detailOrigin === 'post-log' ? 'home' : detailOrigin);
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

  // Render the auth flow before anything else when Supabase is on
  // and the user isn't fully authenticated. AuthScreen/ProfileSetupScreen
  // sit inside the same .app-root so the aurora backdrop is shared.
  if (screenIsAuth) {
    return (
      <div className="app-root">
        <BlobField />
        <GrainOverlay />
        {auth.state.status === 'unauthenticated' && <AuthScreen />}
        {auth.state.status === 'needs-profile' && (
          <ProfileSetupScreen
            userId={auth.state.userId}
            email={auth.state.email}
            onComplete={() => auth.refresh()}
          />
        )}
      </div>
    );
  }

  // 'loading' renders blank (just the aurora) — typical session check
  // resolves in <100ms from localStorage, so this is barely visible.
  if (auth.state.status === 'loading') {
    return (
      <div className="app-root">
        <BlobField />
        <GrainOverlay />
      </div>
    );
  }

  return (
    <div className="app-root">
      <BlobField />
      <GrainOverlay />

      {screen === 'home' && (
        <HomeScreen
          logs={logs}
          displayName={
            auth.state.status === 'authenticated'
              ? auth.state.profile.display_name
              : undefined
          }
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
              justSubmitted={detailOrigin === 'post-log'}
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

      {/* Top fade — always present so the iOS notch always blends.
          z:15 sits above content but below the pill nav (z:20). */}
      <div className="app-fade app-fade--top" aria-hidden="true" />

      {/* Bottom fade — only when the pill nav is on screen.
          Sized to end about halfway up the pill (gives the home-
          indicator + lower half of the pill a clean white plate). */}
      {showNav && (
        <div className="app-fade app-fade--bottom" aria-hidden="true" />
      )}
      {showNav && <PillNav active={navTab} onSelect={handleNav} />}
    </div>
  );
}
