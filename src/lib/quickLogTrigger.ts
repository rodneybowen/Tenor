// =====================================================================
// Quick Log trigger — iOS URL scheme + web query param
// =====================================================================
// Two entry points outside the app's normal nav:
//
//   1. iOS Capacitor: tenor://quick-log
//      iOS delivers this via Capacitor's appUrlOpen event when the
//      user fires the Lock Screen / Control Center Shortcut they
//      configured manually in iOS Shortcuts (Action = Open URL).
//
//   2. Web / dev / iOS PWA: ?quicklog=1 query parameter
//      Useful for end-to-end testing without setting up the Shortcut.
//
// Both call back into a single `onTrigger` handler that flips the app's
// screen to 'quickLog'.
//
// Auth callback (`tenor://auth-callback`) is handled separately in
// `nativeAuth.ts`. Each URL scheme path filters by prefix so the
// listeners don't collide.
// =====================================================================

import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

const QUICK_LOG_PATH = 'tenor://quick-log';

/** Returns true if the current page URL has `?quicklog=1`. Strips the
 *  param from the URL so a refresh doesn't re-trigger. Idempotent. */
export function consumeQuickLogQueryParam(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('quicklog') !== '1') return false;
  params.delete('quicklog');
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname +
    (newSearch ? `?${newSearch}` : '') +
    window.location.hash;
  try {
    window.history.replaceState({}, '', newUrl);
  } catch {
    /* ignore — replaceState can throw in sandboxed contexts */
  }
  return true;
}

/** Capacitor `appUrlOpen` subscription for the native build. No-op on
 *  web (web uses `consumeQuickLogQueryParam` instead). Returns a
 *  cleanup function to unsubscribe. */
export function initQuickLogCallback(onTrigger: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  const subPromise = CapApp.addListener('appUrlOpen', (event) => {
    if (!event.url) return;
    // Match exact path or with trailing slash / query — keep tolerant
    // so a Shortcut typed as `tenor://quick-log/` still triggers.
    if (
      event.url === QUICK_LOG_PATH ||
      event.url.startsWith(QUICK_LOG_PATH + '/') ||
      event.url.startsWith(QUICK_LOG_PATH + '?')
    ) {
      onTrigger();
    }
  });

  return () => {
    void subPromise.then((sub) => sub.remove());
  };
}
