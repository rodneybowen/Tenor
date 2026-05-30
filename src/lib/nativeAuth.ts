// =====================================================================
// Tenor — native (Capacitor) Google OAuth
// =====================================================================
// The web Google OAuth flow (window.location redirect) doesn't return
// to a Capacitor app — iOS leaves it in Safari instead. This module
// implements the native pattern:
//
//   1. Ask Supabase for the OAuth URL with `skipBrowserRedirect: true`.
//   2. Open it in an in-app Safari View via Capacitor's Browser plugin.
//   3. After Google auth, Supabase redirects to `tenor://auth-callback`.
//      iOS recognises the URL scheme (declared in capacitor.config.ts +
//      Info.plist) and re-activates the app with the URL.
//   4. We listen for that via `App.addListener('appUrlOpen', …)`,
//      extract the code, exchange it for a Supabase session, and close
//      the in-app browser.
//
// REQUIRES (one-time):
//   - Supabase → Auth → URL Configuration → Redirect URLs allowlist
//     must include `tenor://auth-callback` (no trailing slash).
//   - Xcode → Tenor target → Info → URL Types — add `tenor` scheme
//     (Capacitor's `cap sync` writes this from capacitor.config.ts).
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';

export const isNative = Capacitor.isNativePlatform();

const REDIRECT_URL = 'tenor://auth-callback';

/** Native Google sign-in. Throws if not on a Capacitor platform or if
 *  Supabase isn't configured. Caller (AuthScreen) should branch on
 *  `isNative` and fall back to the web `signInWithGoogle` otherwise. */
export async function signInWithGoogleNative(): Promise<void> {
  if (!isNative) {
    throw new Error('signInWithGoogleNative called outside a native app');
  }
  if (!supabase) {
    throw new Error('Supabase env vars missing');
  }

  // 1. Get the OAuth URL — Supabase normally redirects the window;
  // skipBrowserRedirect keeps us in control so we can open it in
  // Capacitor's in-app browser instead.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: REDIRECT_URL,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Supabase did not return an OAuth URL');

  // 2. Open the OAuth URL in a Safari View (in-app browser).
  await Browser.open({
    url: data.url,
    presentationStyle: 'popover',
  });

  // 3. Wait for the system to re-activate the app with `tenor://…`.
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => Promise<void> | void) => {
      if (settled) return;
      settled = true;
      void Promise.resolve(action())
        .then(() => Browser.close().catch(() => undefined))
        .then(() => resolve())
        .catch(async (err) => {
          await Browser.close().catch(() => undefined);
          reject(err);
        });
    };

    const subPromise = CapApp.addListener('appUrlOpen', (event) => {
      void (async () => {
        try {
          const url = event.url;
          if (!url || !url.startsWith('tenor://')) return;

          // 4. Extract `code` from the callback URL and hand it to
          // Supabase to exchange for a real session. PKCE flow.
          const parsed = new URL(url);
          const code = parsed.searchParams.get('code');
          const errorCode = parsed.searchParams.get('error');
          if (errorCode) {
            finish(() => {
              throw new Error(
                parsed.searchParams.get('error_description') ?? errorCode,
              );
            });
            return;
          }
          if (!code) return; // not the right callback — wait for it

          finish(async () => {
            const { error: exchangeErr } =
              await supabase!.auth.exchangeCodeForSession(code);
            if (exchangeErr) throw exchangeErr;
            const sub = await subPromise;
            await sub.remove();
          });
        } catch (err) {
          finish(() => {
            throw err;
          });
        }
      })();
    });

    // Hard timeout so a user who bails out of the OAuth screen can
    // recover from a stuck Promise.
    setTimeout(() => {
      finish(async () => {
        const sub = await subPromise;
        await sub.remove();
        throw new Error('Google sign-in timed out');
      });
    }, 5 * 60 * 1000);
  });
}
