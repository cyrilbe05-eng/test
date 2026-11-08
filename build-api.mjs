// Pre-bundle the API for Vercel. Outputs api/[...slug].mjs with a
// createRequire banner so CJS dependencies (e.g. @aws-sdk) work in ESM.
import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [resolve(__dirname, 'api/[...slug].ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: resolve(__dirname, 'api/[...slug].mjs'),
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
  },
})

console.log('API bundle written to api/[...slug].mjs')
