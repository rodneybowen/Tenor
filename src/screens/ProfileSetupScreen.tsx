import { useState, type FormEvent } from 'react';
import {
  createProfile,
  signOut,
  takePendingProfile,
  type Role,
} from '../lib/supabase';

interface Props {
  userId: string;
  email: string | null;
  onComplete: () => void;
}

/** Post-auth profile completion. Reached when an auth session exists but
 *  no `profiles` row does yet — Google OAuth on first sign-in, or
 *  email/password sign-up under projects where email confirmation is on
 *  (the profile insert is deferred until the user actually has a session).
 *  Pre-fills from any stash left by signUp(). */
export default function ProfileSetupScreen({ userId, email, onComplete }: Props) {
  const pending = takePendingProfile();
  const [displayName, setDisplayName] = useState(pending?.displayName ?? '');
  const [role, setRole] = useState<Role>(pending?.role ?? 'patient');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (displayName.trim().length === 0) {
      setError('Please enter a display name.');
      return;
    }
    setBusy(true);
    try {
      await createProfile({ userId, role, displayName: displayName.trim() });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function handleCancel() {
    // Bail out → sign out so the user lands back on AuthScreen.
    await signOut();
  }

  return (
    <div className="screen" id="auth">
      <div className="auth-shell">
        <h1 className="auth-wordmark">Tenor</h1>

        <div className="auth-card">
          <h2 className="auth-card__title">Welcome to Tenor</h2>
          <p className="auth-card__sub">
            {email
              ? `Signed in as ${email}. Tell us a bit about yourself.`
              : 'Tell us a bit about yourself.'}
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-field__label">Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                autoFocus
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

            {error && <p className="auth-error">{error}</p>}

            <button
              type="submit"
              className="btn-primary auth-submit"
              disabled={busy}
            >
              {busy ? '…' : 'Continue'}
            </button>
            <button
              type="button"
              className="auth-link"
              onClick={handleCancel}
              disabled={busy}
            >
              cancel and sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
