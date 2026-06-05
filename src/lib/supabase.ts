// =====================================================================
// Tenor — Supabase client wrapper
// =====================================================================
// One place that talks to Supabase. Everything else in the app imports
// from here so we can:
//   • swap the transport (mock / real) without touching screens,
//   • keep query shapes in one file (easier to audit for PHI leaks),
//   • surface a tiny typed API (`signUp`, `fetchLogs`, `insertLog`…)
//     rather than scatter `supabase.from('logs')…` chains everywhere.
//
// Auth model: Supabase Auth (email / phone / Google). On signup we
// insert a matching `profiles` row with the chosen role. RLS policies
// (see supabase/migrations/0001_init.sql) guarantee that any query
// run with the user's session token only ever returns rows that
// belong to them or to patients they're linked to.
//
// Dev mode: when `VITE_SUPABASE_URL` is missing we export `supabase =
// null`. Callers MUST handle null and fall back to local mocks — the
// existing `ALL_LOGS` in `data/mockLogs.ts`. This keeps the prototype
// runnable without a Supabase project provisioned.
// =====================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { formatClock, type LogEntry } from '../data/mockLogs';
import type { Quadrant } from '../theme/emotions';

// ----- Env wiring --------------------------------------------------------

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both env vars are present — gate live queries on this. */
export const supabaseEnabled = Boolean(URL && ANON);

/** Singleton client, or null when env vars are missing (dev/mock mode). */
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(URL!, ANON!, {
      auth: {
        // Persist the session in localStorage so a page refresh
        // doesn't kick the user back to login.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// ----- DB row shapes (mirror the migration) ------------------------------

export type Role = 'patient' | 'therapist';
export type LogMode = 'speak' | 'select' | 'type' | 'scan';

export interface DbProfile {
  id: string;
  role: Role;
  display_name: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DbLog {
  id: string;
  user_id: string;
  mode: LogMode;
  date_key: string; // 'YYYY-MM-DD'
  logged_at: string; // ISO
  body: string | null;
  parent_log_id: string | null;
  /** Thread topic — set only on the root row of a thread (the log with
   *  parent_log_id = NULL that has at least one child). NULL on
   *  standalone logs and on every child. The client denormalizes this
   *  onto every thread member in memory; see `lib/threads.ts`. */
  topic: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface DbChip {
  id: string;
  log_id: string;
  text: string;
  quadrant: Quadrant | null;
  sort_order: number;
  created_at: string;
}

/** A log joined with its chips — what the app actually consumes. */
export interface LogWithChips extends DbLog {
  chips: DbChip[];
}

// ----- Auth helpers ------------------------------------------------------

function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase env vars missing — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local',
    );
  }
  return supabase;
}

export async function signUp(args: {
  email: string;
  password: string;
  role: Role;
  displayName: string;
}): Promise<DbProfile | null> {
  const sb = requireClient();
  const { data, error } = await sb.auth.signUp({
    email: args.email,
    password: args.password,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Sign-up returned no user');

  // If the Supabase project has email confirmation enabled, signUp
  // returns the user but no active session — RLS would reject the
  // profile insert (no auth.uid()). Stash role + name in localStorage
  // so ProfileSetupScreen can pre-fill them after the user confirms.
  if (!data.session) {
    try {
      localStorage.setItem(
        'tenor:pending-profile',
        JSON.stringify({ role: args.role, displayName: args.displayName }),
      );
    } catch {
      /* localStorage unavailable — user will re-enter on first sign-in */
    }
    return null;
  }

  // Active session: safe to insert the profile now.
  return createProfile({
    userId: data.user.id,
    role: args.role,
    displayName: args.displayName,
  });
}

/** Pop the stash from a signUp that needed email confirmation. Used by
 *  ProfileSetupScreen on first sign-in to pre-fill the form. */
export function takePendingProfile(): {
  role: Role;
  displayName: string;
} | null {
  try {
    const raw = localStorage.getItem('tenor:pending-profile');
    if (!raw) return null;
    localStorage.removeItem('tenor:pending-profile');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function signIn(email: string, password: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Google OAuth — redirects to Google, then back to the current URL.
 *  Session is picked up automatically (createClient has detectSessionInUrl).
 *  After the redirect, the user may not yet have a `profiles` row — the
 *  app routes them to ProfileSetupScreen until they finish signup. */
export async function signInWithGoogle(): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Return to wherever the app is currently running. Works in dev
      // (localhost:5175) and production (github.io/Tenor) without code
      // changes — make sure both URLs are whitelisted in Supabase →
      // Authentication → URL Configuration.
      redirectTo: window.location.href,
    },
  });
  if (error) throw error;
}

/** Insert the `profiles` row for a freshly-signed-up user. Used by
 *  ProfileSetupScreen after Google OAuth, where Supabase auto-creates
 *  the auth.users entry but we still need to capture role + name. */
export async function createProfile(args: {
  userId: string;
  role: Role;
  displayName: string;
}): Promise<DbProfile> {
  const sb = requireClient();
  const { data, error } = await sb
    .from('profiles')
    .insert({
      id: args.userId,
      role: args.role,
      display_name: args.displayName,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    .select()
    .single();
  if (error) throw error;
  return data as DbProfile;
}

export async function signOut(): Promise<void> {
  const sb = requireClient();
  await sb.auth.signOut();
}

/** Patch the user's display name. RLS scopes the write to their own
 *  row. Returns the updated row so the caller can mirror into state. */
export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<DbProfile> {
  const sb = requireClient();
  const { data, error } = await sb
    .from('profiles')
    .update({ display_name: displayName.trim() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data as DbProfile;
}

/** True if the current Supabase user already has a Google identity
 *  linked. Used by AccountScreen to decide whether to show the "Link
 *  Google account" CTA or the static "linked" label. */
export async function hasGoogleIdentity(): Promise<boolean> {
  const sb = requireClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return false;
  return (user.identities ?? []).some((i) => i.provider === 'google');
}

/** Kicks off the link-Google-to-existing-account OAuth flow. Returns
 *  to the current URL; after the redirect the identity is attached
 *  and `hasGoogleIdentity()` will return true. */
export async function linkGoogleIdentity(): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  if (error) throw error;
}

export async function getCurrentProfile(): Promise<DbProfile | null> {
  const sb = requireClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) return null;
  return data as DbProfile;
}

// ----- Log CRUD ----------------------------------------------------------

/** All non-deleted logs for the current user. Therapists viewing a
 *  patient's data pass `forUserId` explicitly; RLS will reject it if
 *  they aren't actually linked to that patient. */
export async function fetchLogs(forUserId?: string): Promise<LogWithChips[]> {
  const sb = requireClient();
  let query = sb
    .from('logs')
    .select('*, log_chips(*)')
    .is('deleted_at', null)
    .order('logged_at', { ascending: true });
  if (forUserId) query = query.eq('user_id', forUserId);

  const { data, error } = await query;
  if (error) throw error;

  // Supabase returns `log_chips` as the join key; flatten to `chips`.
  return (data ?? []).map(
    (row): LogWithChips => ({
      ...(row as DbLog),
      chips: ((row as unknown as { log_chips: DbChip[] }).log_chips ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      ),
    }),
  );
}

export interface NewLogInput {
  mode: LogMode;
  dateKey: string; // 'YYYY-MM-DD' in the user's TZ
  body?: string | null;
  parentLogId?: string | null;
  /** Only meaningful on the root log of a thread. Children should leave
   *  this undefined — the topic lives on the root row. */
  topic?: string | null;
  chips: { text: string; quadrant: Quadrant | null }[];
}

/** Insert a log + its chips atomically (chips go in a follow-up insert;
 *  RLS keeps each row scoped to the calling user). Returns the joined
 *  log so the caller can immediately render the new entry. */
export async function insertLog(input: NewLogInput): Promise<LogWithChips> {
  const sb = requireClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: log, error: logErr } = await sb
    .from('logs')
    .insert({
      user_id: user.id,
      mode: input.mode,
      date_key: input.dateKey,
      body: input.body ?? null,
      parent_log_id: input.parentLogId ?? null,
      topic: input.topic ?? null,
    })
    .select()
    .single();
  if (logErr) throw logErr;

  let chips: DbChip[] = [];
  if (input.chips.length > 0) {
    const rows = input.chips.map((c, i) => ({
      log_id: (log as DbLog).id,
      text: c.text,
      quadrant: c.quadrant,
      sort_order: i,
    }));
    const { data: insertedChips, error: chipErr } = await sb
      .from('log_chips')
      .insert(rows)
      .select();
    if (chipErr) throw chipErr;
    chips = (insertedChips ?? []) as DbChip[];
  }

  return { ...(log as DbLog), chips };
}

/** Soft delete — sets `deleted_at`. Patients can request a hard wipe
 *  later via a server-side job (out of scope for the prototype). */
export async function softDeleteLog(logId: string): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from('logs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', logId);
  if (error) throw error;
}

/** DB row → in-app LogEntry shape. Single point of conversion so the
 *  rest of the app's screens stay agnostic about Supabase. */
export function dbLogToLogEntry(db: LogWithChips): LogEntry {
  const loggedAt = new Date(db.logged_at);
  const quadrants = Array.from(
    new Set(
      db.chips
        .map((c) => c.quadrant)
        .filter((q): q is Quadrant => q !== null),
    ),
  );
  return {
    id: db.id,
    dateKey: db.date_key,
    time: formatClock(loggedAt),
    ts: loggedAt.getTime(),
    mode: db.mode,
    keywords: db.chips.map((c) => c.text),
    quadrants,
    body: db.body ?? undefined,
    chips: db.chips.map((c) => ({ text: c.text, quadrant: c.quadrant })),
    parentLogId: db.parent_log_id,
    topic: db.topic,
  };
}

/** Update the topic on the ROOT log of a thread. Use this when the
 *  user renames via the LogThreadScreen header or names a brand-new
 *  thread via the topic-naming popup. The caller should mirror the
 *  change into local state via `setThreadTopic` from `lib/threads.ts`.
 *
 *  Topic only lives on the root row — passing a child log's id is a
 *  bug at the caller. */
export async function updateLogTopic(
  rootLogId: string,
  topic: string | null,
): Promise<void> {
  const sb = requireClient();
  const { error } = await sb
    .from('logs')
    .update({ topic: topic && topic.trim() ? topic.trim() : null })
    .eq('id', rootLogId);
  if (error) throw error;
}
