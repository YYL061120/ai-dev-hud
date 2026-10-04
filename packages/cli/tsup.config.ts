import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'
import { buildDirectoryGuard } from './scripts/build-directory-guard.mjs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  noExternal: ['@aiusage/core'],
  onSuccess: async () => { buildDirectoryGuard(process.argv.includes('dist-collector') ? 'dist-collector' : 'dist') },
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      __VERSION__: JSON.stringify(pkg.version),
    }
  },
})
