import { spawnSync } from 'node:child_process'
import { mkdirSync, chmodSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export function buildDirectoryGuard(outputDirectory) {
  if (process.platform === 'win32') return
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('Unsupported native publication platform')
  const native = fileURLToPath(new URL('../native/', import.meta.url))
  mkdirSync(resolve(native, 'bin'), { recursive: true })
  const binary = resolve(native, 'bin/hud-directory-guard')
  // Use the OS toolchain; never download or install a compiler at build/runtime.
  const compiler = process.platform === 'darwin' ? '/usr/bin/clang' : '/usr/bin/cc'
  const result = spawnSync(compiler, ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', resolve(native, 'directory-guard.c'), '-o', binary], { stdio: 'inherit', timeout: 60_000 })
  if (result.error || result.status !== 0) throw new Error('Native guard build failed; an already installed OS C toolchain is required')
  chmodSync(binary, 0o700)
  if (outputDirectory) {
    mkdirSync(outputDirectory, { recursive: true })
    const destination = resolve(outputDirectory, 'hud-directory-guard')
    copyFileSync(binary, destination); chmodSync(destination, 0o700)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildDirectoryGuard(process.argv[2])
