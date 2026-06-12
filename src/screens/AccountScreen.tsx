import { useEffect, useState } from 'react';
import { GoogleLogo, SignOut, X, CircleNotch } from '@phosphor-icons/react';
import {
  hasGoogleIdentity,
  linkGoogleIdentity,
  signOut,
  supabase,
  type DbProfile,
} from '../lib/supabase';

type HeadingStyle = 'non-cursive' | 'cursive';

interface Props {
  /** Current authenticated profile. Required — the Account tab is
   *  hidden for guest users at the routing level. */
  profile: DbProfile;
  /** Current app-wide heading typography preset. Driven from App.tsx
   *  via a data attribute on <html>. */
  headingStyle: HeadingStyle;
  /** Apply a new heading preset app-wide. In-memory for now. */
  onHeadingStyleChange: (next: HeadingStyle) => void;
  /** Mirror the latest profile back into App state — kept for API
   *  parity even though this revision of the screen no longer edits
   *  the display name inline. */
  onProfileUpdated: (next: DbProfile) => void;
  /** Called after a successful sign out so the caller can clear app
   *  state and route back to the auth screen. */
  onSignedOut: () => void;
}

const ROLE_TITLE: Record<DbProfile['role'], string> = {
  patient: 'Patient Account',
  therapist: 'Therapist Account',
};

export default function AccountScreen({
  profile,
  headingStyle,
  onHeadingStyleChange,
  onSignedOut,
}: Props) {
  const [googleLinked, setGoogleLinked] = useState<boolean | null>(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [unlinkingGoogle, setUnlinkingGoogle] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

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

  const displayName = profile.display_name?.trim() || 'You';

  return (
    <div className="screen" id="account">
      <div className="acct-scroll">
        <h1 className="acct-title">{ROLE_TITLE[profile.role]}</h1>

        {/* ── Name ─────────────────────────────────────── */}
        <section className="acct-section">
          <span className="acct-label">Name</span>
          <h2 className="acct-name">{displayName}</h2>
        </section>

        {/* ── Linked account ───────────────────────────── */}
        <section className="acct-section">
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

        {/* ── Sign out (primary CTA) ───────────────────── */}
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

        {/* ── App Settings ─────────────────────────────── */}
        <hr className="acct-divider" />
        <section className="acct-section acct-app-settings">
          <h1>App Settings</h1>
          <span className="acct-label">Heading style</span>
          <div
            className="heading-style-tiles"
            role="radiogroup"
            aria-label="Heading style"
          >
            {(['non-cursive', 'cursive'] as const).map((preset) => {
              const selected = headingStyle === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`heading-style-tile${selected ? ' is-selected' : ''}`}
                  onClick={() => onHeadingStyleChange(preset)}
                >
                  <span
                    className="heading-style-preview"
                    data-heading-style={preset}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  <span className="heading-style-caption">{preset}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
