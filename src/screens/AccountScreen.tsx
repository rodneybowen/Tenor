import { useEffect, useState, type FormEvent } from 'react';
import { GoogleLogo, SignOut, CircleNotch, Check } from '@phosphor-icons/react';
import {
  hasGoogleIdentity,
  linkGoogleIdentity,
  signOut,
  updateDisplayName,
  type DbProfile,
} from '../lib/supabase';

interface Props {
  /** Current authenticated profile. Required — the Account tab is
   *  hidden for guest users at the routing level. */
  profile: DbProfile;
  /** Mirror the latest profile back into App state so the home greeting
   *  refreshes the moment a display-name save completes. */
  onProfileUpdated: (next: DbProfile) => void;
  /** Called after a successful sign out so the caller can clear app
   *  state and route back to the auth screen. */
  onSignedOut: () => void;
}

const ROLE_LABEL: Record<DbProfile['role'], string> = {
  patient: 'Patient',
  therapist: 'Therapist',
};

export default function AccountScreen({
  profile,
  onProfileUpdated,
  onSignedOut,
}: Props) {
  const [name, setName] = useState<string>(profile.display_name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

  // Resolve once on mount: whether the user already has a Google
  // identity. Drives the "Link Google account" CTA visibility.
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

  const dirty = name.trim().length > 0 && name.trim() !== profile.display_name;

  async function saveName(e?: FormEvent) {
    e?.preventDefault();
    if (!dirty || savingName) return;
    setSavingName(true);
    setNameError(null);
    try {
      const next = await updateDisplayName(profile.id, name.trim());
      onProfileUpdated(next);
      setName(next.display_name ?? '');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingName(false);
    }
  }

  async function linkGoogle() {
    setLinkingGoogle(true);
    setLinkError(null);
    try {
      await linkGoogleIdentity();
      // The OAuth redirect leaves the page; control won't return here
      // unless Supabase errored before redirecting.
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : String(err));
      setLinkingGoogle(false);
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

  return (
    <div className="screen" id="account">
      <div className="acct-scroll">
        <h1 className="acct-title">Account</h1>

        {/* ── Display name ─────────────────────────────── */}
        <section className="acct-section">
          <label className="acct-label" htmlFor="acct-name">
            Display name
          </label>
          <form className="acct-name-row" onSubmit={saveName}>
            <input
              id="acct-name"
              type="text"
              className="acct-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              aria-label="Display name"
            />
            {dirty && (
              <button
                type="submit"
                className="acct-save"
                disabled={savingName || name.trim().length === 0}
                aria-label="Save display name"
              >
                {savingName ? (
                  <CircleNotch size={16} weight="bold" className="spin" />
                ) : (
                  <Check size={16} weight="bold" />
                )}
              </button>
            )}
          </form>
          {nameError && <p className="acct-error">{nameError}</p>}
        </section>

        {/* ── Account type (read-only) ─────────────────── */}
        <section className="acct-section">
          <span className="acct-label">Account type</span>
          <span className="acct-pill">{ROLE_LABEL[profile.role]}</span>
        </section>

        {/* ── Linked accounts ─────────────────────────── */}
        <section className="acct-section">
          <span className="acct-label">Linked accounts</span>
          {googleLinked === null ? (
            <p className="acct-meta">Checking…</p>
          ) : googleLinked ? (
            <span className="acct-linked">
              <GoogleLogo size={16} weight="bold" />
              Google account linked
            </span>
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

        {/* ── Sign out ─────────────────────────────────── */}
        <div className="acct-signout-zone">
          <button
            type="button"
            className="acct-signout"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <CircleNotch size={16} weight="bold" className="spin" />
            ) : (
              <SignOut size={16} weight="bold" />
            )}
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
