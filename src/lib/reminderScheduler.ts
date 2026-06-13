// Daily-reminder scheduler for iOS (Capacitor Local Notifications).
//
// Spec lives in TENOR_CONTEXT.md → "Detailed Flow: Notification /
// Reminder System". Two stages per day:
//   stage 1 — fires at profile.reminder_time, gentle nudge
//   stage 2 — fires +30min, "quick voice" escalation
//
// Scheduling model: a rolling 7-day window of (stage 1, stage 2)
// pairs, re-computed on app launch, app resume, and whenever the
// user changes reminder_enabled / reminder_time on AccountScreen.
// Re-scheduling clears anything we previously queued, so drift
// from clock changes / DST is bounded to one wake.
//
// Notification IDs are deterministic — see notifId() below — so a
// re-schedule doesn't duplicate any pending request, and cancel-
// on-log can target today's exact IDs without storing them.
//
// Same-id replacement vs. distinct-id cleanup
// ───────────────────────────────────────────
// Spec called this out as an open question. Chose distinct IDs
// (`stage 1 = even, stage 2 = odd`) for two reasons:
//   1. Capacitor 8's `LocalNotifications.schedule` semantics around
//      replacing an already-delivered notification with a same-id
//      reschedule aren't documented as withdrawing the delivered
//      one — `cancel()` only affects pending. Distinct IDs avoid
//      relying on undocumented behavior.
//   2. With distinct IDs we get a deterministic cancel path: when
//      stage 2 fires (foreground listener) and on every subsequent
//      scheduleReminders() call we `removeDeliveredNotifications`
//      stage 1 for that day, so the user sees only one item in
//      Notification Center even though two requests existed.
// If field testing shows stage 1 lingering after stage 2 in the
// notification center, swap to same-id — the body lookups are
// already keyed on stage so the rest of the file doesn't move.

import type { DbProfile } from './supabase';
import { TODAY_KEY } from '../data/mockLogs';

// 30 minutes between the two stages. Kept named so a future
// "Reminder cadence" setting can swap it for a per-user value.
const STAGE_GAP_MS = 30 * 60 * 1000;

// Days-since-epoch anchor. Picked so present-day IDs sit comfortably
// inside int32 (a year ≈ 365 days; *2 for the two stages keeps us
// far below 2^31 for the prototype's lifetime).
const EPOCH = new Date('2026-01-01T00:00:00Z');

// Title + body pairs per stage. Kept as 1-element arrays so adding
// rotating variants later is a one-line change (per spec note).
interface ReminderCopy {
  title: string;
  body: string;
}
const STAGE_1_VARIANTS: readonly ReminderCopy[] = [
  {
    title: 'How was your day?',
    body: "Looks like you haven't logged how you're feeling today. Make a quick log!",
  },
];
const STAGE_2_VARIANTS: readonly ReminderCopy[] = [
  {
    title: 'Just a quick check-in',
    body: 'Just one word to describe your day.',
  },
];

function pickCopy(variants: readonly ReminderCopy[]): ReminderCopy {
  return variants[0];
}

/** Whole days from EPOCH to the given local-midnight date. */
function daysSinceEpoch(d: Date): number {
  const startLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startLocal.getTime() - EPOCH.getTime()) / 86_400_000);
}

/** Deterministic ID per (date, stage) — stage 1 even, stage 2 odd. */
export function notifId(date: Date, stage: 1 | 2): number {
  return daysSinceEpoch(date) * 2 + (stage - 1);
}

/** Today's IDs in the device's local timezone — used by the
 *  cancel-after-log hook in App.tsx. */
export function todayNotifIds(): { stage1: number; stage2: number } {
  const now = new Date();
  return {
    stage1: notifId(now, 1),
    stage2: notifId(now, 2),
  };
}

/** Parse 'HH:MM' or 'HH:MM:SS' → {h, m}. */
function parseReminderTime(t: string): { h: number; m: number } {
  const [hh, mm] = t.split(':');
  return { h: Number(hh) || 0, m: Number(mm) || 0 };
}

/** Build a Date at the given y/m/d + reminder time, in local TZ. */
function dateAt(y: number, m: number, d: number, h: number, mi: number): Date {
  return new Date(y, m, d, h, mi, 0, 0);
}

interface ScheduleArgs {
  // `first_name` is no longer used in the current copy variants but
  // is kept in the wider DbProfile so future rotating phrases that
  // greet by name can pull it without a signature change.
  profile: Pick<DbProfile, 'reminder_enabled' | 'reminder_time'>;
  /** Used to skip scheduling today if a log already exists for today. */
  loggedTodayKey: string | null;
}

/**
 * Re-schedule the next 7 days of reminders. Idempotent — cancels
 * anything we may have queued before re-queuing.
 *
 * No-ops in any of these cases:
 *   • Not running inside Capacitor (web/PWA path uses server push)
 *   • `reminder_enabled === false` (after canceling pending IDs)
 *   • Permission denied by the user
 */
export async function scheduleReminders(args: ScheduleArgs): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;

  const { LocalNotifications } = await import('@capacitor/local-notifications');

  // Cancel everything we previously scheduled across the rolling
  // window, regardless of whether we're about to re-add them. Cheap
  // and avoids stale schedules surviving a setting change.
  await clearPendingWindow(LocalNotifications);

  if (!args.profile.reminder_enabled) {
    return;
  }

  // Permission. First call surfaces the iOS prompt; subsequent
  // calls return the cached state with no UI.
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return;

  const { h, m } = parseReminderTime(args.profile.reminder_time);
  const now = new Date();

  const requests: Array<{
    id: number;
    title: string;
    body: string;
    schedule: { at: Date };
    extra: { stage: 1 | 2 };
  }> = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const target = new Date(now);
    target.setDate(now.getDate() + dayOffset);
    const stage1 = dateAt(
      target.getFullYear(),
      target.getMonth(),
      target.getDate(),
      h,
      m,
    );
    const stage2 = new Date(stage1.getTime() + STAGE_GAP_MS);

    // Skip today if the user already logged today (only meaningful
    // for dayOffset === 0; future days obviously can't have logs).
    if (dayOffset === 0 && args.loggedTodayKey === TODAY_KEY) {
      continue;
    }

    if (stage1.getTime() > now.getTime()) {
      const c = pickCopy(STAGE_1_VARIANTS);
      requests.push({
        id: notifId(stage1, 1),
        title: c.title,
        body: c.body,
        schedule: { at: stage1 },
        extra: { stage: 1 },
      });
    }
    if (stage2.getTime() > now.getTime()) {
      const c = pickCopy(STAGE_2_VARIANTS);
      requests.push({
        id: notifId(stage1, 2),
        title: c.title,
        body: c.body,
        schedule: { at: stage2 },
        extra: { stage: 2 },
      });
    }
  }

  if (requests.length === 0) return;

  await LocalNotifications.schedule({
    notifications: requests.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: r.schedule,
      extra: r.extra,
    })),
  });
}

/** Cancel everything we know we put on the queue for the rolling
 *  window. Computed from today + 7 days so we don't need to read
 *  back pending — `cancel` no-ops on unknown ids. */
async function clearPendingWindow(
  LocalNotifications: typeof import('@capacitor/local-notifications').LocalNotifications,
): Promise<void> {
  const ids: { id: number }[] = [];
  const now = new Date();
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const d = new Date(now);
    d.setDate(now.getDate() + dayOffset);
    ids.push({ id: notifId(d, 1) }, { id: notifId(d, 2) });
  }
  try {
    await LocalNotifications.cancel({ notifications: ids });
  } catch {
    // Plugin throws when there's nothing to cancel on some platforms.
    // Safe to swallow — re-schedule below replaces the queue anyway.
  }
}

/** Cancel today's two notifications. Call after a successful
 *  insertLog for "today" — the cycle for today is done. */
export async function cancelTodayReminders(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { LocalNotifications } = await import(
    '@capacitor/local-notifications'
  );
  const { stage1, stage2 } = todayNotifIds();
  try {
    await LocalNotifications.cancel({
      notifications: [{ id: stage1 }, { id: stage2 }],
    });
    // Also strip a delivered stage 1 if present — covers the case
    // where stage 1 already fired and the user is now logging in
    // response. removeDelivered does nothing for unknown ids.
    await LocalNotifications.removeDeliveredNotifications({
      notifications: [{ id: stage1 } as never, { id: stage2 } as never],
    });
  } catch {
    // best-effort
  }
}

/**
 * Wire the action-performed listener once at app launch.
 *
 * Stage 1 (even id)  → onStage1() (navigate to LogMethodScreen)
 * Stage 2 (odd id)   → onStage2() (dispatch the `tenor:quicklog`
 *                      window event the existing shortcut path
 *                      already handles)
 *
 * Also listens for `localNotificationReceived` (foreground delivery)
 * so we can withdraw stage 1 from Notification Center the moment
 * stage 2 arrives — keeps the UX one item, not two.
 *
 * Returns an unsubscribe.
 */
export function initReminderActionListener(handlers: {
  onStage1: () => void;
  onStage2: () => void;
}): () => void {
  let stop: (() => void) | null = null;
  void (async () => {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { LocalNotifications } = await import(
      '@capacitor/local-notifications'
    );

    const actionSub = await LocalNotifications.addListener(
      'localNotificationActionPerformed',
      (action) => {
        const id = action.notification.id;
        if (id % 2 === 0) handlers.onStage1();
        else handlers.onStage2();
      },
    );

    const receivedSub = await LocalNotifications.addListener(
      'localNotificationReceived',
      (notif) => {
        // When stage 2 lands in the foreground, drop stage 1 from
        // Notification Center if it's still sitting there.
        if (notif.id % 2 === 1) {
          const stage1Id = notif.id - 1;
          void LocalNotifications.removeDeliveredNotifications({
            notifications: [{ id: stage1Id } as never],
          });
        }
      },
    );

    stop = () => {
      void actionSub.remove();
      void receivedSub.remove();
    };
  })();
  return () => stop?.();
}
