import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import fs from 'node:fs'

// Version identifier injected into the bundle + written to dist/version.txt.
// On Vercel: the git commit SHA. Locally: a build timestamp (still uniquely
// changes each build so dev rebuilds don't trip the "new version" toast).
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || `dev-${Date.now()}`

export default defineConfig({
  plugins: [
    react(),
    {
      // Emit dist/version.txt so the running app can poll it and detect
      // when a fresh deploy has shipped without forcing every user to
      // hard-refresh manually.
      name: 'emit-version-file',
      apply: 'build',
      closeBundle() {
        const out = path.resolve(__dirname, 'dist/version.txt')
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, APP_VERSION)
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
})
