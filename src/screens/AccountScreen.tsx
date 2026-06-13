import { useEffect, useRef, useState, type FormEvent } from 'react';
import { GoogleLogo, SignOut, X, CircleNotch } from '@phosphor-icons/react';
import {
  hasGoogleIdentity,
  linkGoogleIdentity,
  signOut,
  supabase,
  updateName,
  updateReminderSettings,
  type DbProfile,
} from '../lib/supabase';

interface Props {
  /** Current authenticated profile. Required — the Account tab is
   *  hidden for guest users at the routing level. */
  profile: DbProfile;
  /** Mirror the latest profile back into App state so the home greeting
   *  refreshes the moment a name save completes. */
  onProfileUpdated: (next: DbProfile) => void;
  /** Called after a successful sign out so the caller can clear app
   *  state and route back to the auth screen. */
  onSignedOut: () => void;
}

const ROLE_TITLE: Record<DbProfile['role'], string> = {
  patient: 'Patient Account',
  therapist: 'Therapist Account',
};

/** Best-effort fallback when first/last_name haven't been backfilled
 *  yet — split display_name on the first space. */
function splitDisplay(display: string | null): { first: string; last: string } {
  if (!display) return { first: '', last: '' };
  const trimmed = display.trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return { first: trimmed, last: '' };
  return { first: trimmed.slice(0, idx), last: trimmed.slice(idx + 1).trim() };
}

export default function AccountScreen({
  profile,
  onProfileUpdated,
  onSignedOut,
}: Props) {
  const seed = splitDisplay(profile.display_name);
  const seedFirst = profile.first_name ?? seed.first;
  const seedLast = profile.last_name ?? seed.last;

  const [editing, setEditing] = useState(false);
  const [first, setFirst] = useState(seedFirst);
  const [last, setLast] = useState(seedLast);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [unlinkingGoogle, setUnlinkingGoogle] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

  // ── Reminders: optimistic local state, persisted to profiles.
  //    Toggle saves immediately; time input debounces ~500ms after the
  //    last keystroke (mobile time pickers can fire onChange per digit).
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(
    profile.reminder_enabled,
  );
  const [reminderTime, setReminderTime] = useState<string>(
    // Strip the seconds for the native <input type="time"> (HH:MM).
    profile.reminder_time.slice(0, 5),
  );
  const [reminderError, setReminderError] = useState<string | null>(null);
  const reminderTimeoutRef = useRef<number | null>(null);

  async function saveReminder(patch: {
    reminderEnabled?: boolean;
    reminderTime?: string;
  }) {
    setReminderError(null);
    try {
      const next = await updateReminderSettings(profile.id, patch);
      onProfileUpdated(next);
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : String(err));
    }
  }

  function onReminderToggle(next: boolean) {
    setReminderEnabled(next);
    void saveReminder({ reminderEnabled: next });
  }

  function onReminderTimeChange(next: string) {
    setReminderTime(next);
    if (reminderTimeoutRef.current !== null) {
      window.clearTimeout(reminderTimeoutRef.current);
    }
    reminderTimeoutRef.current = window.setTimeout(() => {
      reminderTimeoutRef.current = null;
      void saveReminder({ reminderTime: next });
    }, 500);
  }

  // Flush any pending debounced time-picker save if the screen unmounts.
  useEffect(() => {
    return () => {
      if (reminderTimeoutRef.current !== null) {
        window.clearTimeout(reminderTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let alive = true;
    hasGoogleIdentity()
      .then((linked) => {
        if (alive) setGoogleLinked(linked);
      })
      .catch(() => {
        if (alive) setGoogleLinked(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function saveName(e?: FormEvent) {
    e?.preventDefault();
    if (savingName) return;
    setSavingName(true);
    setNameError(null);
    try {
      const next = await updateName(profile.id, first, last);
      onProfileUpdated(next);
      setEditing(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }

  function cancelEdit() {
    setFirst(seedFirst);
    setLast(seedLast);
    setNameError(null);
    setEditing(false);
  }

  async function linkGoogle() {
    setLinkingGoogle(true);
    setLinkError(null);
    try {
      await linkGoogleIdentity();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
      setLinkingGoogle(false);
    }
  }

  async function unlinkGoogle() {
    if (!supabase || unlinkingGoogle) return;
    setUnlinkingGoogle(true);
    setLinkError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const google = (user?.identities ?? []).find(
        (i) => i.provider === 'google',
      );
      if (!google) {
        setGoogleLinked(false);
        return;
      }
      const { error } = await supabase.auth.unlinkIdentity(google);
      if (error) throw error;
      setGoogleLinked(false);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlinkingGoogle(false);
    }
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      onSignedOut();
    } catch (err) {
      console.error('[tenor] signOut failed', err);
      setSigningOut(false);
    }
  }

  const fullName =
    [seedFirst, seedLast].filter(Boolean).join(' ').trim() || 'You';

  return (
    <div className="screen" id="account">
      <div className="acct-scroll">
        <h1 className="acct-title">{ROLE_TITLE[profile.role]}</h1>

        {/* ── Name (split storage, combined display) ───── */}
        <section className="acct-section">
          <span className="acct-label">Name</span>
          {editing ? (
            <form className="acct-name-edit" onSubmit={saveName}>
              <input
                type="text"
                className="acct-input"
                placeholder="First name"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                maxLength={40}
                aria-label="First name"
                autoFocus
              />
              <input
                type="text"
                className="acct-input"
                placeholder="Last name"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                maxLength={40}
                aria-label="Last name"
              />
              <div className="acct-name-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={cancelEdit}
                  disabled={savingName}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingName || first.trim().length === 0}
                >
                  {savingName ? (
                    <CircleNotch size={16} weight="bold" className="spin" />
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </form>
          ) : (
            <h2
              className="acct-name"
              onClick={() => setEditing(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditing(true);
                }
              }}
            >
              {fullName}
            </h2>
          )}
          {nameError && <p className="acct-error">{nameError}</p>}
        </section>

        {/* ── Linked account (full-width pill + unlink) ── */}
        <section className="acct-section acct-section--last">
          <span className="acct-label">Linked account</span>
          {googleLinked === null ? (
            <p className="acct-meta">Checking…</p>
          ) : googleLinked ? (
            <div className="acct-linked-row">
              <span className="btn-secondary acct-linked-pill">
                <GoogleLogo size={16} weight="bold" />
                google account linked
              </span>
              <button
                type="button"
                className="acct-unlink"
                onClick={unlinkGoogle}
                disabled={unlinkingGoogle}
                aria-label="Unlink Google account"
              >
                {unlinkingGoogle ? (
                  <CircleNotch size={14} weight="bold" className="spin" />
                ) : (
                  <X size={14} weight="bold" />
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-secondary acct-link-google"
              onClick={linkGoogle}
              disabled={linkingGoogle}
            >
              {linkingGoogle ? (
                <CircleNotch size={16} weight="bold" className="spin" />
              ) : (
                <GoogleLogo size={16} weight="bold" />
              )}
              Link Google account
            </button>
          )}
          {linkError && <p className="acct-error">{linkError}</p>}
        </section>

        {/* ── Sign out (full-width primary) ────────────── */}
        <div className="acct-signout-zone">
          <button
            type="button"
            className="btn-primary acct-signout"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <CircleNotch size={16} weight="bold" className="spin" />
            ) : (
              <SignOut size={16} weight="bold" />
            )}
            Sign Out
          </button>
        </div>

        {/* ── Reminders (sits below Sign Out per the sketch). The
              time renders as an H2 with a dashed underline, matching
              the Name display affordance. A position-overlaid hidden
              <input type="time"> captures taps so the OS opens its
              native picker — no styling battles with the input chrome. */}
        <hr className="acct-divider" />
        <section className="acct-section acct-section--terminal acct-reminders">
          <span className="acct-label">Reminders</span>

          <div className="acct-reminder-row">
            <span className="acct-reminder-rowlabel">Daily reminder</span>
            <button
              type="button"
              role="switch"
              aria-checked={reminderEnabled}
              aria-label="Daily reminder"
              className={`acct-toggle${reminderEnabled ? ' is-on' : ''}`}
              onClick={() => onReminderToggle(!reminderEnabled)}
            >
              <span className="acct-toggle-thumb" aria-hidden="true" />
            </button>
          </div>

          <div
            className={`acct-reminder-time-field${reminderEnabled ? '' : ' is-disabled'}`}
          >
            <h2 className="acct-reminder-time-display" aria-hidden="true">
              {formatDisplayTime(reminderTime)}
            </h2>
            <input
              type="time"
              className="acct-reminder-time-native"
              value={reminderTime}
              onChange={(e) => onReminderTimeChange(e.target.value)}
              disabled={!reminderEnabled}
              aria-label="Reminder time"
            />
          </div>
          <p className="acct-meta acct-reminder-helper">
            We'll check in if you haven't logged a mood by this time.
          </p>
          {reminderError && <p className="acct-error">{reminderError}</p>}
        </section>
      </div>
    </div>
  );
}

/** 'HH:MM' (24h) → 'H:MM AM/PM' for the display H2. The hidden native
 *  input continues to read/write the 24h value, so timezone math
 *  upstream is unaffected. */
function formatDisplayTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h24 = Number(hStr);
  const m = mStr ?? '00';
  if (!Number.isFinite(h24)) return hhmm;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${m} ${period}`;
}
