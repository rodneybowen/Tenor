import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path matrix:
//   • `npm run build`     → '/Tenor/'  (GitHub Pages project path)
//   • `npm run build:ios` → '/'        (Capacitor webview has no subpath)
//   • dev (`npm run dev`) → '/'
//
// CAPACITOR=1 is set by the build:ios script (see package.json). When
// it's on, the bundle is consumed by Capacitor's iOS shell, not by
// GitHub Pages, so we drop the /Tenor/ prefix.
// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const forCapacitor = process.env.CAPACITOR === '1';
  const isProdWeb = command === 'build' && !forCapacitor;
  return {
    base: isProdWeb ? '/Tenor/' : '/',
    plugins: [react()],
  };
});
