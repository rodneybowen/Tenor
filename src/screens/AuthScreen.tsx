import { useState, type FormEvent } from 'react';
import { GoogleLogo } from '@phosphor-icons/react';
import { signIn, signInWithGoogle, signUp, type Role } from '../lib/supabase';
import { isNative, signInWithGoogleNative } from '../lib/nativeAuth';

interface AuthScreenProps {
  /** Drops the user into the guest experience (full app, no account,
   *  logs in sessionStorage). Wired in App.tsx → useAuth.enterGuest. */
  onContinueAsGuest: () => void;
  /** When true, hides the auth card off-screen below with `--hidden`
   *  modifier. Flipping to false fires the slide-up + fade-in CSS
   *  transition. Wired by App.tsx to mirror IntroSplash's lifecycle:
   *  card stays hidden while the splash is playing, then slides in
   *  the moment the splash unmounts. */
  cardHidden?: boolean;
}

type Mode = 'signin' | 'signup';

export default function AuthScreen({
  onContinueAsGuest,
  cardHidden = false,
}: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('patient');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        // Auth state listener in useAuth picks up the new session.
      } else {
        if (displayName.trim().length === 0) {
          throw new Error('Please enter a display name.');
        }
        const result = await signUp({
          email,
          password,
          role,
          displayName: displayName.trim(),
        });
        // If the Supabase project requires email confirmation, the
        // signUp call returns the user but no active session — show a
        // "check your email" view instead of waiting for auth-state
        // change that will never fire.
        if (!result) {
          setCheckEmail(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      if (isNative) {
        // Native iOS: opens system Safari and returns immediately.
        // The tenor:// callback is handled globally in useAuth, which
        // exchanges the code and triggers onAuthStateChange → re-render.
        await signInWithGoogleNative();
        setBusy(false); // reset button — auth state change drives the UI
      } else {
        // Web path: window.location redirect. No further code runs
        // here — after Google bounces back, detectSessionInUrl picks
        // up the session and useAuth re-evaluates.
        await signInWithGoogle();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="screen" id="auth">
        <div className="auth-shell">
          <h1 className="auth-wordmark"><img src={`${import.meta.env.BASE_URL}full-logo-dark.svg`} alt="Tenor" /></h1>
          <div className={`auth-card${cardHidden ? ' auth-card--hidden' : ''}`}>
            <h2 className="auth-card__title">Check your email</h2>
            <p className="auth-card__sub">
              We sent a confirmation link to <strong>{email}</strong>. Click it
              and you'll be signed in automatically.
            </p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCheckEmail(false);
                setMode('signin');
              }}
            >
              back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" id="auth">
      <div className="auth-shell">
        <h1 className="auth-wordmark"><img src={`${import.meta.env.BASE_URL}full-logo-dark.svg`} alt="Tenor" /></h1>

        <div className={`auth-card${cardHidden ? ' auth-card--hidden' : ''}`}>
          <div className="auth-tabs" role="tablist">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={
                  'auth-tabs__tab' + (mode === m ? ' auth-tabs__tab--on' : '')
                }
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            ))}
          </div>

          <form className="auth-form" onSubmit={handleEmailSubmit}>
            <label className="auth-field">
              <span className="auth-field__label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                inputMode="email"
              />
            </label>

            <label className="auth-field">
              <span className="auth-field__label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                required
                minLength={8}
              />
            </label>

            {mode === 'signup' && (
              <>
                <label className="auth-field">
                  <span className="auth-field__label">Display name</span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    required
                    placeholder="What should we call you?"
                  />
                </label>

                <div className="auth-field">
                  <span className="auth-field__label">I am a</span>
                  <div className="auth-role" role="radiogroup">
                    {(['patient', 'therapist'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={role === r}
                        className={
                          'auth-role__opt' +
                          (role === r ? ' auth-role__opt--on' : '')
                        }
                        onClick={() => setRole(r)}
                      >
                        {r === 'patient' ? 'Patient' : 'Therapist'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && <p className="auth-error">{error}</p>}

            <button
              type="submit"
              className="btn-primary auth-submit"
              disabled={busy}
            >
              {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn-secondary auth-google"
            onClick={handleGoogle}
            disabled={busy}
          >
            <GoogleLogo size={18} weight="bold" />
            Continue with Google
          </button>

          {mode === 'signup' && (
            <p className="auth-hipaa">
              By creating an account you agree to Tenor's privacy practices.
              Your logs are encrypted at rest and only ever shown to you and
              your linked therapist.
            </p>
          )}

          <div className="auth-guest">
            <button
              type="button"
              className="auth-guest__btn"
              onClick={onContinueAsGuest}
              disabled={busy}
            >
              Continue as guest
            </button>
            <p className="auth-guest__note">
              Your logs in guest mode will be lost once you close Tenor.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
