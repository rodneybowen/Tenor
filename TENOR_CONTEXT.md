# Tenor — Full Project Context
*Feed this entire document to a new model to continue where we left off.*

---

## What is Tenor?

Tenor is a mobile-first mental health tracking app that bridges the gap between therapy sessions. Think a crossover between **How We Feel** (emotion logging) and **Headway** (therapist practice management platform). The core insight: therapists are flying blind during the week between sessions, and existing tools don't give patients flexible, nuanced ways to log how they're actually feeling.

**Positioning:** Tenor works in two modes: (1) as a **standalone app** for patients and therapists who want between-session emotional tracking without changing their existing platform, and (2) as a **feature layer embedded into existing therapy platforms** (primary target: Headway) — specifically its logging and data visualization capabilities. The core value proposition is the same either way: structured emotional data that makes therapy sessions more informed and efficient.

---

## The Problem

### The core problem with therapy as a format:
- Sessions are typically 50 minutes, once a week — sometimes once every 2–3 weeks. That's a tiny window to unpack a huge amount of emotional experience. Without between-session data, therapists walk in blind and patients spend half the session just recapping what happened instead of doing actual therapeutic work.

### Headway's limitations (from user's personal experience):
- Mood tracking is not intuitive or nuanced
- Weekly assessments sent by therapist are limited — don't capture the emotional texture of the week

### How We Feel's limitations:
- Input method is locked to their emotion wheel UI — no flexibility
- No voice memos, no journal photo scanning, no free-form journaling
- Great standalone app but has unnecessary features when thought of as part of a therapeutic relationship

---

## Core Product Decisions (all locked in)

### Visibility
All logs go to the therapist by default. No patient-controlled visibility toggle.

### Logging cadence
Patients can log as frequently as they want. However, the cadence of alerts/notifications prompting them to log is prescribed by the therapist. Like a therapist recommending a patient journal daily — the therapist sets the nudge frequency, but ultimately the patient logs whenever their mood or circumstances lead them to.

### Log immutability
Patients **cannot edit** a log after submission. They **can add to** a log (append new entries). The original log is a raw emotional snapshot — editing it retroactively would corrupt the data and let people self-censor in hindsight.

**Edit window exceptions (added Jun 9 2026):**
- **All logs:** 3-minute edit window after `logged_at`. Within those 3 minutes, users can modify emotion chips (add, remove, rename — same chip UX as the voice review screen). Transcript body and mode are NOT editable. After 3 minutes, permanently immutable; "add to this log" is the only path.
- **Quick Log (shortcut-triggered, `source: 'quick'`):** **7-day** edit window from `logged_at` — repeatedly editable until the window closes (bumped from one-shot on Jun 9 2026). Reasoning: users hit Quick Log on bad days when they don't have energy to triage. Consecutive bad days can stack up several quick logs the user can't review for a while. After 7 days the log locks like everything else.
- On save: write `edited_at TIMESTAMPTZ` to the log row. `source TEXT` field on `logs` distinguishes quick logs (`'quick'`) from regular speak logs (`'speak'`), type logs (`'type'`), and emotion selector logs (`'select'`).
- **`logged_at` is immutable.** Editing chips (or anything else) never touches `logged_at`. The timestamp always reflects when the recording happened, not when the user reviewed or edited it. `edited_at` is a separate field for provenance — it does not replace or overwrite `logged_at`.

### Timestamps
Every log entry and addition is clearly time-stamped. Therapists can see the full emotional arc (e.g., patient logged rage at 2pm, came back at 8pm with self-reflection).

### Therapist re-notification
If a patient adds to a log, the therapist is notified again. No one is left in unresolved concern.

### Input methods (patient side)
Three ways to log — patient chooses based on how they feel in the moment:
1. **Speak** — voice memo
2. **Type** — free-form text journal
3. **Emotion selector** — if they can't verbalize it, they select from a structured emotion grid

~~Scan~~ removed from scope — privacy concerns around image data and potential training data misuse.

These are **separate paths**, not combinable in one log entry (for now).

---

## User Scenarios

### Patient opens the app when:
1. Emotional spike — needs to get something out fast (panic, anger, sadness)
2. Therapist-set reminder fires
3. End-of-day fallback reminder — low-stakes, just a 30-second voice note or 1–3 adjectives

### Therapist opens the app when:
1. Before a session — reviewing the week's logs to walk in prepared
2. Notification of a concerning or updated patient log
3. During/after note review — managing patient data and habits

---

## Screen List (Patient Side)

1. **Auth screen** — sign in / sign up (email/password + Google OAuth), Patient/Therapist role chooser on signup (**built & deployed**)
2. **Profile setup screen** — for Google OAuth users + post-email-confirmation users; captures display name + role (**built & deployed**)
3. **Home screen** — greeting (dynamic by time of day + user's display name) + FAB + "This week's mood" card (**built & deployed**)
4. **Log-method selector** — 2 active bubbles: Speak, Type. Scan removed from scope entirely. (**built**; Type disabled)
5. **Voice logging screen** — record + review states (**built & deployed**)
6. **Text/journal screen** (not built — planned)
8. **Emotion selector — quadrant picker** (**built & deployed**)
9. **Emotion selector — fisheye grid + review** (**built & deployed**)
10. **Log detail / confirmation screen** (**built & deployed** — shared by Speak and emotion-selector flows, and also used when tapping a past log)
11. **Log history screen — D/W/M/Y views** (**built & deployed**)
12. **Communications ("Chat") tab** (placeholder only)
13. **Account tab** (placeholder only — sign-out + edit display name are the next adds)

Therapist side has not been designed yet. Focus is on patient side first.

---

## Build Status (as of 2026-05-30)

- **Repo:** https://github.com/rodneybowen/Tenor — `main` auto-deploys to GitHub Pages via GitHub Actions on every push. Live: **https://rodneybowen.github.io/Tenor/**
- **Stack:** Vite + React + TypeScript, `@phosphor-icons/react`, `@supabase/supabase-js`. App code lives in `tenor-app/`.
- **Vite base:** `'/Tenor/'` in production (capital T, repo-name-cased), `'/'` in dev.
- **Backend:** **Supabase live.** Auth (email/password + Google OAuth), Postgres schema with full RLS, `audit_log` write triggers, soft delete. Migration: `tenor-app/supabase/migrations/0001_init.sql`. Provisioning walkthrough: `tenor-app/supabase/README.md`. Production-HIPAA gaps (BAA, MFA, SELECT auditing, hard-delete job, Whisper BAA) are listed in the README — architecture is BAA-ready out of the gate.
- **Env vars:** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set as GitHub repo secrets; the deploy workflow forwards them to `npm run build`. Local: `.env.local` (gitignored). When missing → `useAuth` returns `'disabled'` and the app runs on in-memory mocks (preserves the no-DB dev experience).
- **TODAY** evaluates `new Date()` at module load — greeting, week card, and log timestamps all reflect the user's actual local date/time. `?demo=1` still injects a sample transcript so the Speak flow is testable without a mic.
- **Historical data:** 180 days of seeded logs generated with a Mulberry32 PRNG (deterministic), positioned relative to the current `TODAY`. Used only in mock/dev mode (when Supabase env vars are missing). Authenticated users start with `[]` and grow as they log.

### Done
- Home screen (aurora bg, blobs, grain, pill nav, "This week's mood" card — empty + populated). Greeting dynamically picks Good morning / afternoon / evening from local hour; name pulled from `profile.display_name`. Card auto-grows to fit all log entries (no internal scroll cropping).
- Speak flow: log-method → record → keyword review → confirmation
- Emotion-selector flow: quadrant picker → fisheye grid → definition card → review → confirmation
- Log detail screen: shared by post-log confirmation AND tapping a past log. Post-log layout swaps × for primary `back to home` + secondary `+ add to this log` + "logged successfully" indicator; past-log layout keeps × in the corner.
- Log history screen: D/W/M/Y toggle, period navigator (forward chevron auto-disables on future periods), Day/Week/Month/Year view bodies, drill-down, breakdown bubbles, Catmull-Rom mood line with per-segment gradient between node colors. Tapping **D** always anchors to today. 36px gap separates the log list from "Your day's mood" so the visualization reads as its own section.
- **Auth screens** — sign-in / sign-up (email/password + Google OAuth), Patient/Therapist role chooser on signup, `ProfileSetupScreen` for Google OAuth users + post-email-confirmation pre-fill from localStorage stash, H1 Tenor wordmark scoped to auth screens only.
- **Database (Supabase)** — profiles, therapist_patients, logs, log_chips, audit_log tables with row-level security on every table. AFTER triggers append every write to `audit_log` via a SECURITY DEFINER function. Soft delete (`deleted_at`) on user-generated rows.
- **Live data path** — when authenticated, `App.tsx` calls `fetchLogs()` on mount; `submitVoiceLog` / `submitEmotionLog` write through `insertLog()` and mirror the result into local state. RLS guarantees users see only their own rows. Falls back to local-only entry on insert error so the user isn't blocked.
- **Submit-busy UX** — both confirm buttons (Voice review ✓, Emotion review ✓) disable the moment they're tapped and swap their icon for a spinning Phosphor `CircleNotch`. App-level `submittingRef` is a second-line guard that hard-blocks duplicate inserts even if the UI debounce leaks. Retry buttons stay enabled so a hung insert can be canceled. Prevents the rapid-tap → multiple-rows bug seen on slow networks.
- **Guest mode** — "Continue as guest" button on auth screen with label "Your logs in guest mode will be lost once you close Tenor." No account required. Full patient-side app accessible. No Supabase writes — logs live in React state + sessionStorage (persist across reloads, lost on tab close). Greeting shows no name. Pre-seeded with 4 logs from yesterday (mixed quadrants/modes) so the app feels alive on first open; today starts empty.

### Open bugs / follow-ups
- ~~**"+ add to this log" is a stub**~~ — **built** Jun 4 2026.
- ~~**LogsScreen state resets**~~ — **fixed.**
- ~~**Bubble cluster layout is hand-tuned**~~ — **fixed.**
- **TODAY only evaluates on module load** — if the app stays open across midnight, the home week card doesn't roll over until refresh. Fix: lift to a hook polling on `visibilitychange` so the date rolls over when the user returns to the tab/app.
- ~~**Account tab**~~ — **built and live** Jun 4 2026 (`6e2f1cb`). Display name editable inline, account type pill, Link Google CTA / linked label, divider + Sign out. Hidden entirely from PillNav in guest mode. See "Detailed Flow: Account Tab" for the as-built spec.
- **Comms ("Chat") tab** is a placeholder only.
- **Therapist side not built** — schema supports it (RLS lets therapists read logs of patients linked in `therapist_patients`), but no UI exists.
- **iOS PWA + Google OAuth doesn't return to the app** — known platform limitation. When users tap "Continue with Google" inside a standalone PWA on iPhone, the OAuth flow opens in Safari (system browser), so the redirect lands there instead of back in the PWA — the PWA never sees the session and stays stuck on the login screen. Workarounds: (a) use email/password in the PWA, (b) add Apple Sign-In as a Supabase provider (its native bridge can return to the standalone app), or (c) ship a custom URL scheme / universal-link redirect target. Email/password sign-in is unaffected.
- **Stop button debounce not yet implemented** — disable stop button after each `onresult` until emotion detection pass completes. See "Detailed Flow: Voice Logging → Stop button debounce" for spec.
- **Edit window + edit pencil + edit window timer — built** (gate/pencil Jun 9-10, timer Jun 11 `b731d9e`). `src/lib/editGate.ts` (`canEdit` source-aware: 3-min for speak/type/select, 7-day for quick); pencil + inline chip edit in `LogDetailScreen` (`onSaveChips`, persists `edited_at` to Supabase when authed); `src/components/EditWindowTimer.tsx` (pie + `M:SS`, HEN-red final 30s, null for quick logs). Note `editedAt` is `string | null` (ISO), NOT epoch ms.
- **Quick Log shortcut — built** (Jun 10 2026). Control Center tile / AppShortcut / Siri / Action Button → opens the app into the normal `VoiceScreen` flow, tagged `source: 'quick'` (7-day edit window). NOT the "never opens the app" experience originally specced — that's impossible for a non-privileged app; see "Detailed Flow: Quick Log → What we tried and abandoned."

---

## Detailed Flow: Account Tab — built (Jun 4 2026)

A simple settings screen. No nested navigation — everything on one scrollable screen.

**Sections top to bottom:**

**Display name**
- Editable text field showing the user's current `display_name`
- Tapping it makes it inline-editable
- Save button appears when the field is dirty. Saves to `profiles.display_name` in Supabase and updates the home screen greeting immediately.

**Account type**
- Read-only pill or label showing "Patient" or "Therapist" (pulled from `profiles.role`)
- Not editable — no UI to change it. No explanation needed, just display it.

**Linked accounts**
- Only shown for users who signed up via email/password (i.e. no Google identity linked yet)
- A "Link Google account" button — triggers Supabase's `linkIdentity` flow for Google OAuth
- If Google is already linked, show "Google account linked" as a static label (no unlink option for now)

**Reminders** (built Jun 12 2026 — see "Detailed Flow: Notification / Reminder System")
- A section **below the Sign Out button**, behind a thin `.acct-divider` (revised from the original "between Linked accounts and Sign out" position — the sketch put App-Settings-style controls below the terminal CTA).
- A toggle: "Daily reminder" (on/off) — maps to `profiles.reminder_enabled` (default `true`). Saves immediately on flip.
- A time picker rendered as a Merriweather Light 24px **H2 with a dashed underline** (matches `.acct-name`'s edit affordance), with a transparent native `<input type="time">` absolutely positioned on top to catch taps and open the OS picker. Display uses 12h AM/PM via `formatDisplayTime()`; value persisted to Supabase stays 24h via `profiles.reminder_time` (default `20:00`). Disabled/dimmed when the toggle above is off. Saves on a 500ms debounce.
- Helper copy under the time picker: "We'll check in if you haven't logged a mood by this time."

**Sign out**
- A sign out button at the bottom, clearly separated from the rest
- On tap: calls `supabase.auth.signOut()`, clears local state, returns user to the auth screen
- No confirmation dialog needed

**Guest mode:**
- Account tab is not accessible in guest mode (nav tab is hidden or disabled for guests)

---

## Detailed Flow: Home → Log

### Home screen (pre-log)
- App name: **Tenor** (wordmark, small, top center)
- Background: blurry blob gradients in calming pastels — NOT a full-screen gradient wash. Think aurora effect: multiple circular blobs of color with heavy blur, drifting slowly. Use the **lightest shades (50–100)** from the emotion palettes: ribbon-blue-50 `#ECF2FF`, spring-green-50 `#EEFFF2`, bright-sun-yellow-50 `#FFFBEB`, coral-red-50 `#FFF1F1`. Keep them subtle — they're texture, not color.
- Very subtle grain overlay on top (barely visible — just texture)
- Centered: a large **"+" FAB button** (frosted glass, rounded, with subtle shadow)
- Below FAB: label "how are you feeling?" — visible, not whispered
- Bottom: **floating pill nav** (not a full bar — a pill shape floating above the bottom edge)
  - **4 items: Home, Logs, Chat, Account** (Phosphor icons + small label)
  - Generously spaced inside the pill
  - **Fully opaque solid white** (NOT frosted — `backdrop-filter` is unreliable / OS-suppressible; accessibility takes precedence. Depth comes from shadow only.)
- **"This week's mood" card** — weekly mood overview embedded in the home screen. Structure:
  - Section title: "This week's mood"
  - Row of 7 day dots (S M T W T F S). Days with logs show a **smooth gradient circle** (single-emotion = soft lit sphere of that hue; multi-emotion = quadrant colors blended edge-to-edge — **no hard pie slices**). Today is highlighted inside a pill/capsule shape. Future days = dashed empty circles.
  - Below the row: selected day label (e.g., "Thu, 21 May")
  - Below that: scrollable log entries for the selected day. Each log card shows keywords/emotions, mode icon, timestamp, and a gradient background blending the colors of the emotions logged.
  - If no entries for the selected day: "no logs today yet" message
- **`+ log your mood` and `view all logs` sit BELOW the card** (not inside it), and **both show on every day tab**:
  - **`+ log your mood`** (primary, dark) — opens the log-method selector
  - **`view all logs`** (secondary, calendar icon) — opens Log History (also activates the Logs nav tab)

### Tapping the + FAB
- **Prototype behavior (current):** Tapping the + FAB navigates directly to the log screen.
- **Intended final behavior (future):** The + splits in place into 2 bubbles with a spring animation (staggered ~50ms, spring easing). Greeting text compacts upward. Hero text appears: "Log how you're feeling today." Collapse on outside tap or scroll up. Implement after core flows are working.

### The 2 bubbles
- **Speak** (mic icon)
- **Type** (pen/write icon) — grayed out, disabled in prototype
- Each has a short label underneath

### Scrolling down from the bubbles screen
- Reveals the **Emotion Quadrant** (snap scroll, same screen — not a new page)
- This is the "Need help naming your feelings" path

---

## Detailed Flow: Voice Logging

Uses the browser's **Web Speech API** for live transcription (no backend needed for prototype). `?demo=1` injects a sample transcript so the flow is testable without a mic.

### Detection (as built)
Client-side affect analysis of the transcript — no backend. An emotion lexicon (explicit feeling words like "blue/sad/ecstatic/angry" **plus** colloquial tone words and short affect phrases like "so draining", "burned out") with light stemming ("draining"→"drained", "calmer"→"calm"). Each match maps to a quadrant (HEP/LEP/HEN/LEN) for color.

**Sentence-level detection (planned — text classification sprint):** Replace/augment the lexicon with a fine-tuned RoBERTa model (e.g. `cardiffnlp/twitter-roberta-base-emotion`) served from a lightweight inference endpoint (Hugging Face Spaces or Railway free tier). Lexicon stays as a fast first pass; RoBERTa runs as a fallback when keyword detection finds nothing. This catches sentences like "I just feel like nothing matters anymore" where no explicit emotion keyword exists. Maps RoBERTa output categories to HEP/LEP/HEN/LEN. No third-party LLMs — self-hosted fine-tuned model only.

### Recording state
- Title: "Say it out loud."
- Live transcript appears on screen as the user speaks
- Detected emotion words are **highlighted in blue with a dashed underline** in real time (punctuation kept outside the underline)
- Stop button at the bottom (square/stop icon inside a circle)
- **Stop button debounce:** After each `onresult` event (new speech arrives), the stop button disables immediately and stays disabled until the emotion detection pass completes on the latest transcript (whether or not keywords were found). This prevents the user from stopping mid-transcription before keywords are extracted. The button is never disabled on first render — only once speech starts arriving.
- Background gradient blobs shift and breathe (deferred to polish phase)

### Mic blocked / unsupported
- A **device-tailored popup** with the right steps: iOS (Settings → Safari → Microphone), Android (site permissions), desktop (address-bar mic icon), or "voice isn't supported here — use Chrome/Safari or the emotion picker." Buttons: **try again** / **go back**.

### After tapping stop — Review state (same screen, transitions in place)
- Mic icon appears at top
- The full transcript text fades/dims into the background
- Extracted keywords surface prominently below the faded transcript, as **quadrant-colored chips**. Tapping a chip turns it into an inline text field to **correct a mis-hearing**; an **✕** removes a chip; a **`+ add`** chip adds one. Edited text is re-classified to recolor it.
- Two buttons:
  - **✓ (confirm)** — submits the log → confirmation screen. The new log is added to app state so it immediately appears on "This week's mood."
  - **↺ (retry)** — clears everything and returns to the recording state

### Confirmation screen wiring
- Header **"added to log"**, timestamp + "Voice note", the chips. Buttons: **`+ add to log`** → log-method selector; **`view logs`** → home (today, where the new log now shows).

---

## Detailed Flow: Text Logging

- Open text area, Merriweather serif font, no prompts
- Placeholder: "start writing anything…"
- "log emotion ✓" button at the bottom (full-width, charcoal, rounded pill)
- **Validation:** Submit button is disabled until the user has entered at least 3 characters
- **Emotion extraction failure state:** If the app cannot extract emotions from the text, a popup appears:
  - Message: "failed to read your mood correctly. Would you like to retry or select from pre-written emotions?"
  - **Retry** button — restarts the flow from the beginning
  - **Select emotions** button — takes the user to the HEN/LEN/HEP/LEP quadrant screen

---

---

## Detailed Flow: Quick Log (iOS Shortcut) — built (as-shipped)

A logging mode triggered from **outside the app** via a Control Center tile / AppShortcut / Siri / Action Button. The product intent was "frictionless, eyes-free, never opens the app" (Shazam-style). **That intent is NOT achievable for a non-privileged third-party app — see "What we tried and abandoned" below. The shipped version opens the app into the normal voice flow.**

### As-shipped behavior
Tapping the Quick Log tile (or AppShortcut, Siri, Action Button) opens Tenor and drops the user **directly into the existing `VoiceScreen` flow** — the same "Say it out loud." screen used by the in-app Speak path: live transcript, emotion-word highlighting, **manual stop button** (waits for the user's tap — no silence auto-stop), chip review, confirm. The ONLY difference from an in-app speak log is that the log is tagged `source: 'quick'` so the **7-day edit window** applies instead of the 3-minute one.

From the Lock Screen, iOS requires Face ID before launching the app — unavoidable for any third-party app; not removable on free OR paid signing without special Apple entitlements.

### Trigger plumbing (native → JS)
1. **`ios/App/App/TenorAppIntent.swift`** — `QuickLogIntent: AppIntent` with `openAppWhenRun: true`. `perform()` writes `tenor.shouldStartQuickLog = true` to the App Group `UserDefaults` (suite `group.com.tenor.app`). Also declares `TenorAppShortcuts: AppShortcutsProvider` so the action is indexed into the Shortcuts gallery, Spotlight, Action Button, Siri. Added to BOTH App + TenorControlsExtension targets.
2. **`ios/App/TenorControls/QuickLogControl.swift`** — `QuickLogControl: ControlWidget` + `TenorControlsBundle: WidgetBundle` in the TenorControlsExtension target. The Control Center tile. iOS 18+.
3. **`ios/App/App/AppDelegate.swift`** — on `applicationDidBecomeActive`, reads + consumes the App Group flag. If set, after a 600ms delay (lets the WKWebView finish its initial JS load) it dispatches a `tenor:quicklog` window CustomEvent into the webview via `evaluateJavaScript`.
4. **`src/App.tsx`** — a `useEffect` listens for the `tenor:quicklog` window event and calls `enterQuickLog()`, which sets `quickEntryRef = true` and routes to `screen = 'voice'`. On submit, `submitVoiceLogInner` reads the ref and tags the log `source: 'quick'` (else `'speak'`), clearing the ref so the next normal voice log isn't mis-tagged.

**Why the App-Group-flag + window-event path** (not the simpler URL path): `openAppWhenRun: true` foregrounds the app but iOS then IGNORES a returned `OpensIntent`/`OpenURLIntent`, so `tenor://quick-log` never reaches Capacitor's `appUrlOpen`. The flag + bridge-dispatch is reliable on both Personal Team and paid signing. The old `tenor://quick-log` URL path + `?quicklog=1` web param still exist in `src/lib/quickLogTrigger.ts` as secondary triggers (web testing).

### What we tried and abandoned (do NOT re-attempt without reading this)
Spent a long session chasing the "never opens the app" Shazam experience. Dead ends, in order:
- **Native `QuickLogRecorder.swift` (AVAudioSession + SFSpeechRecognizer) + LiveActivity + Control tile toggle** — recording in the background with a Lock Screen LiveActivity. Got it technically working but: (a) the app still briefly foregrounds on launch (iOS gives no API for a third-party app to background itself — we even tried the private `suspend` selector, which is App-Store-rejectable and felt janky), (b) from Lock Screen a Face ID prompt is mandatory regardless. The whole native-recording stack (`QuickLogRecorder.swift`, `QuickLogAttributes.swift`, `QuickLogLiveActivity.swift`, the LiveActivity start/stop in AppDelegate) was **ripped out** in favor of "just open the voice screen."
- **True zero-friction (no app foreground, no Face ID)** requires either (a) **ShazamKit's `SHManagedSession`** — an Apple-private framework reserved for music recognition, not available for general speech, OR (b) **silent push notifications** to wake the app in the background — which needs an **APNs Auth Key**, only issuable to a **paid ($99/yr) Apple Developer account**. Neither is on the table now. If the paid account ever happens, the silent-push path is the only real way to get true Shazam-parity; budget ~1 day.
- **Bottom line for any future session:** the shipped "open app → voice flow" is the correct end state for free Personal Team signing. Don't rebuild the LiveActivity/native-recorder stack. Don't promise zero-friction without a paid account + APNs.

### Timestamp immutability
`logged_at` is set when `insertLog` runs (when the recording is confirmed). **Never updated** by a chip edit. `edited_at` is a separate field recording when an edit happened. The log always shows when the user *spoke*, not when they reviewed/corrected.

### Source field on all logs
`source: 'speak' | 'type' | 'select' | 'quick'` on `LogEntry` + the `logs` table. In-app voice → `'speak'`; shortcut-triggered voice → `'quick'`; emotion selector → `'select'`; text → `'type'`. Drives the edit-window gate (`lib/editGate.ts`): `'quick'` = 7 days, everything else = 3 minutes.

### Database additions
Migration `supabase/migrations/0003_log_edits.sql`:
- `ALTER TABLE logs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'speak'` — CHECK constraint `('speak', 'type', 'select', 'quick')`
- `ALTER TABLE logs ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ NULL`

### Xcode setup required (once per fresh clone — the Xcode target config isn't fully git-tracked)
- Widget Extension target **TenorControls** (Include Control checked, Configuration Intent unchecked).
- Delete Xcode's auto-generated `TenorControlsBundle.swift` template — our `QuickLogControl.swift` provides that struct.
- `QuickLogControl.swift` → TenorControlsExtension target only.
- `TenorAppIntent.swift` → BOTH App + TenorControlsExtension targets.
- **App Groups** capability `group.com.tenor.app` on BOTH targets.
- `Info.plist`: `NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription` (the in-app voice flow needs these), `tenor` URL scheme. (`UIBackgroundModes: audio` + `NSSupportsLiveActivities` were added during the abandoned native-recording attempt; harmless to leave, unused now.)
- Minimum Deployments **iOS 18.0** on both targets (ControlWidget is iOS 18+).
- The dead native files (`QuickLogRecorder.swift`, `QuickLogAttributes.swift`, `QuickLogLiveActivity.swift`) may still sit in `ios/` from the abandoned attempt — they're unreferenced; remove from the target if you want a clean build, or ignore.

---

## Detailed Flow: Logo Intro Animation (Splash) — built Jun 15 2026

### As-built notes (Jun 15 2026)
- Component: `src/components/IntroSplash.tsx` — overlays a fixed full-viewport blank aurora + grain on top of an already-rendered `AuthScreen` (the wordmark `<img>` is the FLIP target; renders from the start).
- Assets: `public/animations/intro.lottie` (compressed, primary) + `public/animations/intro.json` (uncompressed, load-error fallback). Filenames held in `INTRO_LOTTIE_SRC` + `INTRO_JSON_SRC` constants — swap by editing those two lines.
- Library: `@lottiefiles/dotlottie-react ^0.19.4`. The React component doesn't expose `onComplete` / `onLoadError` as props; we wire both via `dotLottieRefCallback` → `instance.addEventListener('complete' | 'loadError', …)`.
- Animation: lottie centered at 180×180, autoplay, no loop. On `complete`, the lottie's wrapper div is measured against `.auth-wordmark img` via `getBoundingClientRect()`; FLIP transform = `translate(dx, dy) scale(targetH / fromH)` with `transform-origin: top left`, 500ms `cubic-bezier(.4, 0, .2, 1)`. Double-RAF before applying the transformed value to guarantee the transition commits.
- Trigger: `App.tsx` keeps a `prevAuthScreenRef` + `showIntro` state; an effect with `screenIsAuth` as the dep fires `setShowIntro(true)` on the rising edge (false→true). This covers cold load, refresh, and post-`signOut` — but NOT internal AuthScreen tab switches (those don't change `auth.state.status`).
- Safety net: 8s timer in IntroSplash hands off via `onDone` if the lottie never reports `complete` (network hang, malformed asset).
- Aurora: dedicated `.intro-splash__blob--{a,b,c,d}` rules reuse the `--blob-*` color tokens but **without** the `drift` keyframes — "blank gradient," per spec.

---

## Detailed Flow: Logo Intro Animation (Splash) — original spec

Every time a **logged-out** user lands on `AuthScreen` — first load, refresh, or immediately after signing out — a one-time logo animation plays on a full-screen blank gradient, then the logo shrinks and settles into the exact spot where the static wordmark already lives on `AuthScreen` (`.auth-wordmark img`, `full-logo-dark.svg`, 40px height, centered, `margin: 8px 0 28px`).

### Trigger condition
- Plays on every **mount** of `AuthScreen` while there is no authenticated user — i.e. cold load, page refresh, and the transition back to `AuthScreen` right after `signOut()`.
- Does **not** replay on internal state changes that don't remount `AuthScreen` (e.g. switching between the Sign In / Sign Up tabs) — mount-only, via an empty-dependency effect or a `key` that only changes on the logged-out↔logged-in transition.
- No `sessionStorage`/`localStorage` gating — this is intentionally "every time," per the user.

### Visual sequence
1. **Background:** full-viewport blank gradient — reuse the existing `--blob-*` aurora tokens (`--blob-blue #DDE7FF`, `--blob-green #D7FFE2`, `--blob-yellow #FFF5C6`, `--blob-coral #FFDFDF`) and the `.grain` texture overlay already used elsewhere, but **static** (no drifting `.blob-a/b/c/d` animation) — "blank gradient," not the busy animated home backdrop.
2. **Logo animation:** the provided `.lottie`/`.json` animation plays once, centered on screen, at a large size (e.g. ~160–200px) — autoplay, no loop, no controls.
3. **On animation-complete:** the logo animates (CSS transition, ~400–600ms, ease-out) from its large centered position/size down to the exact size and position of `.auth-wordmark img` (40px height, centered horizontally, sitting at the top of `.auth-shell` with `margin: 8px 0 28px` + safe-area padding). Use a FLIP-style transform (measure both rects with `getBoundingClientRect`, animate `transform: translate() scale()` from the splash rect to the target rect) so it's a true "shrink and move," not a crossfade.
4. **Handoff:** once the shrink/move transition finishes, the splash overlay (gradient + animated logo) unmounts, revealing the normal `AuthScreen` underneath — including its existing static `.auth-wordmark img` and the auth card (sign in/up form), which fades/slides in per whatever entrance treatment `AuthScreen` already has (none currently — a simple opacity fade-in is fine).

### Assets
- User will provide a `.lottie` file and a `.json` file of the same animation (the `.lottie` is the compressed/preferred format; `.json` as fallback/source). Both go in `public/animations/` (create the folder) — exact filenames TBD when provided, but the component should reference them by a named constant so swapping is trivial.
- Library: `@lottiefiles/dotlottie-react` (renders `.lottie` directly via `<DotLottieReact src=... autoplay loop={false} onComplete={...} />`; can also load `.json` as a fallback if `.lottie` fails to load).

### Out of scope
- Native iOS launch screen (the static `LaunchScreen.storyboard`/asset shown before the WebView loads) is a separate, unrelated system — not touched by this spec. This animation runs *inside* the web app once it's loaded, on both web and the Capacitor iOS build (same WebView content).

---

## Detailed Flow: Notification / Reminder System — built Jun 12 2026 (commits `1299c68` → `5aa0c1e`)

Two-stage daily reminder, escalating from a gentle nudge to a one-tap voice log. Configurable per-user via the "Reminders" section on the Account tab (see "Detailed Flow: Account Tab"). **Covers both iOS (Capacitor local notifications) and web/PWA (Web Push)** — both platforms behave identically from the user's perspective.

### As-built notes (Jun 12 2026)

The spec below is the authoritative behavior. A few implementation choices to know:

- **iOS — distinct IDs, not same-id reschedule.** The spec flagged same-id vs distinct-id as an open question. Implementation went with distinct IDs (stage 1 = even, stage 2 = odd via `daysSinceEpoch(date) * 2 + (stage − 1)`) plus a `localNotificationReceived` foreground listener that strips stage 1 via `removeDeliveredNotifications` when stage 2 lands. Capacitor 8's same-id reschedule semantics don't document withdrawal of an already-delivered notification, so distinct IDs keep behavior on documented APIs. Field-test: if stage 1 lingers in Notification Center after stage 2 fires, swap to same-id — the body lookups are already keyed on stage so the rest of the file doesn't move.
- **Reminders section position on AccountScreen.** Sits **below** the Sign Out button behind a divider (`.acct-divider`), not between Linked account and Sign Out. The earlier spec line in the Account Tab section has been corrected to match.
- **Time picker rendered as H2.** A Merriweather Light 24px H2 with a dashed underline (matches `.acct-name`'s edit affordance) sits visually in place of an input box. A transparent native `<input type="time">` is absolutely positioned on top to catch taps and open the OS picker — avoids iOS's intrinsic time-input min-width that was overflowing the viewport. Display uses 12h AM/PM via `formatDisplayTime()`; the value persisted to Supabase stays 24h.
- **Web Push subscription is build-time gated by `VITE_VAPID_PUBLIC_KEY`.** The GitHub Pages workflow (`.github/workflows/deploy.yml`) passes the secret through to `npm run build` — without it, `pushSubscribe.ensurePushSubscribed` no-ops cleanly. The private half lives only as the `VAPID_PRIVATE_KEY` Supabase Edge Function secret.
- **Cron driver.** A `pg_cron` job (`send-reminders-every-5min`, every 5 minutes) calls the `send-reminders` Edge Function over `pg_net`. The function URL and a bearer cron secret are stored in Supabase Vault (`edge_send_reminders_url`, `edge_cron_secret`).

### Files (as built)
- `supabase/migrations/0006_reminders.sql` — profiles columns + `push_subscriptions` table + RLS.
- `supabase/migrations/0007_reminder_cron.sql` — `pg_cron` + `pg_net` extensions + the every-5-min schedule.
- `supabase/functions/send-reminders/index.ts` — Deno Edge Function, `npm:web-push@3`.
- `src/lib/reminderScheduler.ts` — iOS scheduler + cancel + action listener.
- `src/lib/pushSubscribe.ts` — service-worker register + `pushManager.subscribe` + upsert.
- `public/sw.js` — `push` + `notificationclick` handlers.
- `src/screens/AccountScreen.tsx` — Reminders UI.
- `src/App.tsx` — wiring (auth → schedule, resume → reschedule, message bridge, cold-open consumer, cancel on `finalizeNewLog`).


### Stage 1 — Initial reminder
- **Fires:** at `profiles.reminder_time` (default `20:00`), evaluated in the user's `profiles.timezone` (already populated at signup per "This weekend" log).
- **Condition:** only if `reminder_enabled = true` AND the user has not logged a mood yet for today (today = current date in the user's timezone).
- **Title:** "How was your day?"
- **Body:** "Looks like you haven't logged how you're feeling today. Make a quick log!" (Multiple title+body variants are a future enhancement — currently a 1-element `STAGE_1_VARIANTS` array on both platforms, so swapping in rotating phrases later is a localized change. Body intentionally no longer pulls `first_name`; the column is still selected in the Edge Function for future variants.)
- **Tap action:** opens the app to the **Log Method screen** (`LogMethodScreen` — the Speak/Type selector, "2 bubbles"). Normal navigation, no special source tagging.
- **Identifier:** deterministic per user-day, e.g. `daily-reminder-{YYYY-MM-DD}` (web push `tag`) / a derived int32 id (iOS, see below).

### Stage 2 — Follow-up ("quick voice" escalation)
- **Fires:** 30 minutes after the stage-1 time (`reminder_time + 00:30`).
- **Condition:** only if stage 1 was sent AND the user still has not logged a mood today (i.e. stage 1 was ignored/dismissed without producing a log).
- **Replaces stage 1:** uses the **same identifier** as stage 1, so the OS/browser withdraws the stage-1 notification and shows this one in its place (iOS: re-using a `LocalNotifications` request `id` removes the prior delivered notification with that id; web: push payload `tag` matches, so `showNotification` replaces it).
- **Title:** "Just a quick check-in"
- **Body:** "Just one word to describe your day."
- **Tap action:** opens the app **directly into the Speak/voice recording flow, already running** — i.e. the exact same entry path as the existing Quick Log shortcut (`enterQuickLog()` → `tenor:quicklog` window event → `VoiceScreen` with `quickEntryRef = true`). The resulting log is tagged `source: 'quick'`, giving it the existing 7-day edit window (`lib/editGate.ts`) — no new edit-window logic needed.

### "Already logged" cancellation
The moment a log is inserted (any source — speak, type, select, quick), that day's reminder cycle is done:
- **iOS:** cancel both scheduled local notifications for today's id(s) immediately after `insertLog` succeeds.
- **Web:** no client-side cancel is possible for a server-sent push that hasn't fired yet, so the **server-side sender checks "does a log exist for today" immediately before sending** each stage — if yes, skip sending and mark the cycle done.

### Per-user state tracking (new migration `0006_reminders.sql`)
Add to `profiles`:
- `reminder_enabled BOOLEAN NOT NULL DEFAULT true`
- `reminder_time TIME NOT NULL DEFAULT '20:00:00'`
- `last_reminder_date DATE` — the local date (user's timezone) this user's reminder cycle last ran for
- `last_reminder_stage SMALLINT NOT NULL DEFAULT 0` — `0` = nothing sent yet today, `1` = stage 1 sent, `2` = stage 2 sent / cycle complete

New table `push_subscriptions` (web push only):
- `id uuid pk default gen_random_uuid()`
- `user_id uuid references profiles(id) on delete cascade`
- `endpoint text not null unique`
- `p256dh text not null`, `auth text not null` (Web Push subscription keys)
- `user_agent text`, `created_at timestamptz default now()`
- RLS: users can insert/select/delete their own rows only.

### iOS — `@capacitor/local-notifications`
- New dependency: `@capacitor/local-notifications`. Request `LocalNotifications` permission once, at the same point onboarding already requests microphone/speech permissions (or immediately after, if that's cleaner).
- **Scheduling model:** on app launch and on app resume (`App.addListener('resume', ...)`), AND whenever the user changes `reminder_enabled`/`reminder_time` on the Account screen, **reschedule a rolling 7-day window** of stage-1 and stage-2 notifications:
  - For each of the next 7 days (including today, if `reminder_time` hasn't passed yet today), compute stage-1 fire time = that date @ `reminder_time` in the device's local time, stage-2 fire time = +30 min.
  - **Deterministic int32 ids:** `id = daysSinceEpoch(date) * 2 + (stage - 1)` → stage 1 = even id, stage 2 = odd id. `daysSinceEpoch` = days since 2026-01-01 (fits comfortably in int32 for the app's lifetime).
  - Schedule stage 2 with the **same notification content but `id` = stage-1's id ... ** — wait, see note below on same-id replacement vs. distinct ids; resolve this during implementation by testing actual iOS behavior (see "Open question" below).
  - Skip scheduling a day entirely if a log already exists for that date (only relevant for "today" on (re)schedule).
- **On successful `insertLog` for "today":** call `LocalNotifications.cancel({ notifications: [{ id: stage1IdForToday }, { id: stage2IdForToday }] })`.
- **Notification tap routing:** listen for `LocalNotifications.addListener('localNotificationActionPerformed', ...)`. If the tapped notification's id is even (stage 1) → navigate to `LogMethodScreen`. If odd (stage 2) → dispatch the same `tenor:quicklog` event used by the Quick Log shortcut.

**Open question for implementation (don't ask the user — pick the safer option and note the choice in the PR description):** iOS local notifications may not cleanly "replace" a delivered notification across two *different* scheduled requests with different ids the way same-id reschedule does. If same-id replacement across the 30-minute gap proves unreliable in testing, fall back to: schedule stage 2 with its own id, and on delivery of stage 2 also call `LocalNotifications.removeDeliveredNotifications` for stage 1's id (this requires the app to process the delivery in the background, which Capacitor supports via the same action-performed / received listeners). Ship whichever approach actually dismisses stage 1 when stage 2 arrives — visual replacement is the important UX outcome, the exact API path is an implementation detail.

### Web — Web Push
- **Service worker:** `public/sw.js` (plain JS, not bundled — Vite serves `public/` as-is). Handles:
  - `push` event → `event.waitUntil(self.registration.showNotification(title, { body, tag, data: { stage } }))`
  - `notificationclick` event → close the notification, then `clients.openWindow`/`clients.matchAll` + `focus` + `postMessage` to route: stage 1 → navigate to Log Method screen; stage 2 → dispatch the in-page equivalent of `tenor:quicklog` (post a message the running app listens for, same handler `App.tsx` already wires up for the native window event — add a `window.addEventListener('message', ...)` bridge that re-dispatches `tenor:quicklog`).
- **VAPID keys:** generate once with the `web-push` npm package's `generateVAPIDKeys()`. Public key → `VITE_VAPID_PUBLIC_KEY` (client env, safe to expose). Private key → Supabase Edge Function secret (`VAPID_PRIVATE_KEY`), never in client code/repo.
- **Subscription flow:** after login (and whenever notification permission is granted), client calls `Notification.requestPermission()`, then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VITE_VAPID_PUBLIC_KEY })`, then upserts the resulting `{endpoint, keys.p256dh, keys.auth}` into `push_subscriptions` for the current user.
- **Sender:** a Supabase Edge Function (`send-reminders`), invoked on a cron schedule via `pg_cron` **every 5 minutes**. For each profile with `reminder_enabled = true`:
  1. Compute "now" in the profile's `timezone`.
  2. If `last_reminder_date` != today (local) → reset `last_reminder_stage = 0`, `last_reminder_date = today`.
  3. If `last_reminder_stage = 0` AND local time >= `reminder_time` → check for a log today; if none, send stage 1 to all of the user's `push_subscriptions` rows, set `last_reminder_stage = 1`.
  4. Else if `last_reminder_stage = 1` AND local time >= `reminder_time + 00:30` → check for a log today; if none, send stage 2 (same `tag` as stage 1 so the browser replaces it), set `last_reminder_stage = 2`; if a log exists, just set `last_reminder_stage = 2` (cycle done, no send).
  5. Use `web-push` npm package (works in Deno Edge Functions via npm specifier) signed with the VAPID keys. On a `410 Gone`/`404` response, delete that `push_subscriptions` row (expired subscription).

### Out of scope for this pass
- Multiple rotating phrase variants for stage 1 (spec'd as a single-item array for easy future extension — see Stage 1 above).
- Android — not part of this prototype's target platforms; Capacitor `@capacitor/local-notifications` is cross-platform so it likely works, but no Android testing is in scope.

---

## Detailed Flow: Log History Screen

Reached via "view logs" on the confirmation screen, `view all logs` on the home card, or the Logs nav tab.

### Structure
- **D / W / M / Y toggle** at the top — switches between Day, Week, Month, Year views
- Left/right chevrons to navigate backward/forward in time. Forward chevron auto-disables at the current period.
- Period label in center (e.g., "April 6 — April 13" for week, "MARCH" for month, "2025" for year) — rendered in **Body font (Montserrat Regular 16px), NOT the heading font**. It's navigational info, not a heading; using Merriweather here makes it blend in with section titles.
- Drill-down: tapping a Week bar → Day view; tapping a Month cell → Day view; tapping a Year cell → Month view

### Day view
- Order: D/W/M/Y toggle → period nav (← Sat, 30 May →) → **"Your day's mood" mood line** → day's logs list. The mood line sits above the log list so the day's summary reads first, then the entries below act as the detail. `.logs-body { gap: 28px }` handles the spacing between sections.
- Tapping the **D** tab always anchors to today (not whichever date the previous view was anchored to). Drill-down from Week / Month / Year still routes to its specific target date.
- **Mood line:** smooth Catmull-Rom cubic Bézier per segment (C1-continuous through every interior point — no "two lines glued together"). **Trend-aware concavity:** descending chord → **cap** (curve above the chord = soft landing); ascending chord → **cup** (curve below the chord = uplifting, line ends pointing steeply up). **Per-segment gradient** between each pair of nodes' quadrant colors — the line morphs smoothly along the curve (e.g. coral → yellow flows through soft orange tones). Nodes stay solid at the quadrant color so the data points still read crisply.

- **Node granularity — emotion categories, not logs:** Each data point on the mood line represents a unique emotion *category* (quadrant) encountered, ordered by first appearance. A single log can generate 1–4 nodes. The rule is identical across all input modes: take the sequence of quadrants in encounter order, then deduplicate — keep only the first occurrence of each category; subsequent appearances of an already-seen category are silently dropped.

  - **Speak / Type:** categories are ordered by the position of the emotion keyword's first appearance in the transcript or text. e.g. "I've been sad and lonely... now I'm angry" → LEN → HEN. If the same category appears again later ("sad again") it doesn't add a second LEN node.
  - **Emotion selector:** categories are ordered by the user's selection sequence. e.g. selecting HEN, HEN, LEN, HEN, LEP → **HEN → LEN → LEP** (the second and third HEN are dropped because HEN was already recorded). e.g. HEN, HEN, LEN, HEN → **HEN → LEN**.

### Week view
- 7 vertical bars, one per day, colored by emotion type(s) logged. Segments stacked within the bar proportional to each quadrant's share. Dashed/empty bar = no logs or future day.
- "Your week's breakdown" — bubble chart where each bubble = one emotion quadrant, sized by frequency, colored by quadrant color. Bubbles are **fully opaque** (no translucent overlap), positions randomized per (view, anchor) via seeded PRNG so W/M/Y look different but stay stable per period. Subtle drift animation with randomized amplitude/duration/delay per bubble. Respects `prefers-reduced-motion`.

### Month view
- Calendar grid (7 columns). Each day = a circle. Single-emotion = soft lit-sphere gradient; multi-emotion = smooth blend (no hard pie slices). Future/empty days = dashed outline circles.
- "Your month's breakdown" — same bubble chart format.

### Year view
- 4×3 grid of months (Jan–Dec). Each month cell: **blurry quadrant-corner gradient blobs** — the dominant quadrant paints largest + most opaque. Future/empty months = dashed circle with month label.
- "Your year's breakdown" — same bubble chart format.
- View-switch fade-up animation on both the calendar body and the breakdown. Respects `prefers-reduced-motion`.

---

## Detailed Flow: Log Detail Screen

Shown after any log is submitted (voice or emotion selector) AND when tapping a past log in history.

- Header: **"added to log"** (Merriweather, centered)
- Shows: **Keywords** (chips), **Timestamp**, **Mode icon** (mic for speak, pen for type, grid for emotion selector)
- **× close button is contextual:** routes to home if you got here by submitting a log; routes back to the source list (week card / Logs view) if you tapped in from history
- **`+ add to this log`** (primary CTA) — see "Add to this log" flow below.
- **`view logs`** (secondary) — navigates to Log History

### Edit window + edit pencil (added Jun 10 2026)
Logs are editable for a short window after creation. `LogEntry.ts` (epoch ms, already exists, set at submission and never changed afterward) is the immutable "logged at" timestamp. Add `editedAt?: number` (epoch ms) — set the first/each time the user edits chips within the window.

`src/lib/editGate.ts` (new file) owns the windowing logic:
- `EDIT_WINDOW_MS = 3 * 60 * 1000` (3 minutes), for all logs in current scope.
- `editWindowEnd(log): number` → `log.ts + EDIT_WINDOW_MS`
- `remainingEditMs(log, now = Date.now()): number` → `editWindowEnd(log) - now`, floored at 0
- `canEdit(log, now = Date.now()): boolean` → `remainingEditMs(log, now) > 0`

While `canEdit(log)` is true, Log Detail Screen shows a pencil icon (Phosphor `PencilSimple`, regular weight) near the chip row. Tapping it enters edit mode: chips become add/remove/rename-able (same interaction as the voice review screen's chip editing). Saving sets `editedAt = Date.now()` and never touches `ts`. Transcript/body and mode are NOT editable. Once `canEdit` is false, the pencil disappears permanently — "add to this log" is the only path.

**Future hook (not built now):** if/when a `source` field and a longer-window log type are introduced, `editGate.ts`'s window constant should become a function of `source` rather than a flat constant, and `EditWindowTimer` below should grow a text-only "X hours/days left" mode for windows > 3 minutes. Don't build that branch yet — just don't make `EditWindowTimer` so rigid that it can't take a variable window later.

### Edit window timer (added Jun 10 2026)
Whenever the edit pencil shows (`canEdit(log)` true), pair it with a small depleting pie chart + countdown showing time left to edit.

**Visual:** SVG pie, 20px diameter, 2px stroke. Track = neutral-200, fill = neutral-700, depletes clockwise from 12 o'clock as time passes (full at 3:00 remaining, empty at 0:00). In the final 30 seconds, fill shifts to coral-500 as an urgency cue (functional use of color, same justification as quadrant colors). `M:SS` countdown text beside it, Montserrat Light 13px, neutral-500. Updates every second via `setInterval`.

When `remainingEditMs(log) <= 0`: render nothing — timer and pencil disappear together.

**Placement:**
- Log Detail Screen: small row next to the edit pencil, vertically centered with it.
- When the user enters edit mode (chips become editable), hide the timer — replaced by save/cancel controls.

---

## Detailed Flow: "Add to this log" — built (Jun 4 2026)

### Entry point
Tapping **`+ add to this log`** on any log detail screen sends the user through the normal log flow (log-method selector → speak/type/emotion selector → confirmation). Nothing looks different during the logging itself.

### After submission — topic naming popup
Immediately after the user successfully submits the new log, a popup appears asking them to name the topic of this thread. This is the first and only time they're prompted for a name.
- Popup copy: something like **"What's this about?"** with a short text field
- Confirm button saves the topic name to the thread
- The topic name can be renamed later by tapping the heading on the Log Thread screen (dashed underline signals it's tappable)
- Both logs are now linked via `parent_log_id` on the data model. All future additions to this thread append to the same parent.

### Thread data model
- Every log in a thread shares the same root `parent_log_id` (the original/first log's ID). No branching — tapping "+ add to this log" from any log in a thread always appends to the same root thread.
- A thread has a `topic` field (string, user-named) stored on the parent log.

### Related log card visual (in day view / history)
All log cards that belong to a thread look visually distinct from standalone logs:
- A small pill sits **on the bottom-right** of the card (half inside, half outside) with the label **"X logs"** where X = total number of logs in that thread (e.g. "2 logs", "3 logs", "15 logs"). Every card in the thread shows this pill with the same count.
- **No connector line** between cards on the home / day-view lists. Tried a same-day dotted connector during build; pulled because it felt inconsistent with cross-day threads (which never had one). The pill alone reads as the thread-membership cue on these surfaces.
- Tapping any pill-bearing card takes the user to the Log Thread screen regardless of position.

### Log Thread screen
Reached by tapping any related log card.

**Header:**
- **Topic name** in Merriweather, with a **dashed underline** to signal it's editable. Tapping it opens an inline text field to rename the topic.

**"Your mood on this topic" section:**
- Same Catmull-Rom mood line as the Day view, but the X axis is **chronological order of logs in the thread** (not time of day). Each dot = one log, colored by its quadrant(s). Shows how mood evolved across the thread over time.
- Colored band behind the line uses the same quadrant palette as the day view graph.

**Log list:**
- All logs in the thread listed chronologically, oldest first, each as a tappable card.
- **Date label on each card:** if the oldest log in the thread is within 6 days of today, show day + time (e.g. "Wed | 11:09 am"). If older than 6 days, show date + time (e.g. "9 Feb | 11:09 am").
- Tapping a card opens the normal Log Detail screen for that individual log.

**Chain connector:**
- A vertical **dotted line** runs in the gap between every consecutive item in the chain on this screen — card → card → "+ add to this log" button. Per sketch. Only on this screen; home / day-view lists don't use it.

**"+ add to this log":**
- Inline at the **end of the chain** (not a floating footer), self-centered, so the dotted line terminates at it visually. Goes through the normal log flow and appends to this thread. Topic naming popup does NOT re-appear (thread already has a name).

### Implementation notes (as built)
- **Storage:** `topic TEXT NULL` on `logs` (migration `supabase/migrations/0002_thread_topic.sql`). Stored ONLY on the root row. Children's `topic` stays NULL in the DB. After `fetchLogs`, `lib/threads.ts:denormalizeTopics` copies the root's topic onto every member of the thread so card rendering is a direct field read with no lookup.
- **Routing:** every place that tapped a card now calls `openLogFromCard(logId, origin)` in `App.tsx`. It looks at `isInThread(log, allLogs)` and routes to `LogThreadScreen` if it's a thread, `LogDetailScreen` otherwise. Standalone logs behave exactly as before.
- **Submit path:** `addToThisLog(srcLogId)` stashes the root id in `pendingParentLogId`, then dumps the user into the normal log-method flow. Both submit paths (voice + emotion) read and clear the stash, pass it as `parentLogId` to `insertLog`, then call `finalizeNewLog(entry, parentLogId)` which decides:
  - `parentLogId == null` → standalone log, open `LogDetailScreen` (post-log)
  - first addition to an unnamed thread → fire `TopicNamingPopup`, then `LogThreadScreen`
  - addition to a named thread → straight to `LogThreadScreen`
- **Topic popup dismissal:** confirm with text saves; skip / empty input / outside-tap / Escape all route through `onSkip` (topic stays NULL, user can name it later via the inline rename on the thread header). The popup only fires once per thread regardless of skip behavior.
- **`LogEntryCard` thread variant:** new optional `threadCount` prop renders the "X logs" pill via `.log-card__thread-pill` (bottom-right, half-in / half-out, label font: Montserrat 300, 11px, letter-spacing 0.04em). Cards inside `LogThreadScreen` do NOT pass `threadCount` — the count is redundant inside the thread context.
- **`DayLogList` wrapper:** thin wrapper around `LogEntryCard` that passes `threadCount = getThreadSize(entry, allLogs)` for each card. Used by Home (`WeekMoodCard`) and Logs day view. No connector line — see decision note below.
- **No connector on home / day-view lists.** Two earlier attempts shipped + reverted: (1) a continuous absolute-positioned line behind cards (z-index 0 with cards z-index 1) — failed because card backgrounds are translucent quadrant gradients and the line bled through visually; (2) per-gap segments between consecutive same-thread cards — pulled because it felt inconsistent against cross-day thread cards which never had a connector. The pill alone is now the signal on these surfaces.
- **In-thread chain connector (`LogThreadScreen` only).** `.lt-chain` is a flex column where each row contains a card + a 20px-tall vertical dotted `.lt-chain__line` segment below it. The last row's segment leads into the inline `.lt-chain__add` button. This is the only place a connector line is drawn anywhere in the app.
- **Mood line on `LogThreadScreen`:** `DayMoodLine` already used chronological-order X-axis (`i / (count - 1)`), so it was exported from `LogsScreen.tsx` and reused as-is. No new mood-line code.
- **Date label rule:** `formatDateLabel` in `LogThreadScreen.tsx`. If the OLDEST log in the thread is ≤6 calendar days from today, every card uses `Day | h:mm am`; otherwise every card uses `D Mon | h:mm am`. One format per thread, applied uniformly.
- **Topic field cleanup on render:** `denormalizeTopics` strips any stray `topic` value from logs whose thread has fewer than 2 members. Prevents an orphaned topic from showing on a card that's not actually in a thread (defensive — should never happen in practice).
- **What's not built yet:** Account tab still doesn't expose "exit guest" or "sign out" — those land when we build the Account tab properly.

---

## Detailed Flow: Emotion Selector

### Vocabulary note
**"Quadrant" is internal/code vocabulary only.** User-facing copy says **"category."** Keep "quadrant" in variable names, CSS classes, and helpers (e.g., `shadeQuadrant`).

### Quadrant picker (page 2 of the log-method screen — snap-scroll)
- Header: **"Need help naming your feelings?"** + subtitle "Pick a category to start exploring."
- 4 circular bubbles in a 2×2 grid (positives on the LEFT, negatives on the RIGHT):
  - **Top-left:** High Energy Positive (yellow)
  - **Top-right:** High Energy Negative (coral)
  - **Bottom-left:** Low Energy Positive (green)
  - **Bottom-right:** Low Energy Negative (blue)
- Each bubble shows only the full label ("HIGH ENERGY POSITIVE", small uppercase)
- Tapping a bubble opens the **emotion grid** centered on that quadrant

### Emotion grid (separate screen)
A pannable plane where all four quadrants' emotions live side-by-side; the user enters centered on the quadrant they picked but can pan to any other.

**Layout**
- Plane: chip cluster is 720W × 960H, plus 220px horizontal + 400px vertical scroll padding on every side (effective plane ≈ 1160 × 1760). Padding lets even the outermost chip reach the viewport center.
- Within each quadrant, 12 emotions on a 3×4 cell grid (CHIP=116px circle, GAP=4px, CELL=120px). Grid tilts toward the plane's outer corner — **strongest emotion in the corner, mildest near center**.
- Background: **plain white** (aurora bg suppressed so chip colors read cleanly).
- Top and bottom of the viewport: 64px `mask-image` linear-gradient fade so chips appear/disappear gradually.

**Chips**
- Circular, 116px, 16px Body Regular charcoal text.
- **Unselected:** light quadrant tint (alpha 0.4) — WCAG-safe for charcoal text (contrast > 10:1 on every quadrant).
- **Selected:** vibrant full-strength quadrant fill + thick 4px darker-quadrant ring (`shadeQuadrant(q, 0.35)`) + slightly bolder text.
- **All chips and dots use gradients, not flat fills** — single-quadrant = soft same-hue lit-sphere; multi-quadrant = smooth blend.

**Lite fisheye**
- Chips near viewport center inflate to scale **1.08**; chips at the fisheye radius edge (240px) shrink to scale **0.60** and fade to opacity **0.42**. Implemented via inline `transform`/`opacity` on every scroll rAF — no React re-render of 48 chips per tick.

**Navigation gestures**
- **Touch:** native overflow scrolling (free momentum + snap)
- **Trackpad:** native scroll (Mac biases to one axis — OS behavior, not fixable)
- **Mouse:** click-and-drag pan via pointer events for true 2D motion. 4px threshold separates tap from drag; post-drag click is swallowed so a chip under the cursor doesn't accidentally toggle. Cursor: `grab` → `grabbing`.
- **Snap:** CSS `scroll-snap-type: both proximity` + `scroll-snap-align: center` per chip — gentle, only snaps when scroll settles near a chip.

**Haptics (Web Vibration API)**
- Tap to select: `vibrate(12)`; deselect: `vibrate(6)`. On `scrollend` snap success: `vibrate(8)`.
- Real on Android Chrome/Edge; silent on iOS (Apple hasn't shipped Vibration API) and desktop. All calls guarded by `'vibrate' in navigator`.

**Definition card**
- Always shows the word + one-line definition of the **chip nearest the viewport center**.
- Word in **curly quotes** inside a tinted pill on the card's top edge (opaque — `tintQuadrant(q, 0.6, 1)`). Definition body centered in card.
- Source: `EMOTION_DEFINITIONS` map in `theme/emotions.ts`. `setState` only fires when the centered chip changes, not every scroll frame.

**Selection rules**
- Cap **5 emotions across all quadrants**. Counter pill at top: **"X selected · Y left"**.
- **next** button (footer, charcoal pill) — disabled until ≥1 selected.

**Current vocabulary**
Sourced from the user's published Google Sheet (CSV-pulled). If vocabulary list grows beyond 12 per quadrant, bump `COLS`/`ROWS` in `EmotionGridScreen.tsx` and cell-based geometry auto-resizes.

**Loading state (first open).** `useVocabulary` returns `vocab === null` until the CSV fetch resolves; the module-level cache means second open is synchronous. While `vocab === null && error === null`, the EmotionGrid renders a centered `CircleNotch` spinner (`.eg-loading` overlay) over a `visibility: hidden` viewport — chips stay mounted so refs / scroll listeners don't need to re-attach when loading flips off. The footer (definition card + next button) is omitted entirely until chips are present. On fetch error we fall through to `fallbackVocab()` / `EMOTION_DEFINITIONS` so the user is never blocked.
- **High Energy Positive:** Excited, Happy, Inspired, Grateful, Proud, Hopeful, Amused, Enthusiastic, Joyful, Elated, Cheerful, Optimistic
- **Low Energy Positive:** Calm, Content, Peaceful, Relaxed, Satisfied, Serene, Thankful, At ease, Tender, Accepted, Comfortable, Grounded
- **High Energy Negative:** Anxious, Angry, Stressed, Overwhelmed, Frustrated, Irritated, Panicked, Nervous, Furious, Tense, Agitated, Disgusted
- **Low Energy Negative:** Sad, Tired, Lonely, Hopeless, Empty, Melancholy, Disconnected, Numb, Bored, Exhausted, Disappointed, Defeated

### Review screen (after "next")
- Header **"Selected emotions"**
- Each picked chip in a removable row (✕ to drop without going back)
- Optional context field: **"What made you feel that way?"** (not required)
- Checkmark button → submits `mode: 'select'` log → shared **Log Detail screen** (renders grid icon + "Emotion picker" label)

---

## Detailed Flow: Emotion Selector v2 — Starburst Variant (speced Jun 15 2026, clarified Jun 22 2026, not yet built)

Two parallel variants of the emotion selector. Both are permanent — no A/B test framing. Users switch in Account settings at any time. **Classic variant stays exactly as-is.** Starburst adds new data fields to logs (see data model below).

### Variant definitions
- **`'classic'`** — existing 4-quadrant flat grid (HEP/LEP/LEN/HEN picker → fisheye chip plane). Default for all users unless explicitly changed.
- **`'starburst'`** — **6 base emotions** arranged radially on the same 2D pannable fisheye plane plus a **"numb" chip at the center**. No quadrant labels shown to the user. Tapping a base emotion reveals its sub-emotions blooming outward on the same plane. Outer Junto wheel ring (most specific emotions) is NOT shown in the grid — only accessible via speak/type NLP classification.

### Profiles columns (migration `0010_emotion_ui.sql`)
- `emotion_ui TEXT NOT NULL DEFAULT 'classic'` — current active variant

No usage counters, no prompt-shown flag, no initial-choice tracking — deliberate decision to avoid behavioral telemetry in a mental health context.

### No one-time prompt
There is no on-scroll prompt in `LogMethodScreen`. Variant is a settings toggle only (see AccountScreen toggle below). `LogMethodScreen` needs no changes for this feature.

### Starburst layout — coordinate system
The starburst is a 2D plane inside the same fisheye panning system as the classic grid. **The full starburst is NEVER visible at once.** Fisheye rules are identical: centered chip is large; only directly adjacent/connected chips are partially visible at the edges. Users pan to navigate.

- Same pan gestures (touch, trackpad, mouse drag), same haptics, same selection cap (5 emotions), same chip aesthetics (gradient lit-sphere).
- **Connecting lines** are drawn between chips: numb → each of the 6 base emotions, and base emotion → each of its sub-emotions (when expanded). Thin strokes in the palette's light shade.
- **Center chip — "numb":** at coordinates (0, 0). Neutral palette (neutral-200 background, neutral-700 text). Slightly larger chip — it's what fills the screen on load. No "get more specific" affordance. Tap to select → logs `emotion_name = 'numb'`, `base_emotion = null`.
- **Base emotions:** 6 chips at 60° increments, radius ≈ 220px from center. Clockwise from top: **Surprise** (0°), **Joy** (60°), **Love** (120°), **Fear** (180°), **Anger** (240°), **Sadness** (300°). Palette mapping: Surprise → Feijoa, Joy → Ripe Lemon, Love → Lilac Bush (500), Fear → Geraldine, Anger → Hit Pink, Sadness → Picton Blue.
- **Sub-emotions:** positioned radiating outward from their parent base emotion's coordinates (NOT from center), radius ≈ 180px from the base emotion chip. Equal angular spread fanning away from center. Sub-emotion chips use their parent's palette (lighter shade background, primary shade border/text). **Hidden by default.**

### "Get more specific" affordance — dotted line + badge
Each base emotion chip has a **dotted line** extending outward (away from center) to a small persistent badge that reads **"Get more specific?"** with a **"Yes, let's get specific"** tap target. This affordance is always present on every base emotion — it does not require a tap to appear; users see it as they pan near any base emotion chip.

- **Tap "Yes, let's get specific":** Dotted line animates to a **solid line**. Badge disappears and sub-emotion chips bloom outward from that base emotion's position. Breadcrumb at top updates to `[Base] →` (e.g., `Fear →`), Montserrat Label, neutral-400.
- **Ignore it:** User can pan freely or tap the base emotion chip to select it — sub-emotions never appear.
- **One expansion at a time:** When user taps "Yes" on a different base emotion, the previously expanded one collapses (solid → dotted, sub-emotions disappear). Only one base emotion expanded simultaneously.
- **"Numb" has no dotted line or badge** — tap-to-select only.

### Selection model
Nothing auto-selects. All selection requires an explicit tap on a chip.

- **Tap base emotion chip:** logs `emotion_name = 'fear'`, `base_emotion = 'fear'`. Works whether or not sub-emotions are expanded.
- **Tap sub-emotion chip:** logs `emotion_name = 'scared'`, `base_emotion = 'fear'`. Sub-emotion inherits parent palette for chip coloring.
- **Tap "numb":** logs `emotion_name = 'numb'`, `base_emotion = null`.
- Multi-select cap of 5 applies across the whole starburst plane (same as classic).
- **Breadcrumb:** blank at rest; `[Base] →` when a base emotion is expanded; clears when expansion collapses.

### Data model — logs table (migration `0010_emotion_ui.sql`)
Starburst mode requires two new columns on `public.logs`:
- `base_emotion TEXT` — the 6 base emotion names (`surprise | joy | love | fear | anger | sadness`), or NULL for classic-mode logs and "numb" selections.
- Classic-mode logs leave `base_emotion` NULL. Quadrant field (`hep/hen/lep/len`) remains on all logs unchanged.
- Visualizations switch based on `profiles.emotion_ui`:
  - **classic:** 4 horizontal category lanes (HEP / HEN / LEP / LEN) — current behavior unchanged
  - **starburst:** 6 category lanes in this order: **Surprise → Joy → Love → Fear → Anger → Sadness**, each colored by its palette primary (Feijoa-400, Ripe Lemon-400, Lilac Bush-500, Geraldine-400, Hit Pink-400, Picton Blue-400). No quadrant labels shown.
  - All chart components that read `quadrant` for lane/color assignment need a conditional path for starburst mode reading `base_emotion` instead.

### Starburst emotion hierarchy (sourced from the Junto Institute Emotion Wheel, Jun 15 2026)
Source of truth for sub-emotions is the wheel image — reproduce vocabulary from there, do not invent words.

```
Surprise  (Feijoa)   → stunned, confused, amazed, overcome, moved, stimulated,
                        astonished, awe-struck, speechless, astounded

Joy       (Ripe Lemon) → excited, optimistic, proud, cheerful, happy, content,
                          peaceful, enthusiastic, hopeful, playful, amused,
                          delighted, jovial, pleased, satisfied, serene, tranquil

Love      (Lilac Bush 500) → enchanted, romantic, affectionate, sentimental,
                              grateful, appreciative, thankful, nostalgic,
                              tender, compassionate, warmhearted, passionate,
                              enamored, rapturous, enthralled, jubilant, elated

Fear      (Geraldine) → scared, terrified, insecure, nervous, horrified,
                         frightened, helpless, panicked, hysterical, inferior,
                         inadequate, worried, anxious, mortified, dreadful

Anger     (Hit Pink)  → irritable, exasperated, enraged, hostile, jealous,
                         disgusted, hateful, agitated, frustrated, annoyed,
                         aggravated, resentful, envious, contemptuous, revolted

Sadness   (Picton Blue) → hurt, unhappy, disappointed, shameful, lonely,
                           gloomy, isolated, neglected, hopeless, depressed,
                           shocked, bewildered, disillusioned, perplexed,
                           agonized, disturbed, miserable, disheartened,
                           dismayed, displeased, regretful, guilty
```
Each sub-emotion inherits its parent base emotion's palette for coloring. Definitions reuse `EMOTION_DEFINITIONS` where the word exists; new words need brief definitions added to `theme/emotions.ts`.

### AccountScreen toggle
New `acct-section` between "Reminders" and "Sign out" labeled **"Emotion categories"**. Two-option inline selector (pill toggle, same styling as a segmented control):
- **"By intensity"** (← maps to `'classic'`)
- **"By type"** (← maps to `'starburst'`)
Saves immediately to `profiles.emotion_ui` on change. Only shown for authenticated users; hidden in guest mode.

---

## Design Principles

- **Web/mobile parity is mandatory.** Any feature, fix, or visual change that *can* apply to both the web (GitHub Pages PWA) and iOS (Capacitor) builds MUST be implemented for both — never ship something as iOS-only (or web-only) by default. The only acceptable exceptions are things gated by `Capacitor.isNativePlatform()` because the underlying capability genuinely doesn't exist on the other platform (e.g. native notifications, Control Center widgets, Taptic haptics). When a feature has a native-only piece (like push notifications), still build the best available equivalent for web (e.g. browser Notification API) rather than skipping it — and document the platform split explicitly in this file so it's never assumed to be "done everywhere" when it isn't.
- **Accessibility > style for critical UI.** Never depend on `backdrop-filter` (frosted-glass blur) for legibility — macOS "Reduce Transparency", GPU acceleration off, or certain browsers silently suppress it. The pill nav is therefore **fully opaque white**, not frosted. Frosted glass is fine as an *aesthetic* layer on non-critical surfaces (cards, FAB, bubbles).
- **Solid colors over translucency for content-critical surfaces.** Bubbles, chip fills, pill nav — opaque. Translucency causes bleed-through.
- **Rounded corners always** — softness and approachability, no sharp edges anywhere.
- **Calm but not pale** — colors have enough contrast to be visible but stay muted so they don't compete with content.
- **WCAG adherence is non-negotiable** — text contrast, info hierarchy, navigation, iconography.
- **HIPAA compliance in mind** — no certification yet, but every design and technical decision should be made as if we're pursuing it: end-to-end encryption, role-based access, no third-party data sharing, per-user data isolation.
- **Color restraint** — the UI should be ~90% neutrals. The four emotion colors (yellow/green/blue/red) are reserved for their functional meanings (HEP/LEP/LEN/HEN). They can appear lightly in backgrounds/blobs but should never be used decoratively elsewhere.
- **"Quadrant" is internal vocabulary only** — user-facing copy always says "category."
- **Verify on the deployed GitHub Pages link.** Localhost dev ≠ what's actually rendered. The Action republishes on every push to `main`; hard-refresh if iOS is caching.

---

## Design System

### Typography

**Reverted Jun 12 2026:** the two-preset "non-cursive"/"cursive" system (Vibur, `data-heading-style`, App Settings selector) was built then abandoned — see CHANGELOG. Back to a single type set:

| Role | Font | Weight | Size |
|---|---|---|---|
| Heading 1 | Merriweather | **Light** | 36px |
| Heading 2 | Merriweather | Regular | 24px |
| Heading 3 | Merriweather | Regular | 18px |
| Body | Montserrat | Regular | 16px |
| Label | Montserrat | Light | 16px |

**Decision (Jun 12 2026):** the home screen's `.greeting` (Heading 1, `font-weight: 300`/Light) is the canonical H1 look — apply it everywhere. Update the bare `h1` element rule's `font-weight` from `400` to `300` so every H1 (including `.acct-title` on Accounts) matches `.greeting`. H2/H3 stay Regular (400) — only H1 weight changes. `--font-serif` (`'Merriweather', Georgia, serif`) and `--font-sans` (`'Montserrat', system-ui, sans-serif`) remain the only two heading/body font variables.

Not Material 3's default Roboto — these are Tenor's brand fonts.

### Color Palettes

> Use neutrals for ~90% of the UI. Emotion colors are functional — reserved for their categorical roles only. Light shades (50–200) can be used in background blobs/gradients. Saturated shades (400–600) are for functional UI only.

#### Classic variant quadrant palette (HEP / LEP / LEN / HEN)
Used by the classic emotion selector, mood line, weekly dots, breakdown bubbles, and any screen that references the 4-quadrant system. **400 is the functional primary for each.**

> **Note (Jun 15 2026):** These quadrant colors remain in use for the classic variant. The starburst variant uses the per-emotion palette below instead, with no quadrant labels exposed to the user. Internally, each starburst base emotion maps to a quadrant for data storage compatibility — see "Emotion Selector v2" spec.

#### Starburst variant — per-base-emotion palette (added Jun 15 2026)
Six named palettes, one per base emotion (6 base emotions = 6 palettes, perfect 1:1). **400 is the primary for each** — exception: Lilac Bush uses **500 as de facto primary** since 400 is too light relative to the other five.

**Palette → emotion mapping (override from sketch if it differs):**

| Base Emotion | Palette | Primary shade |
|---|---|---|
| Surprise | Feijoa | 400 |
| Joy | Ripe Lemon | 400 |
| Love | Lilac Bush | **500** |
| Fear | Geraldine | 400 |
| Anger | Hit Pink | 400 |
| Sadness | Picton Blue | 400 |

**Geraldine** *(starburst: Fear @ 400)*
| Shade | Hex |
|---|---|
| 50 | `#fef2f2` |
| 100 | `#ffe1e2` |
| 200 | `#ffc9ca` |
| 300 | `#fea3a5` |
| 400 | `#fc7679` |
| 500 | `#f43f43` |
| 600 | `#e12125` |
| 700 | `#bd181c` |
| 800 | `#9d171a` |
| 900 | `#821a1c` |
| 950 | `#470809` |

**Hit Pink** *(starburst: Anger @ 400)*
| Shade | Hex |
|---|---|
| 50 | `#fff4ed` |
| 100 | `#ffe6d5` |
| 200 | `#fec8aa` |
| 300 | `#fda477` |
| 400 | `#fb713c` |
| 500 | `#f94b16` |
| 600 | `#ea310c` |
| 700 | `#c2210c` |
| 800 | `#9a1c12` |
| 900 | `#7c1a12` |
| 950 | `#430907` |

**Ripe Lemon** *(starburst: Joy @ 400)*
| Shade | Hex |
|---|---|
| 50 | `#fdfee8` |
| 100 | `#fdffc2` |
| 200 | `#ffff88` |
| 300 | `#fff844` |
| 400 | `#feeb11` |
| 500 | `#fbdd04` |
| 600 | `#cea500` |
| 700 | `#a47604` |
| 800 | `#875c0c` |
| 900 | `#734b10` |
| 950 | `#432705` |

**Feijoa** *(starburst: Surprise @ 400)*
| Shade | Hex |
|---|---|
| 50 | `#f4f9ec` |
| 100 | `#e5f0d7` |
| 200 | `#cde3b3` |
| 300 | `#a9ce80` |
| 400 | `#8fbc5f` |
| 500 | `#71a141` |
| 600 | `#567f31` |
| 700 | `#436229` |
| 800 | `#384f25` |
| 900 | `#314423` |
| 950 | `#17240f` |

**Picton Blue** *(starburst: Sadness @ 400)*
| Shade | Hex |
|---|---|
| 50 | `#f1f9fe` |
| 100 | `#e3f1fb` |
| 200 | `#c0e3f7` |
| 300 | `#89cdf0` |
| 400 | `#51b7e7` |
| 500 | `#229bd5` |
| 600 | `#147cb5` |
| 700 | `#126392` |
| 800 | `#135479` |
| 900 | `#154765` |
| 950 | `#0e2d43` |

**Lilac Bush** *(starburst: Love @ 500)*
| Shade | Hex |
|---|---|
| 50 | `#f7f5fd` |
| 100 | `#f0ecfb` |
| 200 | `#e4dcf8` |
| 300 | `#d0c1f1` |
| 400 | `#b79de8` |
| 500 | `#a178de` |
| 600 | `#8f57d0` |
| 700 | `#7f44bd` |
| 800 | `#6a399e` |
| 900 | `#583082` |
| 950 | `#381e57` |

**Neutral**
| Shade | Hex |
|---|---|
| 50 | `#FAFAFA` |
| 100 | `#F5F5F5` |
| 200 | `#E6E6E6` |
| 300 | `#D6D6D6` |
| 400 | `#A5A5A5` |
| 500 | `#767676` |
| 600 | `#575757` |
| 700 | `#434343` |
| 800 | `#222222` |
| 900 | `#1A1A1A` |
| 950 | `#0A0A0A` |

**Ribbon Blue** *(= LEN — Low Energy Negative)*
| Shade | Hex |
|---|---|
| 50 | `#ECF2FF` |
| 100 | `#DDE7FF` |
| 200 | `#C2D2FF` |
| 300 | `#9CB3FF` |
| 400 | `#758AFF` |
| 500 | `#4756FF` |
| 600 | `#3637F5` |
| 700 | `#2D2AD8` |
| 800 | `#2525AE` |
| 900 | `#262889` |
| 950 | `#161650` |

**Spring Green** *(= LEP — Low Energy Positive)*
| Shade | Hex |
|---|---|
| 50 | `#EEFFF2` |
| 100 | `#D7FFE2` |
| 200 | `#B2FFC7` |
| 300 | `#59FF89` |
| 400 | `#33F56C` |
| 500 | `#09DE48` |
| 600 | `#01B837` |
| 700 | `#05902F` |
| 800 | `#0A712A` |
| 900 | `#0A5D25` |
| 950 | `#003412` |

**Bright Sun Yellow** *(= HEP — High Energy Positive)*
| Shade | Hex |
|---|---|
| 50 | `#FFFBEB` |
| 100 | `#FFF5C6` |
| 200 | `#FFEA88` |
| 300 | `#FFD847` |
| 400 | `#FFC620` |
| 500 | `#F9A407` |
| 600 | `#DD7C02` |
| 700 | `#B75706` |
| 800 | `#94430C` |
| 900 | `#7A370D` |
| 950 | `#461B02` |

**Coral Red** *(= HEN — High Energy Negative)*
| Shade | Hex |
|---|---|
| 50 | `#FFF1F1` |
| 100 | `#FFDFDF` |
| 200 | `#FFC5C5` |
| 300 | `#FF9E9D` |
| 400 | `#FF6564` |
| 500 | `#FF4847` |
| 600 | `#ED1615` |
| 700 | `#C80E0D` |
| 800 | `#A5100F` |
| 900 | `#881514` |
| 950 | `#4B0404` |

### Surface Style
- **Frosted glass** for *aesthetic* surfaces (cards, FAB, bubbles): `background: rgba(255,255,255,0.65–0.75)` with `backdrop-filter: blur(14–16px)`
- Borders: `rgba(255,255,255,0.82)` — white-ish, glassy
- Shadows: soft, `rgba(34,34,34,0.08–0.12)`
- **Never depend on `backdrop-filter` for legibility** — it is silently dropped under macOS "Reduce transparency," with GPU accel off, and in some browsers. Any surface that overlaps content must stay legible without it. The pill nav is therefore **fully opaque solid white**. Verify visuals on the **deployed link**, not just local dev.

### Shape
- **Everything is rounded.** Pills (50px border-radius) for buttons and nav. Circles for FABs and bubbles. 24px border-radius for cards and text areas.

### Spacing
- All spacing follows a **4px base grid** — every margin, padding, and gap must be a multiple of 4px (4, 8, 12, 16, 20, 24, 32, 40, 48…)
- Phone real estate is precious — use ample spacing *between sections* to let content breathe, but don't crowd individual elements together
- **Consistent alignment and margins throughout** — elements should align to a clear set of horizontal margins, no arbitrary offsets

### Grain
- Very subtle canvas grain overlay. Opacity: ~4/255 (barely there). Adds tactile texture — should NOT be visible as noise, only felt.

### Icon Library
- **Phosphor Icons** — `@phosphor-icons/react` npm package. Use `regular` or `light` weight to match the soft, approachable tone.

### Component Framework
- Material Design 3 (M3) for components (FAB, chips, navigation, buttons)
- Custom brand fonts, colors, and icons override M3 defaults

---

## Navigation

### Bottom pill nav
- Floating pill shape, NOT a full-width bar
- **Fully opaque solid white** (NOT frosted — accessibility decision; see Surface Style)
- **4 items: Home, Logs, Chat, Account** (Phosphor icons + small label)
- Each nav button: ~76px wide, 48px tall, 28px border-radius
- Active state: slight charcoal background tint
- `view all logs` (on the home card) opens the Logs tab; the FAB / `+ log your mood` opens the log-method selector

### Back navigation
- Every screen has a **circular back button in the top-left** — left arrow icon (Phosphor `ArrowLeft`), no label text

### Screen transitions
- Smooth fade + slight upward translateY (0.3s, cubic-bezier(.4,0,.2,1))

---

## Technical Stack

- **Frontend:** React (prototype) → React Native with Expo (real build). **As built: Vite + React + TypeScript** in `tenor-app/`.
- **Deployment:** GitHub Pages — repo `github.com/rodneybowen/Tenor`, auto-deployed from `main` by `.github/workflows/deploy.yml`. Live: `https://rodneybowen.github.io/Tenor/`
- **Build rule:** Always run `npm run build` before pushing. It runs `tsc -b && vite build` (strict) — catches type errors the dev server doesn't.
- **Vite base:** `'/Tenor/'` in production, `'/'` in dev.
- **Database & Auth:** Supabase (future)
- **Voice transcription:** OpenAI Whisper (future; prototype uses Web Speech API)
- **OCR / image text recognition:** Google Vision API (future)
- **Backend logic:** Supabase Edge Functions or Railway (future)

### Orientation
**Tenor is portrait-locked** (`ios/App/App/Info.plist` → `UISupportedInterfaceOrientations` = Portrait only, iPhone + iPad). The web layouts are fixed-width mobile (max 430px) and not landscape-friendly, so rotation is disabled app-wide until responsive landscape support is built. If you ever add landscape layouts, re-add the landscape orientation strings to the plist.

### iOS PWA notes
`100dvh` doesn't always include the home-indicator safe area. Current defenses layered: body bg = aurora gradient, blobs + grain `position: fixed` in standalone mode, pill nav `position: fixed` in standalone mode. Top extends behind the status bar (`viewport-fit=cover` + `apple-mobile-web-app-status-bar-style: default` — `black-translucent` was tried but reshaped the viewport math and pushed the nav up). **Pick one trade-off and move on** rather than chasing both edges perfectly.

---

## Prototype Scope

Building in **React**, deployed to **GitHub Pages**. Mobile viewport, max-width 430px centered.

### In scope (all built):
1. ✅ Home screen — "This week's mood" card, empty + populated states
2. ✅ Speak flow — Web Speech API live transcription, keyword review, confirm/retry
3. ✅ Emotion selector flow — quadrant picker, fisheye grid, definition card, snap + haptics, review
4. ✅ Log detail / confirmation screen — shared by Speak + emotion-selector, and past log view
5. ✅ Log history screen — D/W/M/Y views, period navigator, breakdown bubbles, Catmull-Rom mood line

### Out of scope for now:
- Type/text logging flow
- Communications tab (placeholder only)
- Profile/Account tab (placeholder only)
- Therapist side
- FAB split animation (functional nav first, polish later)

### Data persistence:
**Authenticated users:** Logs read from and written to Supabase in real time. RLS guarantees each user sees only their own rows. Falls back to local-only state on insert error so the user isn't blocked.
**Guest mode:** React state + sessionStorage only. Persists across reloads within the same tab. Lost on tab close or session expiry.
**Dev (no env vars):** Falls back to in-memory mocks so the UI can be iterated without a DB connection.

---

## Active Sprint (as of 2026-05-29)

### NEXT UP (added Jun 12 2026) — Branding: logo, app icon, favicon

**Branding built (Jun 12 2026, pushed `8c841d2` + `9a84658`):**
- Web favicon → `public/favicon.svg` = `t logo.svg` color-gradient mark.
- PWA → `manifest.webmanifest` + `apple-touch-icon.png` (180) + `icon-192.png` / `icon-512.png` generated from `fill icon color.png`. Linked from `index.html`.
- Auth screen wordmark → `AuthScreen.tsx` + `ProfileSetupScreen.tsx` `<h1>Tenor</h1>` text replaced with `<img>` of `full-logo-dark.svg` (light aurora bg → dark variant per the variant rule). `.auth-wordmark` CSS dropped serif type styling, now centers + sizes the img to 40px height.
- Native iOS AppIcon → `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` regenerated at 1024×1024 from `fill icon color.png`. **Requires Xcode rebuild to ship to device.**
- **Skipped:** `TenorControls` widget iconset (placeholder `Contents.json` with no filename refs — separate cleanup before it can hold images).

**Variant-selection rule (locked Jun 12 2026):** small footprint + light background → small dark logo; small footprint + dark background → small light logo; generous footprint → one of the full-wordmark variants. The color-gradient `t logo.svg` is reserved for surfaces where the background is unknown or mixed (e.g. browser tabs).

### NEXT UP (added Jun 12 2026, revised again) — Revert heading-font experiment; fix AccountScreen layout vs. sketch

**Heading-style selector: ABANDONED.** Do not build the "non-cursive"/"cursive" preset toggle, do not add Vibur, do not add the "App Settings" section. Revert anything already built for this: remove the `data-heading-style` attribute/CSS variables and the Vibur Google Fonts import if either was added, and remove the "App Settings" section + two-tile selector from `AccountScreen.tsx` if it was added. Fonts go back to the original single set — **Merriweather** for H1/H2/H3, **Montserrat** for Body/Label (Regular for Body, Light for Label) — matching the existing "Design System → Typography" table (no changes needed to that table).

**AccountScreen.tsx fixes (current build has drifted from the original sketch — see "Detailed Flow: Account Tab" above for the as-built Jun 4 spec):**

1. ~~"Patient Account" H1 is centered — should be left-aligned~~ — **reverted (Jun 12 2026): "Patient Account" H1 should actually be CENTER-aligned.** Previous instruction to left-align was wrong; center it.
2. **Name field — split into first/last name, but display as one:**
   - DB: `profiles` table should store `first_name` and `last_name` as separate columns (add if not present; currently a single `display_name`).
   - Edit mode: two separate editable fields — "First Name" and "Last Name".
   - Display mode (not editing): render as a single cohesive name "First Last" (H2), not two separate fields/boxes.
   - Everywhere else the user's name appears (home screen greeting, etc.): show **only the first name**.
   - **Known bug from latest build:** the name currently renders as "Rohan Rohan" — `last_name` appears to have been populated from the same source as `first_name` (likely both defaulted from the old single `display_name` value during migration/seed). Fix the data so `last_name` holds the actual last name ("Boda", per the original sketch), not a duplicate of `first_name`.
   - **New: the displayed name (display mode) should be underlined**, to signal it's tappable/editable.
3. **Linked account row** — the "google account linked" pill (secondary button) and the unlink "X" button should flex to fill the full width of the section (not pill-sized with leftover space), with appropriate spacing/alignment and padding between the two elements. *(Done per latest screenshot — looks correct, no further change needed.)*
4. **Sign Out button** — same full-width flex treatment as #3. *(Done per latest screenshot — looks correct, no further change needed.)*
5. **New: spacing system.** The latest build uses one flat, uniform gap between every section (heading → name → linked account → divider → sign out), which reads as monotonous/wrong. Replace with a deliberate spacing scale on the 4px grid — e.g. small gap (8–12px) between tightly-related elements (a label and its value), larger gap (24–32px) between distinct sections (name block → linked account block → sign out). Spacing should increase with the "distance" between groups, not be one constant value throughout.

These are layout/data-model fixes to bring the existing built screen back in line with the original sketch — not new features.

**Source files** (absolute path, not in either app repo — copy/reference from here):
`/Users/rohanboda/Desktop/Health tech map/Tenor/design assets/`
- `t logo.svg` / `t logo - light.svg` / `t logo - dark.svg` — cursive lowercase "t" mark only, transparent background, gradient stroke/fill (gradient stops: `#FFD847` yellow → `#59FF89` green → `#9CB3FF` blue → `#FF9E9D` coral). Note this gradient roughly mirrors the existing HEP/LEP/LEN/HEN quadrant palette — intentional brand↔emotion tie-in, no new color tokens needed.
- `full logo.svg` / `full logo - light.svg` / `full logo - dark.svg` — full "tenor" wordmark (cursive "t" + sans-serif "enor"), same gradient.
- `fill icon color.png` — rounded-square icon, full gradient background fill, dark "t" mark. Best candidate for the PWA/app icon (opaque, reads well at small sizes).
- `fill icon light.png` — rounded-square icon, white background, gradient "t" mark.
- `full icon dark.png` — rounded-square icon, dark background, gradient "t" mark.

**Tasks:**
1. **Favicon** — replace the current placeholder `public/favicon.svg` (a generic purple arrow shape, unrelated to the brand) with `t logo.svg`. Transparent background scales cleanly in both light and dark browser tabs.
2. **PWA / app icon** — add a manifest + `apple-touch-icon` using `fill icon color.png` as the 1024×1024 source; generate 192×192, 512×512, and 180×180 apple-touch-icon. If a native iOS `AppIcon.appiconset` exists (Capacitor build), populate it from the same source too.
3. **In-app wordmark** — place `full logo.svg` (or the light/dark variant matching the screen's background) as the H1 "Tenor" wordmark on the Auth screen (the one added in `737c6cf` "Auth polish — H1 Tenor wordmark"), replacing the plain text H1. Use the light/dark variant that matches that screen's background — `full logo - dark.svg` for light backgrounds, `full logo - light.svg` for dark backgrounds, `full logo.svg` if the screen background is neutral/mixed.
4. Sanity-check contrast/legibility of the gradient mark against whatever background it lands on (WCAG rule still applies to the wordmark's surrounding UI, not the mark itself, but don't place it somewhere it disappears).

### This weekend — Fri 29 May → Sun 31 May
1. ✅ **Supabase database** — done. Migration applied: profiles / therapist_patients / logs / log_chips / audit_log with RLS + soft delete + audit triggers. In-memory `ALL_LOGS` replaced with live `fetchLogs` / `insertLog` when authenticated; mocks preserved for env-var-less dev.
2. ✅ **Account system** — done. Supabase Auth (email/password + Google OAuth). `profiles` row captured at signup with role + display_name + timezone. Auth gate via `useAuth`. Home greeting personalizes to `profile.display_name` with timezone-aware Good morning/afternoon/evening.

### Next up — Mon 2 Jun → Fri 6 Jun
- ~~**Mon–Tue: "Add to this log"**~~ — **built and live** Jun 4 2026 (commits `27f888f`, `a0e093b`, `b2c8e10`, `f8b698e`). Topic naming popup, thread data model, "X logs" pill on threaded cards, LogThreadScreen with chain connector + inline add button, full Supabase write-through. See "Detailed Flow: Add to this log" section for the as-built spec.
- **Tue–Fri: Therapist side** — not designed or built. UI sketches must come first. Several screens will borrow directly from existing patient components (log detail card, emotion chips, breakdown bubbles, mood line). Therapist-specific screens needed: patient list, per-patient week/history view, notification/alert surface. RLS policies already grant therapists read access to logs of linked patients in `therapist_patients`.

### Following weekend — ~Sat 7 Jun → Fri 13 Jun
- **Text classification model** — replace current client-side emotion lexicon with an in-house classifier (fine-tuned BERT or curated lexicon + lightweight sklearn model). Goal: no dependency on third-party LLMs for emotion detection.

### ~~NEXT UP — Notification / Reminder System~~ — **built Jun 12 2026** (`1299c68` → `5aa0c1e`)
Full as-built notes in "Detailed Flow: Notification / Reminder System" above. Spec landed as designed for both platforms. Remaining follow-ups: see "Reminder system follow-ups" under "Also open" below.

### ~~NEXT UP — Logo Intro Animation (Splash)~~ — **built Jun 15 2026**
See "Detailed Flow: Logo Intro Animation (Splash)" → "As-built notes" above for what shipped. Assets in `public/animations/intro.{lottie,json}`, component at `src/components/IntroSplash.tsx`, wired in `App.tsx` via rising-edge effect over `screenIsAuth`.

### NEXT UP (added Jun 15 2026, spec locked Jun 22 2026) — Emotion Selector v2: starburst UI + settings toggle
Full spec in "Detailed Flow: Emotion Selector v2 — Starburst + A/B" below (to be added). Classic (HEP/LEP/LEN/HEN quadrant grid) vs Starburst (8 named base emotions radial fisheye → drill to sub-emotions). First-time variant prompt on `LogMethodScreen` when quadrant section scrolls into view: "How intense your feeling is" vs "What kind of feeling it is." Both initial pick and per-open usage tracked per user on `profiles` (migration `0010_emotion_ui_ab.sql`). AccountScreen toggle. Data model: hierarchical vocab alongside existing flat `VocabByCategory`; downstream (chips, review screen) unchanged.

### Also open (no fixed slot yet)
- **Reminder system follow-ups:**
  - Field-test stage-1 dismissal when stage-2 fires on iOS. If stage 1 lingers in Notification Center after stage 2 lands, swap `reminderScheduler.ts` to same-id reschedule (the body lookups are already keyed on stage so the swap is local).
  - **Rotating phrase variants** for stage 1 — currently a 1-element array. Add 4–6 alternates and randomize per (user, date).
  - **Onboarding moment** to introduce the reminder explicitly during signup, instead of relying on the toggle being default-on. Today the iOS permission prompt fires the first time the scheduler runs; an onboarding card explaining what reminders look like before that prompt would convert better.
  - **Web push for iOS Safari** — currently `pushSubscribe.ts` no-ops on iOS WebView (native scheduler handles it). For iOS Safari installed as a PWA from the home screen, Web Push *does* work; verify the subscribe path fires cleanly there and add a test plan if not.
- **Account tab** — at minimum a sign-out button + edit display name; foundation for Patient↔Therapist linking later.
- **Preserve LogsScreen state** — lift D/W/M/Y position and period into `App` so closing a detail view doesn't reset scroll position.
- **Polish pass** — FAB split animation, blob breathing on voice screen, screen transitions.
- **Type flow** — spec not yet written.
- **Chat tab** — spec not yet written.
- **Open-across-midnight TODAY rollover** — lift to a hook polling on visibilitychange.
- ~~**"Continue as guest" option**~~ — **built** Jun 4 2026. See "Guest Mode — built" section below.

### Guest Mode — built (Jun 4 2026)

**Entry point:** On the auth screen, below the Google button, a small underlined text button labelled **"Continue as guest"** with the disclaimer beneath it: *"Your logs in guest mode will be lost once you close Tenor."* Quiet styling on purpose so the primary paths (sign in / sign up / Google) stay dominant.

**What guest mode is:** A "fuck around and find out" version of Tenor. No account required. Users can explore the full patient-side experience — nothing locked down. Purpose: let competition judges and curious users try the product without creating an account.

**Implementation rule:** There is **no separate guest build**. It's the same app rendered with `auth.state.status === 'guest'`. Every change to the main app automatically applies to guest mode. The only guest-specific logic is: (a) skip Supabase reads/writes, (b) seed the initial logs, (c) persist logs to `sessionStorage`, (d) omit the name from the greeting.

**State machine.** `useAuth` exposes a `'guest'` status alongside `loading | disabled | unauthenticated | needs-profile | authenticated`. `enterGuest()` flips a sessionStorage flag (`tenor:guest:active`) and sets state to `'guest'`. `exitGuest()` clears that flag, drops guest logs, and re-runs the normal session check. The guest flag is read on first render so a tab refresh inside guest mode stays in guest mode.

**Persistence.** Guest logs live under `tenor:guest:logs:v1` in `sessionStorage`. The key is versioned so a schema change here doesn't load stale shapes from an older session. `App.tsx` runs a `useEffect` that syncs the React `logs` state to `sessionStorage` on every change. `sessionStorage` is automatically cleared by the browser when the tab closes — that's where the "lost once you close Tenor" promise comes from. We don't write to Supabase from guest mode under any condition.

**Differences from authenticated mode:**
- HomeScreen greeting renders **"Good morning."** with no name. The `displayName` prop accepts `null` as an explicit "no name" signal (distinct from `undefined`, which is the dev/mock branch and still falls back to "Rohan"). On the auth + guest paths, `App.tsx` passes `displayName={null}` for guest.
- Submit paths (`submitVoiceLogInner`, `submitEmotionLogInner`) check `auth.state.status === 'authenticated'` before any Supabase write; guest falls through to the local-state branch that already existed for mock/dev mode.
- The `fetchLogs` effect bails early unless authenticated, so it never touches the network in guest mode.

**Seed data (`src/lib/guestSeed.ts`).** Exactly 4 logs from yesterday, anchored to `new Date()` so the seed is always "the day before now" regardless of when the app is opened. The four cover one log per quadrant + a 2-and-2 mode split:
- 08:24 — **HEP speak** ("excited / energized / hopeful" + transcript)
- 12:47 — **LEP select** ("calm / content / grounded")
- 15:12 — **HEN speak** ("frustrated / overwhelmed / tense" + transcript)
- 21:38 — **LEN select** ("tired / lonely / melancholy")

The morning → evening spread means the Day-view mood line shows a real arc, and the "This week's mood" home card shows yesterday's dot populated with multi-quadrant blend while every other day is empty. Today starts empty so the guest naturally lands on "log your first entry."

**What's NOT done yet for guest mode:** the Account tab placeholder still doesn't have an "Exit guest" button — `useAuth.exitGuest()` is wired and ready, just needs the UI when we build out the Account tab.

### Capacitor (iOS native build) — LIVE on device (May 30 2026)
Capacitor wraps the existing web app into a native iOS shell for direct device install via Xcode (free Apple ID, no $99 developer account needed). End-to-end working on iPhone 15 / iOS 26: scroll, native haptics, mic + speech permissions, Google sign-in via system Safari.

**Source is shared between web and iOS.** There is only one codebase (`tenor-app/src/`). Any change you make to a component, screen, or CSS file ships to BOTH builds. The only platform-specific files are:
- `capacitor.config.ts` — Capacitor-only
- `ios/` directory (Xcode project, AppDelegate.swift, Info.plist) — Capacitor-only
- `src/lib/nativeAuth.ts` — runtime-gated on `Capacitor.isNativePlatform()`, so it's loaded by both builds but only the native path executes on iOS
- `vite.config.ts` switches `base` between `'/Tenor/'` (GitHub Pages) and `'/'` (Capacitor) based on the `CAPACITOR=1` env var

**Two separate deploy paths — both required to ship a change to both surfaces:**
1. **iOS app on device:** `npm run build:ios` (= `CAPACITOR=1 npm run build && npx cap sync ios`) → hit ▶ Run in Xcode. Local-only; the bundle ships via Xcode to the connected iPhone.
2. **Web / GitHub Pages PWA:** `git commit && git push origin main`. The deploy workflow rebuilds and republishes `https://rodneybowen.github.io/Tenor/`. **Local edits do NOT reach the live web URL until pushed.** If a change is visible in iOS but not in the browser, the answer is almost always "the commit hasn't been pushed yet."

**Default assumption when editing:** every change applies to BOTH builds. Only call out a platform-specific behavior when it's actually gated by `Capacitor.isNativePlatform()` or lives in `ios/` or `capacitor.config.ts`.

**Channel-parity rule (durable, Jun 12 2026):** Every change must ship to every channel — web (GitHub Pages), iOS (Capacitor → Xcode), and any future channels (Android, native macOS, etc.). The ONLY acceptable exception is a hard platform limitation (e.g. Web Speech API never reaching the page from a system shortcut on web; SFSpeechRecognizer not existing in browsers). When that exception applies, document the limitation inline and ship a graceful fallback on the limited channel — never silently skip it. "I'll just build it for iOS and worry about web later" / "the web works, I'll fix iOS in a follow-up" are both violations. If a change isn't ready for every channel, it isn't ready to ship. Concretely this means:
- Every commit that touches `src/` is automatically web + iOS (single codebase, `cap sync` after push).
- Every commit that touches `ios/` MUST land on `origin/main` — Xcode-project changes don't reach iOS unless they're committed AND the user opens Xcode and re-runs. The pbxproj, entitlements, Info.plist, Swift files, and the TenorControls extension all live in git for this reason.
- "Forgot to commit the iOS changes" is the single most common way the rule gets violated in this project. Always `git status` before declaring a feature done.

- **Update flow (iOS only):** `npm run build:ios` → ▶ Run in Xcode.
- **Bundle ID:** `com.tenor.app`. URL scheme: `tenor://` (for OAuth callback).
- **`AppDelegate.swift`** — on launch walks the view tree to find the `WKWebView`, sets `isOpaque = false` + `backgroundColor = .clear` + `scrollView.backgroundColor = .clear`. Window `backgroundColor` set to `#f4f2f0` (the body bg fallback) so any safe-area area outside the webview shows neutral cream, not default white. DOM scroll is left untouched.
- **`Info.plist`** — declares `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` (without these iOS won't even prompt; Tenor never showed up in Settings → Privacy → Microphone). Also `CFBundleURLTypes` registers the `tenor://` URL scheme for OAuth callbacks.
- **Google OAuth on native (`src/lib/nativeAuth.ts`).** Calls `supabase.auth.signInWithOAuth` with `skipBrowserRedirect: true` to get the auth URL, then `window.open(url, '_system')` opens it in **system Safari** (NOT the in-app `SFSafariViewController` — Google blocks embedded webviews for OAuth). Supabase redirects to `tenor://auth-callback#access_token=...&refresh_token=...`. `@capacitor/app`'s `addListener('appUrlOpen', …)` receives the URL when iOS re-activates the app via the scheme; the hash is parsed and `supabase.auth.setSession({ access_token, refresh_token })` finalizes login. PKCE `?code=…` path is also handled as a fallback. **Required Supabase config:** Auth → URL Configuration → Redirect URLs must include `tenor://auth-callback` (no trailing slash).
- **iOS safe area + scroll resolution (final).** `contentInset: 'never'` extends the webview edge-to-edge so the aurora gradient paints to the home indicator (no black band, no white inset). `AppDelegate.swift` makes the WKWebView transparent (`isOpaque = false`, `backgroundColor = .clear`) and tints the window cream (`#f4f2f0`) so any safe-area area outside the webview's drawing shows neutral aurora-adjacent color, not default white. DOM scroll is untouched.
- **`.home-scroll` / `.logs-shell` flex-column overflow trap.** Both used to be `display: flex; flex-direction: column; overflow-y: auto`. In a flex column with `overflow: auto`, flex items with default `flex-shrink: 1` shrink to fit the container instead of overflowing — so `scrollHeight === clientHeight` and overflow never engages. Fix: make these plain block containers. Children stack at natural height, content overflows, scroll engages. `.lm-body` is unaffected because its sole flex item (the snap content) is taller than the container in its own scroll context.
- **D/W/M/Y tab tap = "go to current period".** Tapping D/W/M/Y on LogsScreen now always anchors to the period containing TODAY (was: only `D` did, W/M/Y kept the previous anchor). Drill-down from a Week bar or Month cell still routes to a specific target via `drillTo()`. Tab tap is the home gesture; drill is the navigation gesture.
- **`.dwmy` pill centering.** After switching `.logs-shell` to a plain block, `align-self: center` on `.dwmy` stopped working (only valid inside a flex parent). Replaced with `width: fit-content; margin: 0 auto`.
- **Top white-fade removed; content fade-out via `mask-image`.** `.app-fade--top` no longer paints a white→transparent gradient. Instead, `.home-scroll` and `.logs-shell` use `mask-image: linear-gradient(transparent → opaque)` from `safe-area-inset-top` down to `--fade-top-end` so scrolled content dissolves into the status-bar zone instead of being clipped by a white notch. The aurora extends edge-to-edge top, status-bar text stays legible against pastel aurora, and scrolling content cleanly fades under the iOS notch on both web and iOS Capacitor builds.
- **Back button position consistency** — `.eg-header` (EmotionGrid) was using a different `top` offset and `padding` than `.top-bar` (every other screen), so the back-arrow visibly shifted between screens. Both now use `top: calc(var(--fade-top-end) + 8px)` and `padding: 0 20px` with a 40px grid cell. `.eg-spacer` shrunk from 44→40 to match.
- **Velocity-based haptic in EmotionGrid** — `onScroll` rAF tracks which chip is centered. A `haptics.snap()` (Capacitor `selectionChanged`) fires every time the centered chip changes, so the tick rate naturally scales with scroll speed (like Apple Watch crown). Replaces the old `scrollend`-only snap. The Taptic Engine is primed on mount via `haptics.prime()` (maps to `selectionStart` → `UISelectionFeedbackGenerator.prepare()`, silent) so the first scroll haptic isn't dropped while the engine wakes.
- **EmotionGrid entry centering** — opening the grid from a category bubble now scrolls to the **inner-corner chip** of that quadrant (the chip closest to the plane center seam) instead of the geometric center of the 4×3 grid. Hints that other quadrants are reachable by panning outward. The centering effect re-runs on `positions` change but no-ops once the user has interacted with the viewport, so live vocab loads (Google Sheet CSV — fetches on web, often blocked by CORS on iOS Capacitor build) re-center correctly without yanking mid-pan.
- **LogsScreen Day view layout** — order top → bottom: D/W/M/Y toggle → period nav (← Sat, 30 May →) → **"Your day's mood"** mood line → day's logs list. Summary reads first, detail entries below. `.logs-body { gap: 28px }` handles section spacing.
- **Google OAuth (native):** `src/lib/nativeAuth.ts` uses `window.open(url, '_system')` to open Google in system Safari (in-app `SFSafariViewController` is blocked by Google for OAuth, shows blank). After auth, iOS reopens Tenor via the `tenor://auth-callback` URL. The handler parses **both** the PKCE flow (`?code=...`) and the implicit flow (`#access_token=...&refresh_token=...`) since Supabase's Google provider returns hash tokens by default. Supabase URL allowlist must include `tenor://auth-callback`.
- **Info.plist:** declares `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` so iOS shows Tenor in Settings → Privacy and the mic prompt fires. Without these, Tenor never appears in Settings and the mic silently fails.
- **Haptics:** native via `@capacitor/haptics` (Taptic Engine). App-level `pointerdown` listener in `App.tsx` fires `haptics.tap()` on every `<button>` press (capture phase, skips disabled). EmotionGrid uses `haptics.snap()` on scroll-snap landing. `src/lib/haptics.ts` falls back to Web Vibration API on web (silent on iOS Safari).
- **Voice/Speech:** Web Speech API in WKWebView is unreliable even with Info.plist set. If it fails on device, the proper fix is the `@capacitor-community/speech-recognition` plugin (Swift work). Browser prompts for mic every session — Web Speech API spec, not fixable without PWA install or native bridge.

---

## Database Schema

**Live, applied to Supabase.** Source of truth: `tenor-app/supabase/migrations/0001_init.sql` — includes the full schema, indexes, RLS policies on every table, `audit_log` write triggers (`SECURITY DEFINER`), and `updated_at` maintenance. Provisioning walkthrough + RLS isolation test: `tenor-app/supabase/README.md`.

Tables:
- **profiles** — `id` (= `auth.users.id`), `role` (`'patient' | 'therapist'`), `display_name`, `timezone`, soft delete
- **therapist_patients** — relationship junction with `active` flag + `revoked_at` provenance
- **logs** — `id`, `user_id`, `mode`, `date_key`, `logged_at`, `body`, `parent_log_id` (for "add to this log"), soft delete
- **log_chips** — `text` + `quadrant` per chip, `sort_order`, FK to `logs`
- **audit_log** — append-only PHI access trail; populated by `SECURITY DEFINER` AFTER triggers on writes to `profiles` / `logs` / `log_chips`

RLS summary:
- **profiles**: own row R/W; therapists can read profile of any active-linked patient
- **logs**: owner R/W; therapists read-only on logs of active-linked patients (excludes soft-deleted)
- **log_chips**: same scope as parent log
- **therapist_patients**: both ends can read their own links; insert/update is service-role only (Edge Functions or admin)
- **audit_log**: read own actions only; inserts come from triggers exclusively (no client INSERT policy)

Production HIPAA gaps (documented in `supabase/README.md`): Business Associate Agreement with Supabase (Team plan+), SELECT auditing via `pgaudit` or app-layer logging, MFA, hard-delete job (current default is soft delete), short JWT expiry for therapists, RLS policies for `therapist_patients` write paths. Architecture is BAA-ready out of the gate.

---

## Open Questions

1. **Therapist side** — screens not yet designed. Sketch before building (Tue–Fri sprint).
2. **Modality** — is Tenor modality-agnostic or does it lean toward a specific therapy type (CBT, etc.)? Currently undefined.
3. **Figma file** — file exists but screens not mocked up yet. Will connect via Figma MCP once ready.
4. **5-emotion selection cap** — confirm whether this stays once real vocabulary is in.

---

## HIPAA Note

This is a course project (4-week course). HIPAA compliance is not yet implemented but should be acknowledged in the submission. Things to name: end-to-end encryption for logs, per-user data storage (not aggregate), no third-party data sharing, role-based access (therapist sees only their own patients).

---

## Changelog

The dated, per-commit shipping log lives in **`CHANGELOG.md`** (same folder as this file). Append new entries there with date, SHA, and a one-line summary. This file stays focused on durable context: design system, design rules, product decisions, feature specs, and technical architecture. If a change introduces new architecture or a new design rule, also document the *rule* here — `CHANGELOG.md` records *what shipped when*; this file records *why it is the way it is.*
