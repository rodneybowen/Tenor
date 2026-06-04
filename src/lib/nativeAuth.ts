import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { supabase } from './supabase';

export const isNative = Capacitor.isNativePlatform();

const REDIRECT_URL = 'tenor://auth-callback';

/**
 * Native Google sign-in — opens system Safari and returns immediately.
 * The OAuth callback is handled globally by `initNativeAuthCallback()`
 * in useAuth.ts, which exchanges the code and fires onAuthStateChange.
 */
export async function signInWithGoogleNative(): Promise<void> {
  if (!isNative) {
    throw new Error('signInWithGoogleNative called outside a native app');
  }
  if (!supabase) {
    throw new Error('Supabase env vars missing');
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: REDIRECT_URL,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Supabase did not return an OAuth URL');

  // Open in system Safari. Google auth completes there, then iOS
  // redirects to tenor:// which re-activates this app. The code
  // exchange happens in the global appUrlOpen listener below.
  window.open(data.url, '_system');
}

/**
 * Call once at app startup (from useAuth). Listens for the tenor://
 * auth-callback URL that iOS delivers after Google OAuth completes
 * in system Safari, exchanges the PKCE code for a Supabase session.
 */
export function initNativeAuthCallback(onSession: () => void): () => void {
  if (!isNative || !supabase) return () => undefined;

  const listenerPromise = CapApp.addListener('appUrlOpen', (event) => {
    void (async () => {
      try {
        const url = event.url;
        if (!url?.startsWith('tenor://auth-callback')) return;

        const parsed = new URL(url);

        // Hash flow: tenor://auth-callback#access_token=...&refresh_token=...
        const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase!.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error) onSession();
          return;
        }

        // PKCE flow: tenor://auth-callback?code=...
        const code = parsed.searchParams.get('code');
        if (!code) return;
        const { error } = await supabase!.auth.exchangeCodeForSession(code);
        if (!error) onSession();
      } catch {
        // silently ignore — user stays on auth screen
      }
    })();
  });

  return () => {
    void listenerPromise.then((sub) => sub.remove());
  };
}
