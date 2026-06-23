# Tenor — push to GitHub + iPhone

Run every command from this folder:
`/Users/rohanboda/Documents/Claude/Projects/Vibes are coding/Tenor/repo`

## 1. Push to GitHub (web auto-deploys)

```bash
git add -A
git commit -m "describe what changed"
git push
```

Wait ~1–2 min, then refresh https://rodneybowen.github.io/Tenor/.

## 2. Push to iPhone (Xcode)

```bash
npm run ios:open
```

In Xcode when it opens:

1. Plug iPhone in, unlock it.
2. Top toolbar → device dropdown (next to the "Tenor" scheme) → pick your iPhone.
3. Click ▶ (or press ⌘R). App installs and launches.

First time after a fresh install, if iPhone says "Untrusted Developer":
**Settings → General → VPN & Device Management → tap your profile → Trust.**

## Notes

- Free Apple ID install expires after 7 days. Just repeat step 2 to refresh.
- iOS does NOT auto-update from a GitHub push — you must re-run step 2.
- If you only changed web code and Xcode is already open, you can run
  `npm run build:ios` instead of `npm run ios:open`, then ⌘R in Xcode.
