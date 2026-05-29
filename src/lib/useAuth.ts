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
//
// The hook also subscribes to onAuthStateChange so sign-in/out
// updates flow through one place. Profile insert (post-OAuth) calls
// `refresh()` to re-check without waiting for a re-mount.
// =====================================================================

import { useEffect, useState } from 'react';
import { supabase, type DbProfile, getCurrentProfile } from './supabase';

export type AuthState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | { status: 'unauthenticated' }
  | { status: 'needs-profile'; userId: string; email: string | null }
  | { status: 'authenticated'; profile: DbProfile };

export interface AuthHook {
  state: AuthState;
  refresh: () => Promise<void>;
}

export function useAuth(): AuthHook {
  const [state, setState] = useState<AuthState>(() =>
    supabase ? { status: 'loading' } : { status: 'disabled' },
  );

  async function check() {
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

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, refresh: check };
}
