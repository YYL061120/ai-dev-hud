import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CodexSessionMetadataStatus } from '@aiusage/core'
import { codexStatus } from './launcher.js'
const exec = promisify(execFile)
let cached: { until: number; result: CodexSessionMetadataStatus } | undefined
/** Read-only official control-socket probe. Never starts a daemon, scans sessions, or attempts auth. */
export async function codexMetadataStatus(): Promise<CodexSessionMetadataStatus> {
  if (cached && cached.until > Date.now()) return { ...cached.result }
  const cli = await codexStatus()
  let result: CodexSessionMetadataStatus = { available: false, reason: 'cli-unavailable', source: 'official-codex-app-server', ...(cli.version ? { version: cli.version } : {}) }
  if (cli.available && cli.executable) {
    try {
      await exec(cli.executable, ['app-server', 'daemon', 'version'], { windowsHide: true, timeout: 3000, maxBuffer: 4096 })
      result.reason = 'adapter-unavailable'
    } catch { result.reason = 'daemon-unreachable' }
  }
  cached = { until: Date.now() + 15_000, result }
  return { ...result }
}
