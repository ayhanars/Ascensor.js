import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites under /<repo>/, not /. GITHUB_ACTIONS
  // is set automatically in every Actions run, so local `npm run dev` /
  // `npm run build` are unaffected.
  base: process.env.GITHUB_ACTIONS ? '/Ascensor.js/' : '/',
})
