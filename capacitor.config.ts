import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor — native iOS shell for Tenor.
 *
 * - `webDir: 'dist'` reuses the same Vite production bundle that
 *   GitHub Pages serves. To build for iOS, run `npm run build:ios`
 *   which sets `CAPACITOR=1` so Vite uses base '/' instead of
 *   '/Tenor/' (the iOS webview has no /Tenor/ subpath).
 * - `appId` is what Xcode signs against. Reverse-DNS, lowercase,
 *   no hyphens. Free Apple IDs can sign for any unique bundle id
 *   from Xcode (no Developer Portal needed for personal builds).
 * - `scheme.ios = 'tenor'` registers `tenor://` as a custom URL
 *   scheme so Supabase OAuth (Google) can redirect back into the
 *   app from the in-app browser. See src/lib/nativeAuth.ts.
 */
const config: CapacitorConfig = {
  appId: 'com.tenor.app',
  appName: 'Tenor',
  webDir: 'dist',
  ios: {
    scheme: 'tenor',
    // Edge-to-edge: WKWebView extends behind the home indicator so the
    // aurora gradient paints all the way down — no white inset / "notch".
    contentInset: 'never',
  },
  plugins: {
    // Splash screen and status bar can be configured later; leaving
    // defaults so nothing extra needs to be installed.
  },
};

export default config;
