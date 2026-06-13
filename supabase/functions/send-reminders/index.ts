// send-reminders — Supabase Edge Function (Deno).
//
// Triggered every 5 minutes by pg_cron (see migration
// 0007_reminder_cron.sql). For each profile with reminder_enabled,
// resolves "now" in the profile's timezone, advances the per-user
// reminder cycle (stage 0 → 1 → 2), and fans push messages out to
// every push_subscriptions row for that user.
//
// Stages and copy: see TENOR_CONTEXT.md → "Detailed Flow:
// Notification / Reminder System". Stage 1 is the gentle nudge;
// stage 2 fires +30 minutes if the user still hasn't logged.
//
// Secrets required (Supabase Dashboard → Project Settings →
// Edge Functions → Secrets):
//   • SUPABASE_URL            (auto-populated by Supabase)
//   • SUPABASE_SERVICE_ROLE_KEY (auto-populated by Supabase)
//   • VAPID_PUBLIC_KEY        (mirror of VITE_VAPID_PUBLIC_KEY)
//   • VAPID_PRIVATE_KEY       (private half, NEVER exposed client-side)
//   • VAPID_SUBJECT           (mailto:you@example.com — push services
//                              want a contact in case your endpoint
//                              misbehaves)

// @ts-nocheck — Deno + npm: specifiers; types resolved at deploy.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT =
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@tenor.app';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Copy mirrors src/lib/reminderScheduler.ts (iOS). Keep them in sync —
// stages must read identically across platforms per the spec.
const STAGE_1_TITLE = 'How was your day?';
const STAGE_1_BODY =
  "Looks like you haven't logged how you're feeling today. Make a quick log!";
const STAGE_2_TITLE = 'Just a quick check-in';
const STAGE_2_BODY = 'Just one word to describe your day.';

const STAGE_GAP_MIN = 30;

interface ProfileRow {
  id: string;
  first_name: string | null;
  timezone: string | null;
  reminder_enabled: boolean;
  reminder_time: string; // 'HH:MM:SS'
  last_reminder_date: string | null;
  last_reminder_stage: number;
}

interface SubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Local YYYY-MM-DD + HH:MM in the given IANA tz, derived from the
 *  current server "now". Falls back to UTC if tz is null/invalid. */
function localNow(tz: string | null): { dateKey: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
  const h = Number(get('hour'));
  const m = Number(get('minute'));
  return { dateKey, minutes: h * 60 + m };
}

function reminderMinutes(reminderTime: string): number {
  const [h, m] = reminderTime.split(':');
  return Number(h) * 60 + Number(m);
}

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data: profiles, error } = await sb
    .from('profiles')
    .select(
      'id, first_name, timezone, reminder_enabled, reminder_time, last_reminder_date, last_reminder_stage',
    )
    .eq('reminder_enabled', true)
    .is('deleted_at', null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }

  let sent = 0;
  let advanced = 0;

  for (const p of (profiles ?? []) as ProfileRow[]) {
    try {
      const now = localNow(p.timezone);
      const reminderMin = reminderMinutes(p.reminder_time);

      let stage = p.last_reminder_stage;

      // New local day → reset the cycle.
      if (p.last_reminder_date !== now.dateKey) {
        stage = 0;
        const { error: resetErr } = await sb
          .from('profiles')
          .update({
            last_reminder_date: now.dateKey,
            last_reminder_stage: 0,
          })
          .eq('id', p.id);
        if (resetErr) continue;
      }

      const stage1Due = now.minutes >= reminderMin;
      const stage2Due = now.minutes >= reminderMin + STAGE_GAP_MIN;

      if (stage === 0 && stage1Due) {
        const loggedToday = await userLoggedOn(sb, p.id, now.dateKey);
        if (!loggedToday) {
          const subs = await fetchSubs(sb, p.id);
          await fanOut(sb, subs, {
            title: STAGE_1_TITLE,
            body: STAGE_1_BODY,
            tag: `daily-reminder-${now.dateKey}`,
            data: { stage: 1 },
          });
          await sb
            .from('profiles')
            .update({ last_reminder_stage: 1 })
            .eq('id', p.id);
          sent += subs.length;
          advanced++;
        }
      } else if (stage === 1 && stage2Due) {
        const loggedToday = await userLoggedOn(sb, p.id, now.dateKey);
        if (!loggedToday) {
          const subs = await fetchSubs(sb, p.id);
          await fanOut(sb, subs, {
            title: STAGE_2_TITLE,
            body: STAGE_2_BODY,
            tag: `daily-reminder-${now.dateKey}`,
            data: { stage: 2 },
          });
          sent += subs.length;
        }
        // Whether or not we sent, cycle is done for today.
        await sb
          .from('profiles')
          .update({ last_reminder_stage: 2 })
          .eq('id', p.id);
        advanced++;
      }
    } catch (err) {
      console.error('[send-reminders] profile', p.id, err);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, advanced, sent_subscriptions: sent }),
    { headers: { 'content-type': 'application/json' } },
  );
});

async function userLoggedOn(
  sb: ReturnType<typeof createClient>,
  userId: string,
  dateKey: string,
): Promise<boolean> {
  const { count, error } = await sb
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date_key', dateKey)
    .is('deleted_at', null);
  if (error) return false;
  return (count ?? 0) > 0;
}

async function fetchSubs(
  sb: ReturnType<typeof createClient>,
  userId: string,
): Promise<SubRow[]> {
  const { data, error } = await sb
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) return [];
  return (data ?? []) as SubRow[];
}

interface Payload {
  title: string;
  body: string;
  tag: string;
  data: { stage: 1 | 2 };
}

async function fanOut(
  sb: ReturnType<typeof createClient>,
  subs: SubRow[],
  payload: Payload,
): Promise<void> {
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify(payload),
      );
    } catch (err: unknown) {
      // 404/410 = subscription expired → cleanup.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await sb.from('push_subscriptions').delete().eq('id', s.id);
      } else {
        console.warn('[send-reminders] push send failed', s.id, err);
      }
    }
  }
}
