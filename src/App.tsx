import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import BlobField from './components/BlobField';
import GrainOverlay from './components/GrainOverlay';
import PillNav, { type NavTab } from './components/PillNav';
import HomeScreen from './screens/HomeScreen';
import LogMethodScreen from './screens/LogMethodScreen';
import VoiceScreen from './screens/VoiceScreen';
import EmotionGridScreen from './screens/EmotionGridScreen';
import StarburstSelectorScreen from './screens/StarburstSelectorScreen';
import EmotionReviewScreen from './screens/EmotionReviewScreen';
import LogDetailScreen from './screens/LogDetailScreen';
import LogsScreen from './screens/LogsScreen';
import AuthScreen from './screens/AuthScreen';
import IntroSplash from './components/IntroSplash';
import AccountScreen from './screens/AccountScreen';
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
  updateLogTopic,
  updateLogChips,
} from './lib/supabase';
import { buildGuestSeed, loadGuestLogs, saveGuestLogs } from './lib/guestSeed';
import {
  denormalizeTopics,
  getRootLogId,
  isInThread,
  setThreadTopic,
} from './lib/threads';
import LogThreadScreen from './screens/LogThreadScreen';
import TopicNamingPopup from './components/TopicNamingPopup';
import {
  consumeQuickLogQueryParam,
  initQuickLogCallback,
} from './lib/quickLogTrigger';
import {
  cancelTodayReminders,
  initReminderActionListener,
  scheduleReminders,
} from './lib/reminderScheduler';
import {
  ensurePushSubscribed,
  registerServiceWorker,
} from './lib/pushSubscribe';

type Screen =
  | 'home'
  | 'logMethod'
  | 'voice'
  | 'emotionGrid'
  | 'emotionReview'
  | 'logDetail'
  | 'logThread'
  | 'logs'
  | 'chat'
  | 'account';

/** Where the user came from when entering the log-detail screen. The × close
 *  button uses this to return them to the right spot (home after a fresh
 *  log, or the logs history if they were tapping into a past log there).
 *  'thread' = they tapped a card on the LogThreadScreen, so we return there. */
type DetailOrigin = 'home' | 'logs' | 'post-log' | 'thread';

const PLACEHOLDER: Partial<Record<Screen, { title: string; body: string }>> = {
  chat: {
    title: 'Chat',
    body: 'The communications tab with your therapist is out of scope for this prototype.',
  },
  // 'account' is a real screen now — see <AccountScreen /> below.
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
  const isGuest = auth.state.status === 'guest';

  // IntroSplash gating. Plays on every transition INTO an auth
  // screen state — cold load, page refresh, and the post-signOut
  // flip from 'authenticated' → 'unauthenticated'. Internal
  // AuthScreen tab switches don't change auth.state.status, so the
  // effect doesn't refire. No persistence (sessionStorage etc.) —
  // intentionally replays on every browser refresh per spec.
  const [showIntro, setShowIntro] = useState<boolean>(false);
  const prevAuthScreenRef = useRef<boolean | null>(null);
  useEffect(() => {
    const inAuthScreen = screenIsAuth;
    const prev = prevAuthScreenRef.current;
    prevAuthScreenRef.current = inAuthScreen;
    // Trigger on the rising edge: false/null → true.
    if (inAuthScreen && prev !== true) {
      setShowIntro(true);
    }
  }, [screenIsAuth]);

  const [screen, setScreen] = useState<Screen>('home');
  // Initial logs state precedence:
  //   guest      → restore from sessionStorage if present, otherwise
  //                seed 4 yesterday logs and start fresh
  //   Supabase   → start empty; fetchLogs fills it once authenticated
  //   mock/dev   → ALL_LOGS (180-day seed) so the prototype has data
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    if (isGuest) {
      return loadGuestLogs() ?? buildGuestSeed();
    }
    return supabase ? [] : ALL_LOGS;
  });

  // Guest mode: persist every logs change to sessionStorage so a
  // reload-in-tab keeps the same data. Cleared automatically on tab
  // close (sessionStorage lifetime).
  useEffect(() => {
    if (!isGuest) return;
    saveGuestLogs(logs);
  }, [logs, isGuest]);

  // If the user enters guest mode after the initial render (clicks
  // "Continue as guest" on the auth screen), seed the logs the moment
  // we know they're a guest and nothing is stored yet.
  useEffect(() => {
    if (!isGuest) return;
    const stored = loadGuestLogs();
    if (stored) {
      setLogs(stored);
    } else {
      const seed = buildGuestSeed();
      setLogs(seed);
      saveGuestLogs(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

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
        // Topic only lives on the root row in the DB — denormalize onto
        // every member of each thread so card / thread-screen rendering
        // is a direct field read.
        setLogs(denormalizeTopics(dbLogs.map(dbLogToLogEntry)));
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

  // Log-thread screen state — the root log id of the thread being viewed.
  const [viewingThreadRootId, setViewingThreadRootId] = useState<string | null>(
    null,
  );

  // "+ add to this log" state. When set, the next log submission attaches
  // to this thread root and (if the thread had no topic yet) fires the
  // topic-naming popup after submission.
  const [pendingParentLogId, setPendingParentLogId] = useState<string | null>(
    null,
  );
  // Root id whose topic the popup will name. Set right after a successful
  // "add to this log" submission, only if the thread had no topic yet.
  const [topicPromptRootId, setTopicPromptRootId] = useState<string | null>(
    null,
  );

  // Submission guard — second-line defense against the duplicate-log
  // bug: if a rapid second tap leaks past the screen's disabled UI,
  // the in-flight insert simply early-returns instead of double-writing.
  const submittingRef = useRef(false);

  // Which snap section LogMethodScreen should land on when it opens.
  // Reset to 'methods' on every entry except "back from emotion grid",
  // where the user expects to land on the category picker, not the
  // method picker they passed through on the way in.
  const [lmInitialSection, setLmInitialSection] = useState<
    'methods' | 'quadrants'
  >('methods');

  // Quick Log = the EXISTING voice flow ("Say it out loud." screen,
  // live transcript, manual stop, chip review, confirm), just entered
  // via a system shortcut and tagged `source: 'quick'` on submit so
  // the 7-day edit window applies instead of the 3-minute one.
  // Triggered by:
  //   • Control Center tile / AppShortcut → native dispatches the
  //     `tenor:quicklog` window event (see effect below)
  //   • tenor://quick-log URL → initQuickLogCallback below
  //   • ?quicklog=1 on mount (web testing) → consumeQuickLogQueryParam
  const quickEntryRef = useRef(false);
  function enterQuickLog() {
    quickEntryRef.current = true;
    setScreen('voice');
  }

  // Initial mount: honor ?quicklog=1 once and replace the URL so a
  // refresh doesn't re-trigger. iOS deep-link subscription set up in
  // a separate effect below.
  useEffect(() => {
    if (consumeQuickLogQueryParam()) enterQuickLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => initQuickLogCallback(enterQuickLog), []);

  // Web Push: register the service worker once at mount (no-op if
  // the browser doesn't support SWs). Subscribe + upsert happens
  // post-auth, see the effect below.
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  // Web Push routing bridge. The SW posts {type: 'tenor:reminder',
  // stage} when the user taps a push notification; we re-use the
  // same handlers as the iOS action listener: stage 1 → LogMethod,
  // stage 2 → tenor:quicklog. Also catches a `?reminderStage=`
  // query param the SW falls back to when no tab was already open.
  useEffect(() => {
    function route(stage: number) {
      if (stage === 2) {
        window.dispatchEvent(new Event('tenor:quicklog'));
      } else {
        setScreen('logMethod');
      }
    }
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; stage?: number } | null;
      if (data && data.type === 'tenor:reminder') route(data.stage ?? 1);
    }
    window.addEventListener('message', onMessage);

    // Cold-open-from-push fallback path: consume ?reminderStage=N once.
    const sp = new URLSearchParams(window.location.search);
    const stage = Number(sp.get('reminderStage'));
    if (stage === 1 || stage === 2) {
      route(stage);
      sp.delete('reminderStage');
      const search = sp.toString();
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (search ? '?' + search : ''),
      );
    }

    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After auth → subscribe to push (prompts permission if needed,
  // then upserts push_subscriptions row). No-op on iOS WebView and
  // unsupported browsers — those run the native scheduler instead.
  useEffect(() => {
    if (auth.state.status !== 'authenticated') return;
    void ensurePushSubscribed({ userId: auth.state.profile.id });
  }, [auth.state.status, auth.state.status === 'authenticated' ? auth.state.profile.id : null]);

  // Reminder action listener (iOS only — no-op on web). Stage 1 (even
  // id) takes the user to the Log Method screen. Stage 2 (odd id)
  // dispatches the same `tenor:quicklog` window event the Quick Log
  // shortcut uses, so the existing handler routes to VoiceScreen with
  // quickEntryRef = true (source: 'quick' → 7-day edit window).
  useEffect(
    () =>
      initReminderActionListener({
        onStage1: () => setScreen('logMethod'),
        onStage2: () => window.dispatchEvent(new Event('tenor:quicklog')),
      }),
    [],
  );

  // Native app-resume reschedule. When the app comes back to the
  // foreground, the device clock / DST may have shifted and any logs
  // since launch may have moved today's "logged" status — re-run the
  // rolling-window scheduler so what's queued matches reality.
  useEffect(() => {
    if (auth.state.status !== 'authenticated') return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;
      const { App: CapApp } = await import('@capacitor/app');
      const sub = await CapApp.addListener('resume', () => {
        if (auth.state.status !== 'authenticated') return;
        void scheduleReminders({
          profile: auth.state.profile,
          loggedTodayKey: logs.some((l) => l.dateKey === TODAY_KEY)
            ? TODAY_KEY
            : null,
        });
      });
      if (cancelled) {
        void sub.remove();
        return;
      }
      stop = () => void sub.remove();
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // Re-bind whenever the profile reference changes so the closure
    // reads the latest reminder_enabled / reminder_time values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.state.status, auth.state.status === 'authenticated' ? auth.state.profile : null]);

  // Initial + setting-change reschedule. Runs on auth → authenticated
  // and any time auth.state.profile changes (e.g. AccountScreen save).
  // Also re-runs when `logs` toggles "logged today" — flipping from
  // unlogged to logged needs to drop today's pending notifications.
  useEffect(() => {
    if (auth.state.status !== 'authenticated') return;
    const loggedToday = logs.some((l) => l.dateKey === TODAY_KEY)
      ? TODAY_KEY
      : null;
    void scheduleReminders({
      profile: auth.state.profile,
      loggedTodayKey: loggedToday,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    auth.state.status,
    auth.state.status === 'authenticated' ? auth.state.profile : null,
    logs.some((l) => l.dateKey === TODAY_KEY),
  ]);

  // Native AppDelegate dispatches a window event when the app launches
  // via the Quick Log Control Center tile / AppShortcut. We listen
  // here and enter the capture flow. The event-based path is more
  // reliable than the URL path on iOS 18 because `openAppWhenRun: true`
  // brings the app forward but the system ignores `OpensIntent` in
  // that case, so the URL never reaches Capacitor's appUrlOpen.
  useEffect(() => {
    function onTrigger() {
      enterQuickLog();
    }
    window.addEventListener('tenor:quicklog', onTrigger);
    return () => window.removeEventListener('tenor:quicklog', onTrigger);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emotion-selector flow state
  const [entryQuadrant, setEntryQuadrant] = useState<Quadrant>('hep');
  const [emotionSelected, setEmotionSelected] = useState<EmotionSelection[]>([]);
  const [emotionContext, setEmotionContext] = useState('');

  // Which selector variant to mount when the user picks "I'll pick from
  // emotions" — driven by profiles.emotion_ui. Guests have no profile
  // (and no DB write path), so they default to classic. `?starburst=1`
  // is a QA escape hatch to preview the starburst plane without a
  // signed-in account; `?starburst=0` forces classic.
  const emotionUiOverride =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('starburst')
      : null;
  const emotionUiVariant: 'classic' | 'starburst' =
    emotionUiOverride === '1'
      ? 'starburst'
      : emotionUiOverride === '0'
      ? 'classic'
      : auth.state.status === 'authenticated'
      ? auth.state.profile.emotion_ui
      : 'classic';

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

    // Pull and clear the pending thread root in one place so a partial
    // failure can't leave the next standalone log accidentally threaded.
    const parentLogId = pendingParentLogId;
    setPendingParentLogId(null);

    // Shortcut-entered voice logs are tagged 'quick' (7-day edit
    // window); normal in-app voice logs stay 'speak' (3-minute).
    // Consume the flag so the NEXT voice log isn't mis-tagged.
    const source = quickEntryRef.current ? ('quick' as const) : ('speak' as const);
    quickEntryRef.current = false;

    // Authenticated → write through Supabase, then mirror into local state
    // so the home week card refreshes immediately.
    if (auth.state.status === 'authenticated') {
      try {
        const result = await insertLog({
          mode: 'speak',
          source,
          dateKey: TODAY_KEY,
          body: transcript,
          parentLogId: parentLogId ?? null,
          chips: chips.map((c) => ({ text: c.text, quadrant: c.quadrant })),
        });
        const entry = dbLogToLogEntry(result);
        finalizeNewLog(entry, parentLogId);
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
      source,
      keywords: chips.map((c) => c.text),
      quadrants,
      body: transcript,
      chips: chips.map((c) => ({ text: c.text, quadrant: c.quadrant })),
      parentLogId: parentLogId ?? null,
    };
    finalizeNewLog(entry, parentLogId);
  }

  function pickQuadrant(q: Quadrant) {
    setEntryQuadrant(q);
    setEmotionSelected([]);
    setEmotionContext('');
    setScreen('emotionGrid');
  }

  // Starburst entry — bypasses the classic quadrant pick. Sets no
  // entryQuadrant (StarburstSelectorScreen doesn't need one).
  function pickStarburst() {
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

    const parentLogId = pendingParentLogId;
    setPendingParentLogId(null);

    // Starburst log row carries a single `base_emotion`. With multi-
    // select, the first chip's base wins — it's the lane the entry
    // lives on for the 6-lane visualisation. NULL when not in
    // starburst mode or when the user picked the centre "numb" chip.
    const logBaseEmotion = emotionSelected.find((s) => s.baseEmotion)?.baseEmotion ?? null;

    if (auth.state.status === 'authenticated') {
      try {
        const result = await insertLog({
          mode: 'select',
          source: 'select',
          dateKey: TODAY_KEY,
          body: emotionContext.trim() || null,
          parentLogId: parentLogId ?? null,
          baseEmotion: logBaseEmotion,
          chips: emotionSelected.map((s) => ({
            text: s.name,
            quadrant: s.quadrant,
          })),
        });
        const entry = dbLogToLogEntry(result);
        finalizeNewLog(entry, parentLogId);
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
      source: 'select',
      keywords: emotionSelected.map((s) => s.name),
      quadrants,
      baseEmotion: logBaseEmotion,
      body: emotionContext.trim() || undefined,
      chips: emotionSelected.map((s) => ({ text: s.name, quadrant: s.quadrant })),
      parentLogId: parentLogId ?? null,
    };
    finalizeNewLog(entry, parentLogId);
  }

  /** Shared finish step for both submission paths. Handles the four
   *  post-submit cases:
   *
   *    standalone log         → append + open LogDetailScreen (post-log)
   *    first addition         → append, propagate topic onto root, then:
   *                             if root has no topic yet → fire popup;
   *                             once popup confirms/skips → LogThreadScreen
   *    addition to named thread → append + propagate root's topic onto the
   *                             new child + open LogThreadScreen directly
   *
   *  Where the user lands after first addition is determined here: the
   *  popup's onConfirm/onSkip handlers route to LogThreadScreen. For
   *  subsequent additions we go straight there since there's no popup. */
  function finalizeNewLog(entry: LogEntry, parentLogId: string | null) {
    // Cycle done — today has a log. Cancel today's stage-1/2
    // reminders so they don't fire later in the day. Fire-and-forget,
    // no-ops on web. Stage 2 listener in scheduleReminders also
    // strips a delivered stage 1 if one is still sitting in
    // Notification Center.
    if (entry.dateKey === TODAY_KEY) {
      void cancelTodayReminders();
    }

    if (!parentLogId) {
      // Standalone — same as before threads.
      setLogs((prev) => [...prev, entry]);
      openLogDetail(entry.id, 'post-log');
      return;
    }

    // Thread append. Read the root's current topic from the latest
    // local state so we can stamp it onto the new child AND decide
    // whether to fire the popup.
    const rootId = parentLogId;
    const root = logs.find((l) => l.id === rootId);
    const existingTopic = root?.topic ?? null;
    const childWithTopic: LogEntry = { ...entry, topic: existingTopic };
    setLogs((prev) => [...prev, childWithTopic]);

    if (!existingTopic || existingTopic.trim() === '') {
      // First addition to an unnamed thread → popup, then thread screen.
      setTopicPromptRootId(rootId);
    } else {
      // Named thread → straight to thread screen.
      setViewingThreadRootId(rootId);
      setScreen('logThread');
    }
  }

  // ── Log-detail routing ─────────────────────────────────────────────
  function openLogDetail(id: string, origin: DetailOrigin) {
    setViewingLogId(id);
    setDetailOrigin(origin);
    setScreen('logDetail');
  }
  function closeLogDetail() {
    // Send the user back to wherever they entered from. Post-log returns
    // to home (most natural after-submission destination). Thread origin
    // returns to the LogThreadScreen they opened the detail from.
    if (detailOrigin === 'post-log') setScreen('home');
    else if (detailOrigin === 'thread') setScreen('logThread');
    else setScreen(detailOrigin);
  }
  /** Kick off the "add to this log" flow from a log detail or thread
   *  screen. Stashes the root id so the next submission attaches as a
   *  child, then drops the user into the normal log-method selector.
   *  Submission handlers consume + clear `pendingParentLogId`. */
  function addToThisLog(sourceLogId: string) {
    setLmInitialSection('methods');
    const source = logs.find((l) => l.id === sourceLogId);
    if (!source) {
      setScreen('logMethod');
      return;
    }
    setPendingParentLogId(getRootLogId(source));
    setScreen('logMethod');
  }

  /** Open a log thread by its root id. Standalone-log callers should
   *  use `openLogDetail` instead; the route is split intentionally. */
  function openLogThread(rootId: string) {
    setViewingThreadRootId(rootId);
    setScreen('logThread');
  }

  /** A card-tapped router: decide which screen to open based on whether
   *  the tapped log is in a thread. Used by HomeScreen + LogsScreen so
   *  they don't have to know about threads themselves. */
  function openLogFromCard(logId: string, origin: DetailOrigin) {
    const log = logs.find((l) => l.id === logId);
    if (log && isInThread(log, logs)) {
      openLogThread(getRootLogId(log));
    } else {
      openLogDetail(logId, origin);
    }
  }

  /** Persist a chip edit to a log within its edit window. Writes to
   *  Supabase first (when authenticated) so we can mirror the real
   *  `edited_at` into state; on insert error or guest/mock mode we
   *  fall back to a local-only update with a synthetic timestamp.
   *  Throws on Supabase error so LogDetailScreen can surface the
   *  message and keep the edit-mode UI open. */
  async function saveLogChips(
    logId: string,
    chips: { text: string; quadrant: Quadrant | null }[],
  ) {
    const newQuadrants = Array.from(
      new Set(chips.map((c) => c.quadrant).filter((q): q is Quadrant => q !== null)),
    );
    let editedAt = new Date().toISOString();
    if (auth.state.status === 'authenticated') {
      // Let the server be the source of truth for editedAt; rethrow so
      // the screen can show the error and let the user retry.
      editedAt = await updateLogChips(logId, chips);
    }
    setLogs((prev) =>
      prev.map((l) => {
        if (l.id !== logId) return l;
        return {
          ...l,
          keywords: chips.map((c) => c.text),
          quadrants: newQuadrants,
          chips: chips.map((c) => ({ text: c.text, quadrant: c.quadrant })),
          editedAt,
        };
      }),
    );
  }

  /** Persist a topic to the root + mirror it onto every thread member
   *  in local state. Called by the topic-naming popup AND the inline
   *  rename on LogThreadScreen. Pass empty/null to clear. */
  async function saveThreadTopic(rootId: string, topic: string | null) {
    const trimmed = topic?.trim() || null;
    setLogs((prev) => setThreadTopic(prev, rootId, trimmed));
    if (auth.state.status === 'authenticated') {
      try {
        await updateLogTopic(rootId, trimmed);
      } catch (err) {
        console.error('[tenor] updateLogTopic failed', err);
        // Local state already mirrors the intended value; on failure the
        // server-side topic stays stale until the next successful save.
      }
    }
  }

  /** Confirm or skip the first-addition topic popup. Either way we route
   *  to the thread screen after dismissing the modal. Skip leaves the
   *  topic NULL; the user can name it later via the inline rename. */
  function handleTopicConfirm(rootId: string, topic: string) {
    void saveThreadTopic(rootId, topic);
    setTopicPromptRootId(null);
    setViewingThreadRootId(rootId);
    setScreen('logThread');
  }
  function handleTopicSkip(rootId: string) {
    setTopicPromptRootId(null);
    setViewingThreadRootId(rootId);
    setScreen('logThread');
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
        {auth.state.status === 'unauthenticated' && (
          <AuthScreen
            onContinueAsGuest={auth.enterGuest}
            // Card is hidden while the splash is showing; flipping
            // to false at splash-unmount triggers the slide-up CSS
            // transition on `.auth-card`.
            cardHidden={showIntro}
          />
        )}
        {auth.state.status === 'needs-profile' && (
          <ProfileSetupScreen
            userId={auth.state.userId}
            email={auth.state.email}
            onComplete={() => auth.refresh()}
          />
        )}
        {/* Splash overlays the auth UI — the wordmark / form are
            already in the DOM underneath so the FLIP target rect
            resolves immediately on the lottie's onComplete. */}
        {showIntro && <IntroSplash onDone={() => setShowIntro(false)} />}
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
              ? // First name only in the greeting — full name is reserved
                // for the Account screen. Fall back to splitting
                // display_name for accounts created before the
                // first_name / last_name migration backfilled.
                (auth.state.profile.first_name ??
                  auth.state.profile.display_name?.trim().split(/\s+/)[0] ??
                  null)
              : isGuest
              ? null  // explicit "no name" → greeting renders without a name
              : undefined  // dev/mock → falls back to 'Rohan'
          }
          onLog={() => {
            setLmInitialSection('methods');
            setScreen('logMethod');
          }}
          onViewLogs={() => setScreen('logs')}
          onOpenLog={(id) => openLogFromCard(id, 'home')}
        />
      )}

      {screen === 'logMethod' && (
        <LogMethodScreen
          onBack={() => setScreen('home')}
          onSpeak={() => setScreen('voice')}
          onPickQuadrant={pickQuadrant}
          onPickStarburst={pickStarburst}
          emotionUi={emotionUiVariant}
          initialSection={lmInitialSection}
        />
      )}

      {screen === 'voice' && (
        <VoiceScreen
          demo={isDemo}
          onBack={() => {
            setLmInitialSection('methods');
            setScreen('logMethod');
          }}
          onConfirm={submitVoiceLog}
        />
      )}

      {screen === 'emotionGrid' && emotionUiVariant === 'starburst' && (
        <StarburstSelectorScreen
          selected={emotionSelected}
          onToggle={toggleEmotion}
          onBack={() => {
            // Starburst skips the classic quadrant picker — go back
            // to the method picker so the user can switch input mode.
            setLmInitialSection('methods');
            setScreen('logMethod');
          }}
          onNext={() => setScreen('emotionReview')}
        />
      )}
      {screen === 'emotionGrid' && emotionUiVariant !== 'starburst' && (
        <EmotionGridScreen
          entryQuadrant={entryQuadrant}
          selected={emotionSelected}
          onToggle={toggleEmotion}
          onBack={() => {
            // Land on the quadrant picker, not the method picker —
            // the user just came from a quadrant choice.
            setLmInitialSection('quadrants');
            setScreen('logMethod');
          }}
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
              onAddToLog={() => addToThisLog(log.id)}
              onSaveChips={saveLogChips}
            />
          );
        })()}

      {screen === 'logThread' && viewingThreadRootId &&
        (() => {
          const root = logs.find((l) => l.id === viewingThreadRootId);
          if (!root) return null;
          return (
            <LogThreadScreen
              rootLogId={root.id}
              allLogs={logs}
              onBack={() => setScreen('home')}
              onOpenLog={(id) => openLogDetail(id, 'thread')}
              onAddToLog={() => addToThisLog(root.id)}
              onRenameTopic={(name) => saveThreadTopic(root.id, name)}
            />
          );
        })()}

      {screen === 'logs' && (
        <LogsScreen
          logs={logs}
          emotionUi={emotionUiVariant}
          onOpenLog={(id) => openLogFromCard(id, 'logs')}
        />
      )}

      {screen === 'account' && auth.state.status === 'authenticated' && (
        <AccountScreen
          profile={auth.state.profile}
          onProfileUpdated={(next) => auth.applyProfile(next)}
          onSignedOut={() => {
            // Drop all in-memory log state so the next sign-in starts
            // clean. The auth state listener will flip us to
            // 'unauthenticated' and AuthScreen will render.
            setLogs([]);
            setScreen('home');
          }}
        />
      )}

      {topicPromptRootId && (
        <TopicNamingPopup
          onConfirm={(name) => handleTopicConfirm(topicPromptRootId, name)}
          onSkip={() => handleTopicSkip(topicPromptRootId)}
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
      {showNav && (
        <PillNav
          active={navTab}
          onSelect={handleNav}
          hide={isGuest ? ['account'] : []}
        />
      )}
    </div>
  );
}
