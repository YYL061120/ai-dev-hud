import { existsSync } from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CodexLauncherStatus } from '@aiusage/core'
import { canonicalDirectory, LocalControlError } from './projects.js'
const exec = promisify(execFile)
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
export async function codexStatus(): Promise<CodexLauncherStatus> {
  if (process.platform !== 'win32') return { available: false, reason: 'Interactive launcher currently supports Windows; copy the kickoff for other devices' }
  const candidates = [path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe')]
  try { const found = await exec('where.exe', ['codex.exe'], { windowsHide: true, timeout: 3000, maxBuffer: 4096 }); candidates.push(...found.stdout.trim().split(/\r?\n/)) } catch {}
  for (const executable of candidates) if (path.isAbsolute(executable) && existsSync(executable)) {
    try {
      const result = await exec(executable, ['--version'], { windowsHide: true, timeout: 5000, maxBuffer: 4096 })
      if (/^codex-cli \d/.test(result.stdout.trim())) return { available: true, executable, version: result.stdout.trim() }
    } catch {}
  }
  return { available: false, reason: 'Codex CLI executable not found; install/sign in manually, then refresh' }
}
/** No user prompt, flags, or shell fragments are accepted. Process cwd is the registered directory. */
export function launchScript(executable: string, cwd: string): string {
  return `Start-Process -FilePath ${quote(executable)} -WorkingDirectory ${quote(cwd)}`
}
export async function launchCodex(cwd: string): Promise<{ started: true; autoSubmit: false }> {
  const root = await canonicalDirectory(cwd)
  const status = await codexStatus()
  if (!status.available || !status.executable) throw new LocalControlError(status.reason ?? 'Codex unavailable', 409)
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const encoded = Buffer.from(`$ErrorActionPreference='Stop'; ${launchScript(status.executable, root)}`, 'utf16le').toString('base64')
  await exec(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, timeout: 10000, maxBuffer: 4096 })
  return { started: true, autoSubmit: false }
}
