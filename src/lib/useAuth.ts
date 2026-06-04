// =====================================================================
// useAuth — single source of truth for the app's auth/profile state
// =====================================================================
// Returns a discriminated-union status the App switches on:
//
//   loading          → checking Supabase session (brief, invisible)
//   disabled         → no Supabase env vars; render the app on mocks
//   unauthenticated  → no session; render <AuthScreen />
//   needs-profile    → session exists but no `profiles` row yet
//                      (happens after Google OAuth on first sign-in)
//                      → render <ProfileSetupScreen />
//   authenticated    → both session + profile present; render the app
//   guest            → user picked "Continue as guest" on the auth
//                      screen. Render the full app, but never read or
//                      write Supabase. Logs live in React state +
//                      sessionStorage (lost on tab close).
//
// The hook also subscribes to onAuthStateChange so sign-in/out
// updates flow through one place. Profile insert (post-OAuth) calls
// `refresh()` to re-check without waiting for a re-mount.
// =====================================================================

import { useEffect, useState } from 'react';
import { supabase, type DbProfile, getCurrentProfile } from './supabase';
import { initNativeAuthCallback } from './nativeAuth';
import { clearGuestLogs } from './guestSeed';

export type AuthState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | { status: 'unauthenticated' }
  | { status: 'needs-profile'; userId: string; email: string | null }
  | { status: 'authenticated'; profile: DbProfile }
  | { status: 'guest' };

export interface AuthHook {
  state: AuthState;
  refresh: () => Promise<void>;
  /** Transition to guest mode and remember the choice for this tab. */
  enterGuest: () => void;
  /** Leave guest mode and drop guest logs from sessionStorage. */
  exitGuest: () => void;
}

// Guest mode is remembered per-tab in sessionStorage. Survives reloads
// inside the same tab; cleared on tab close — matching the spec
// "guest logs are lost once you close Tenor."
const GUEST_FLAG_KEY = 'tenor:guest:active';

function readGuestFlag(): boolean {
  try {
    return sessionStorage.getItem(GUEST_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}
function writeGuestFlag(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(GUEST_FLAG_KEY, '1');
    else sessionStorage.removeItem(GUEST_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function useAuth(): AuthHook {
  // Initial state precedence:
  //   1. Guest flag in sessionStorage → 'guest' (survives reloads in tab)
  //   2. Supabase configured → 'loading' (will resolve to auth/needs/etc)
  //   3. Supabase missing → 'disabled' (dev/mock experience)
  const [state, setState] = useState<AuthState>(() => {
    if (readGuestFlag()) return { status: 'guest' };
    return supabase ? { status: 'loading' } : { status: 'disabled' };
  });

  async function check() {
    // Guest takes precedence over Supabase session — never overwrite
    // an active guest session by accident on tab refresh.
    if (readGuestFlag()) {
      setState({ status: 'guest' });
      return;
    }
    if (!supabase) {
      setState({ status: 'disabled' });
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setState({ status: 'unauthenticated' });
      return;
    }
    const profile = await getCurrentProfile();
    if (!profile) {
      setState({
        status: 'needs-profile',
        userId: session.user.id,
        email: session.user.email ?? null,
      });
    } else {
      setState({ status: 'authenticated', profile });
    }
  }

  function enterGuest() {
    writeGuestFlag(true);
    setState({ status: 'guest' });
  }

  function exitGuest() {
    writeGuestFlag(false);
    clearGuestLogs();
    // Re-run the normal check so we land on 'unauthenticated' (or
    // 'authenticated' if a Supabase session somehow exists).
    void check();
  }

  useEffect(() => {
    if (!supabase) return;

    // Initial check (reads cached session from localStorage).
    check();

    // Subscribe to every future auth-state transition. Includes
    // OAuth redirect-back, manual sign-in/out, token refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    // On native iOS, listen for the tenor:// callback from system Safari
    // after Google OAuth and exchange the PKCE code for a session.
    const cleanupNative = initNativeAuthCallback(() => check());

    return () => {
      subscription.unsubscribe();
      cleanupNative();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, refresh: check, enterGuest, exitGuest };
}
