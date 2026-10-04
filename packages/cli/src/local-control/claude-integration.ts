import { readFile, writeFile, rename, mkdir, unlink, lstat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import type { ClaudeStatuslineStatus, ClaudeStatuslinePreview } from '@aiusage/core'
import { AIUSAGE_DIR } from '../config.js'
import { LocalControlError } from './projects.js'
import { withFileMutex } from './file-mutex.js'
export interface ClaudeInstallation {
  version: 1; id: string; enabled: boolean; configDirectory: string
  originalPresent: boolean; original?: unknown; settingsExisted: boolean
  managed: object; enabledRevision: string
}
export const installationPath = (directory: string) => join(directory, 'claude-statusline-installation.json')
const hash = (text: string | null) => createHash('sha256').update(text === null ? 'absent' : `present:${text}`).digest('hex')
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
async function settings(directory: string): Promise<{ text: string | null; value: Record<string, unknown> }> {
  const file = join(directory, 'settings.json')
  try {
    if ((await lstat(file)).isSymbolicLink()) throw new LocalControlError('Claude settings symlink is not supported; use manual configuration', 409)
    const text = await readFile(file, 'utf8')
    if (Buffer.byteLength(text) > 1024 * 1024) throw new Error()
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return { text, value }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { text: null, value: {} }
    throw error instanceof LocalControlError ? error : new LocalControlError('Claude settings cannot be safely read; existing configuration is preserved', 409)
  }
}
export async function readClaudeInstallation(directory = AIUSAGE_DIR): Promise<ClaudeInstallation | undefined> {
  try { const value = JSON.parse(await readFile(installationPath(directory), 'utf8')); return value.version === 1 && typeof value.id === 'string' && typeof value.configDirectory === 'string' ? value : undefined } catch { return undefined }
}
export async function managedClaudeActive(directory: string, id: string): Promise<ClaudeInstallation | undefined> {
  const state = await readClaudeInstallation(directory)
  if (!state?.enabled || state.id !== id) return undefined
  try { return same((await settings(state.configDirectory)).value.statusLine, state.managed) ? state : undefined } catch { return undefined }
}
async function atomic(file: string, text: string) {
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, text, { mode: 0o600 }); await rename(temporary, file)
}
export class ClaudeStatuslineManager {
  private previews = new Map<string, { value: ClaudeStatuslinePreview; revision: string }>()
  constructor(readonly configDirectory = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), readonly directory = AIUSAGE_DIR, readonly cli = resolve(process.argv[1]), readonly node = process.execPath) {}
  async status(): Promise<ClaudeStatuslineStatus> {
    const current = await settings(this.configDirectory), state = await readClaudeInstallation(this.directory)
    const owns = !!state && state.configDirectory === this.configDirectory && same(current.value.statusLine, state.managed)
    return { enabled: owns && !!state?.enabled, configured: current.value.statusLine != null, originalPresent: !!state?.originalPresent, conflict: !!state?.enabled && !owns, canRestore: owns && hash(current.text) === state?.enabledRevision, managedConfigured: owns }
  }
  async preview(action: 'enable' | 'disable'): Promise<ClaudeStatuslinePreview> {
    const current = await settings(this.configDirectory), status = await this.status()
    if (status.conflict || action === 'disable' && !status.canRestore) throw new LocalControlError('Claude configuration changed externally; automatic overwrite or restoration is blocked', 409)
    if (action === 'enable' && (status.enabled || status.managedConfigured)) throw new LocalControlError('Managed wrapper remains configured; restore the original statusline before reinstalling', 409)
    const original = current.value.statusLine as any
    if (action === 'enable' && original != null && (original.type !== 'command' || typeof original.command !== 'string' || !original.command.trim())) throw new LocalControlError('Existing statusline cannot be composed safely; manual configuration is required', 409)
    const value = { id: randomUUID(), action, expiresAt: Date.now() + 120_000, originalPresent: original != null, settingsExisted: current.text !== null }
    this.previews.clear(); this.previews.set(value.id, { value, revision: hash(current.text) }); return value
  }
  async confirm(id: string, confirm: boolean): Promise<ClaudeStatuslineStatus> {
    if (confirm !== true) throw new LocalControlError('Explicit UI confirmation is required', 400)
    const pending = this.previews.get(id); this.previews.delete(id)
    if (!pending || pending.value.expiresAt <= Date.now()) throw new LocalControlError('Preview expired; preview again before changing settings', 409)
    await withFileMutex(this.directory, 'claude-integration-lock.sqlite', async () => {
      const current = await settings(this.configDirectory)
      if (hash(current.text) !== pending.revision) throw new LocalControlError('Claude configuration changed after preview; existing settings were preserved', 409)
      if (pending.value.action === 'enable') {
        const wrapper = join(this.directory, 'claude-statusline-wrapper.cjs'), installationId = randomUUID()
        for (const item of [this.node, wrapper, this.cli]) if (/["$`%!\r\n]/.test(item)) throw new LocalControlError('Managed path contains unsupported shell characters; use manual configuration', 409)
        const original = current.value.statusLine, managed = { ...(original && typeof original === 'object' ? original : {}), type: 'command', command: `"${this.node.replaceAll('\\', '/')}" "${wrapper.replaceAll('\\', '/')}"` }
        const next = JSON.stringify({ ...current.value, statusLine: managed }, null, 2) + '\n'
        const state: ClaudeInstallation = { version: 1, id: installationId, enabled: false, configDirectory: this.configDirectory, originalPresent: original !== undefined, ...(original !== undefined ? { original } : {}), settingsExisted: current.text !== null, managed, enabledRevision: hash(next) }
        // Backup only statusLine; never copy unrelated settings or credentials.
        await atomic(installationPath(this.directory), JSON.stringify(state))
        const code = `const {spawn}=require('node:child_process');const c=spawn(${JSON.stringify(this.node)},${JSON.stringify([this.cli, 'claude-statusline', '--installation', installationId, '--state-dir', this.directory])},{stdio:'inherit',windowsHide:true});c.on('error',()=>process.exitCode=1);c.on('close',(n)=>process.exitCode=n||0);\n`
        await atomic(wrapper, code); await mkdir(this.configDirectory, { recursive: true })
        if (hash((await settings(this.configDirectory)).text) !== pending.revision) throw new LocalControlError('Claude configuration changed; enable cancelled', 409)
        await atomic(join(this.configDirectory, 'settings.json'), next)
        try { await atomic(installationPath(this.directory), JSON.stringify({ ...state, enabled: true })) } catch {
          try {
            if (hash((await settings(this.configDirectory)).text) === hash(next)) {
              if (current.text === null) await unlink(join(this.configDirectory, 'settings.json'))
              else await atomic(join(this.configDirectory, 'settings.json'), current.text)
            }
          } catch { /* Prepared backup remains recoverable through explicit restore. */ }
          throw new LocalControlError('Enable was incomplete; backup retained. Refresh connection status and restore if available', 500)
        }
      } else {
        const state = await readClaudeInstallation(this.directory)
        if (!state || hash(current.text) !== state.enabledRevision || !same(current.value.statusLine, state.managed)) throw new LocalControlError('External changes prevent automatic restoration', 409)
        const restored = { ...current.value }; if (state.originalPresent) restored.statusLine = state.original; else delete restored.statusLine
        if (hash((await settings(this.configDirectory)).text) !== state.enabledRevision) throw new LocalControlError('External changes prevent automatic restoration', 409)
        if (!state.settingsExisted && !Object.keys(restored).length) await unlink(join(this.configDirectory, 'settings.json'))
        else await atomic(join(this.configDirectory, 'settings.json'), JSON.stringify(restored, null, 2) + '\n')
        await atomic(installationPath(this.directory), JSON.stringify({ ...state, enabled: false }))
      }
    })
    await atomic(join(this.directory, 'claude-quota-invalidation.json'), JSON.stringify({ generation: randomUUID() }))
    return this.status()
  }
  async clear(): Promise<void> {
    await withFileMutex(this.directory, 'claude-session-lock.sqlite', async () => {
      const file = join(this.directory, 'claude-session-observations.json')
      let stored: any; try { stored = JSON.parse(await readFile(file, 'utf8')) } catch { stored = { sessions: [] } }
      const responses = [...(stored.blockedResponses || []), ...(stored.sessions || []).map((session: any) => ({ key: session.key, fingerprint: session.fingerprint }))]
      const unique = new Map(responses.map((item: any) => [`${item.key}:${item.fingerprint}`, item]))
      await atomic(file, JSON.stringify({ ...stored, invalidAt: Date.now(), overflowUntil: undefined, reason: 'cleared', blockedResponses: [...unique.values()].slice(-64), sessions: (stored.sessions || []).map((session: any) => ({ ...session, blocked: true })) }))
      await atomic(join(this.directory, 'claude-quota-invalidation.json'), JSON.stringify({ generation: randomUUID() }))
    })
  }
  async pause(): Promise<ClaudeStatuslineStatus> {
    await withFileMutex(this.directory, 'claude-integration-lock.sqlite', async () => {
      const state = await readClaudeInstallation(this.directory)
      if (state) await atomic(installationPath(this.directory), JSON.stringify({ ...state, enabled: false }))
      await atomic(join(this.directory, 'claude-quota-invalidation.json'), JSON.stringify({ generation: randomUUID() }))
    })
    return this.status()
  }
}
export function originalStatuslineShell(): string | true {
  if (process.platform !== 'win32') return true
  const bash = process.env.CLAUDE_CODE_GIT_BASH_PATH
  if (bash && existsSync(bash)) return bash
  for (const file of ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files/Git/usr/bin/bash.exe']) if (existsSync(file)) return file
  return true
}
