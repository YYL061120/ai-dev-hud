const { spawnSync } = require('node:child_process')
const { mkdtempSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

// Some upstream integration suites save configuration through the real config
// module. Give the complete Windows test process tree a disposable profile.
// Keep it for diagnosis; this script never removes files from any profile.
const testProfile = mkdtempSync(join(tmpdir(), 'ai-dev-hud-tests-'))
const testEnv = { ...process.env }
if (process.platform === 'win32') {
  testEnv.USERPROFILE = testProfile
  testEnv.APPDATA = join(testProfile, 'AppData', 'Roaming')
  testEnv.LOCALAPPDATA = join(testProfile, 'AppData', 'Local')
  mkdirSync(testEnv.APPDATA, { recursive: true })
  mkdirSync(testEnv.LOCALAPPDATA, { recursive: true })
}
const pnpmEntry = process.env.npm_execpath
if (!pnpmEntry) throw new Error('Run this suite with pnpm.cmd test so the pinned package manager is available.')
console.log(`Windows test profile: ${testProfile}`)
const result = spawnSync(process.execPath, [pnpmEntry, '-r', 'test'], { env: testEnv, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
