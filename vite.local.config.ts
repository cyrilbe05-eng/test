// Local development config (npm run local:dev). Identical to vite.config.ts,
// plus a proxy that sends /api to the local API server on port 3001.
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

export default mergeConfig(base, defineConfig({
  server: {
    // IPv4 loopback explicitly: IPv6 loopback (::1) is unreachable on some
    // Windows setups, and this keeps the site off the local network.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3001' },
  },
}))
