// Web Push subscription wiring (Phase 3). Pairs with public/sw.js
// (push + notificationclick) and the `send-reminders` Edge Function.
//
// Flow on app load (web/PWA only):
//   1. Register /sw.js.
//   2. If logged in AND Notification.permission === 'default', prompt
//      the user with requestPermission().
//   3. On 'granted', pushManager.subscribe({ userVisibleOnly: true,
//      applicationServerKey: VITE_VAPID_PUBLIC_KEY }) and upsert into
//      `push_subscriptions` for the current user.
//
// Capacitor native builds use the iOS path (reminderScheduler.ts) and
// never call into this module — guarded at the entry function.

import { supabase } from './supabase';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

/** True when the runtime supports Web Push (modern browsers + PWAs).
 *  Capacitor's WKWebView reports `serviceWorker` but Web Push isn't a
 *  reliable iOS path — the native scheduler covers iOS. */
function webPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Base64-URL decode → Uint8Array, the format pushManager wants. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

/** Register the service worker once. Returns the registration, or
 *  null if the browser doesn't support service workers / fails. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!webPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (err) {
    console.warn('[tenor] sw.js register failed', err);
    return null;
  }
}

interface UpsertArgs {
  userId: string;
}

/**
 * Idempotent: prompt for Notification permission if 'default', then
 * subscribe via PushManager, then upsert into push_subscriptions for
 * the current user (on conflict on endpoint).
 *
 * No-ops in these cases:
 *   • Web Push not supported.
 *   • VAPID public key missing from env.
 *   • Supabase client null (dev/mock mode).
 *   • Notification.permission === 'denied' (user refused; respect it).
 */
export async function ensurePushSubscribed(args: UpsertArgs): Promise<void> {
  if (!webPushSupported()) return;
  if (!VAPID_PUBLIC) return;
  if (!supabase) return;
  if (Notification.permission === 'denied') return;

  const reg = await navigator.serviceWorker.ready;

  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;
  }

  // Re-subscribing with the same VAPID key is a no-op at the push
  // service — the existing subscription comes back. If the key
  // rotated, this throws and we wipe + retry.
  let sub: PushSubscription;
  try {
    sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TS5 narrowed BufferSource to the ArrayBuffer-backed
        // Uint8Array variant — our helper returns the same shape,
        // but the structural compare trips on SharedArrayBuffer in
        // the union. Cast is safe: we only ever return ArrayBuffer.
        applicationServerKey:
          urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
      }));
  } catch (err) {
    console.warn('[tenor] pushManager.subscribe failed', err);
    return;
  }

  const json = sub.toJSON();
  const keys = (json.keys ?? {}) as { p256dh?: string; auth?: string };
  if (!sub.endpoint || !keys.p256dh || !keys.auth) return;

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: args.userId,
        endpoint: sub.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' },
    );
  if (error) {
    console.warn('[tenor] push_subscriptions upsert failed', error);
  }
}
