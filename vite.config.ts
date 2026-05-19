import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project Pages serves at https://<user>.github.io/Tenor/, so the
// production bundle needs that base. Dev/preview stays at '/'.
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Tenor/' : '/',
  plugins: [react()],
}))
