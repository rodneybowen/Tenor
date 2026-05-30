# Tenor — Native iOS (Capacitor) setup

Capacitor wraps the existing React app in a native iOS shell. Same `dist/` bundle as the web, just loaded by a UIKit `WKWebView` instead of GitHub Pages. **The web build is unaffected** — `npm run build` still produces the GitHub Pages bundle with `/Tenor/` base; `npm run build:ios` produces an iOS-targeted bundle with `/` base.

---

## One-time setup (your Mac, ~10 minutes)

Run all commands from `tenor-app/`.

### 1. Generate the Xcode project

```bash
npm run build           # produce dist/ (any base is fine — we resync next)
npx cap add ios         # creates ios/ with the Xcode project
```

The first `npx cap add ios` may also install CocoaPods if you don't have it:
```bash
sudo gem install cocoapods   # only if cap add complains
```

### 2. Build for iOS and open Xcode

```bash
npm run ios:open
```

That script does `CAPACITOR=1 vite build && npx cap sync ios && npx cap open ios`. It rebuilds with the right base path, copies the bundle into `ios/App/App/public/`, and opens Xcode on the project.

### 3. In Xcode — sign with your free Apple ID

1. Click the **Tenor** target → **Signing & Capabilities**.
2. **Team**: pick your free Apple ID (add it under Xcode → Settings → Accounts if it isn't there).
3. **Bundle Identifier**: keep `com.tenor.app` (or change to something unique to your Apple ID if Xcode rejects this one).
4. Plug your iPhone into the Mac. Pick it as the run destination (top bar).
5. Hit **Run** (▶ or ⌘R).
6. First-time on the phone: **Settings → General → VPN & Device Management → Trust** your developer certificate.

The app installs and launches. **Free-Apple-ID quirks**: the install expires after 7 days (rebuild + redeploy via Xcode to refresh), and you're capped at 3 sideloaded apps simultaneously.

### 4. Configure Supabase for the native OAuth callback

Critical, or Google sign-in will silently bounce you back to the auth screen.

1. Supabase Dashboard → **Authentication → URL Configuration**.
2. Under **Redirect URLs**, add a line (exact, no trailing slash):
   ```
   tenor://auth-callback
   ```
3. Save.

Existing entries (`https://rodneybowen.github.io/Tenor/**`, `http://localhost:5175/**`, etc.) stay — they're needed for the web build.

### 5. (Optional) Update Google Cloud Console

Only needed if you ever see "redirect_uri_mismatch" from Google itself. Usually Supabase's callback (`https://YOUR-PROJECT.supabase.co/auth/v1/callback`) is already there from the initial Google OAuth setup, and nothing changes for native — Google still talks to Supabase, Supabase then talks to `tenor://auth-callback`.

---

## Day-to-day iteration

After the one-time setup, the loop is:

```bash
npm run ios:open   # rebuild + sync + open Xcode
# then ⌘R in Xcode to install on your iPhone
```

If you only changed React code and Xcode is already open, you can also:
```bash
npm run build:ios  # same as above but doesn't reopen Xcode
# then ⌘R in Xcode
```

For pure web iteration, nothing changes — `npm run dev` works, `npm run build` produces the GitHub Pages bundle, the deploy workflow republishes on push.

---

## What's wired

| Capability | Web build | Native build |
|---|---|---|
| All UI / data / Supabase queries | ✅ | ✅ (same `dist/`) |
| Email / password sign-in | ✅ | ✅ |
| Google sign-in | ✅ (works in Safari; broken in iOS PWA — known limitation) | ✅ via `tenor://auth-callback` |
| Haptics on chip tap / snap | Web Vibration API (Android only) | Native Taptic Engine |
| Voice transcription | Web Speech API | Web Speech API (works in WKWebView) |
| Push notifications | n/a | not wired (free Apple ID can't ship them anyway) |

Code paths live in:
- `capacitor.config.ts` — app id, URL scheme, webDir.
- `src/lib/haptics.ts` — unified haptics. Native on iOS, Web Vibration elsewhere.
- `src/lib/nativeAuth.ts` — native Google OAuth using Capacitor Browser + URL scheme.
- `src/screens/AuthScreen.tsx` — branches between `signInWithGoogle` (web) and `signInWithGoogleNative` (Capacitor).
- `vite.config.ts` — base path toggles on `CAPACITOR=1`.

---

## Troubleshooting

- **"Untrusted Developer" on first launch** → Settings → General → VPN & Device Management → trust.
- **Xcode refuses bundle ID** → it's taken by another Apple ID's app. Change `appId` in `capacitor.config.ts` (e.g. `com.tenor.<yourname>`), `npx cap sync ios`, retry.
- **Google sign-in opens Safari and never returns** → the `tenor://auth-callback` redirect URL isn't in Supabase's allowlist (step 4 above).
- **Blank screen on launch** → the JS bundle didn't get into `ios/App/App/public/`. Re-run `npm run build:ios`.
- **Web GitHub Pages broke after a Capacitor change** → check `dist/index.html` references `/Tenor/...` for assets, not `/`. If wrong, you ran `npm run build:ios` last. Run `npm run build` and push.
