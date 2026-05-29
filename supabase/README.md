# Tenor — Supabase setup

Everything you need to spin up the database and connect the client. This is HIPAA-*aware* by design (RLS, audit table, soft delete, no audio retention) but **not certified**. See "HIPAA posture" at the end of this file for what's missing for production.

---

## 1. Create the Supabase project

1. Open https://supabase.com → **New project**.
2. Pick a region close to where most patients will live (latency on a phone matters).
3. Name it `tenor-prod` (or whatever — just be consistent).
4. Set a strong database password and **save it in a password manager**. You won't need it day-to-day (auth uses JWT), but you'll need it if you ever connect with `psql`.
5. Plan: free tier is fine for development. **Production must be on the Team plan or higher** to get a Business Associate Agreement (BAA) from Supabase. A BAA is non-negotiable for handling real patient data.

## 2. Run the migration

Two options:

**Option A — Supabase CLI (recommended for repeatable deploys)**
```bash
npm install -g supabase
supabase login
cd tenor-app
supabase link --project-ref YOUR-PROJECT-REF  # from the project URL
supabase db push
```

**Option B — SQL editor (one-off, fine for the first migration)**
1. Open the project → **SQL Editor** → **New query**.
2. Paste the entire contents of `supabase/migrations/0001_init.sql`.
3. Run. Look for "Success. No rows returned" — that's the expected output.

## 3. Configure Auth

In the Supabase dashboard:

1. **Authentication → Providers**
   - Enable **Email** (already on by default).
   - Enable **Phone** if you want SMS sign-in (configure Twilio in the same panel).
   - Enable **Google** (paste the OAuth client ID + secret from Google Cloud Console).
2. **Authentication → URL Configuration**
   - Site URL: `https://rodneybowen.github.io/Tenor/` (production)
   - Additional redirect URLs: `http://localhost:5173`, `http://localhost:5175` (Vite dev)
3. **Authentication → Email Templates** — at minimum, edit the confirmation email subject/body so it reads as Tenor, not "your Supabase project."

## 4. Wire the client

1. Copy the project's API credentials from **Project Settings → API**:
   - Project URL → `VITE_SUPABASE_URL`
   - `anon` `public` key → `VITE_SUPABASE_ANON_KEY`
2. In `tenor-app/`, create `.env.local` (gitignored) by copying `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
3. Paste the real values into `.env.local`.
4. Restart `npm run dev`.

The client wrapper (`src/lib/supabase.ts`) auto-detects whether the env vars are present:
- **Present** → live Supabase queries.
- **Missing** → `supabase` is `null`; the existing in-memory `ALL_LOGS` keeps working. You can iterate UI without a DB connection.

## 5. Verify RLS

Critical — RLS is what keeps patients from seeing each other's logs. Test it:

1. **SQL Editor** → run as **service_role** (top-right dropdown):
   ```sql
   -- create two fake patients
   insert into auth.users (id, email) values
     ('00000000-0000-0000-0000-000000000001', 'a@test.local'),
     ('00000000-0000-0000-0000-000000000002', 'b@test.local')
   on conflict do nothing;
   insert into profiles (id, role, display_name) values
     ('00000000-0000-0000-0000-000000000001', 'patient', 'A'),
     ('00000000-0000-0000-0000-000000000002', 'patient', 'B')
   on conflict do nothing;
   insert into logs (user_id, mode, date_key, body) values
     ('00000000-0000-0000-0000-000000000001', 'type', '2026-05-28', 'Patient A log'),
     ('00000000-0000-0000-0000-000000000002', 'type', '2026-05-28', 'Patient B log');
   ```
2. Switch the role dropdown to **authenticated** and run:
   ```sql
   set local "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
   select user_id, body from logs;
   ```
   You should see **only Patient A's log**. If you see both, RLS is misconfigured — stop and check.
3. Clean up: `delete from auth.users where email like '%@test.local';` (cascades to profiles + logs).

---

## What this gets you

- ✅ Full RLS on every table (`profiles`, `logs`, `log_chips`, `therapist_patients`, `audit_log`)
- ✅ Therapist read-access scoped to active `therapist_patients` links
- ✅ Soft delete (`deleted_at`) on `profiles` and `logs`
- ✅ Audit trail of every write to PHI via `audit_log` table + triggers
- ✅ At-rest AES-256 + TLS in transit (Supabase defaults)
- ✅ No audio retention — voice notes transcribed in-browser, only text persists
- ✅ Single PHI locus (Supabase) — one BAA covers all stored data

## What's still missing for production HIPAA

- ⚠️ **Business Associate Agreement** — sign with Supabase (Team plan+) before any real patient data lands. If Whisper is added, also sign with OpenAI (Enterprise/ZDR) or self-host Whisper.
- ⚠️ **SELECT auditing** — Postgres has no built-in SELECT trigger. Either log reads from the application layer (call `audit_log` from server-side functions when therapists view patient data) or enable `pgaudit` on Supabase Pro+.
- ⚠️ **MFA** — strongly encouraged for all accounts, mandatory for therapists. Supabase Auth supports TOTP MFA — enable in Authentication → Providers.
- ⚠️ **Session timeout** — set short JWT expiry for therapist accounts (Authentication → Settings → JWT expiry).
- ⚠️ **Right-to-delete job** — soft delete is current default; an Edge Function should run on demand to hard-wipe a user's data (chips, logs, profile, audit entries with PHI references).
- ⚠️ **Backups** — Supabase backups are encrypted; configure retention + test restore.
- ⚠️ **RLS policies for `therapist_patients` writes** — currently no INSERT/UPDATE policy, so links can only be created via an admin/service-role call. Decide who can link a therapist to a patient (admin invite, patient-initiated, therapist-initiated with patient confirmation) and add policies accordingly.
- ⚠️ **Therapist re-notification on log append** — promised in the product spec but not wired yet (needs Edge Function + a notifications channel).

---

## File layout

```
tenor-app/
├── supabase/
│   ├── README.md                    ← you are here
│   └── migrations/
│       └── 0001_init.sql            ← schema + RLS + audit
├── src/lib/
│   └── supabase.ts                  ← typed client + auth + log CRUD
├── .env.example                     ← env template (committed)
└── .env.local                       ← real credentials (gitignored)
```
