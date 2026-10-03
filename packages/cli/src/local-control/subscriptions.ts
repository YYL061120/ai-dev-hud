import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { normalizeClaudeStatusline, normalizeCodexRateLimits, type ToolSubscription } from '@aiusage/core'
import { AIUSAGE_DIR } from '../config.js'
import { codexStatus } from './launcher.js'
const exec = promisify(execFile)
let cache: { until: number; value: ToolSubscription | undefined } | undefined
let pending: Promise<ToolSubscription | undefined> | undefined

/** Only attaches to an already-running daemon. No auth/account reads, startup or credential access. */
export function readCodexSubscriptions(): Promise<ToolSubscription | undefined> {
  if (cache && cache.until > Date.now()) return Promise.resolve(cache.value)
  if (pending) return pending
  pending = (async () => {
    const cli = await codexStatus()
    if (!cli.available || !cli.executable) return undefined
    try {
      await exec(cli.executable, ['app-server', 'daemon', 'version'], { windowsHide: true, timeout: 1500, maxBuffer: 4096 })
      return await readCodexProxy(cli.executable)
    } catch { return undefined }
  })().then(value => { cache = { until: Date.now() + 60_000, value }; return value }).finally(() => { pending = undefined })
  return pending
}
export function readCodexProxy(executable: string): Promise<ToolSubscription | undefined> {
  return new Promise(resolve => {
    const child = spawn(executable, ['app-server', 'proxy'], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
    let buffer = '', bytes = 0, finished = false
    const finish = (value?: ToolSubscription) => { if (finished) return; finished = true; clearTimeout(timer); child.stdin.end(); child.kill(); resolve(value) }
    const timer = setTimeout(() => finish(), 2500)
    child.on('error', () => finish()); child.on('exit', () => finish()); child.stdin.on('error', () => finish())
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > 1024 * 1024) { finish(); return }
      buffer += chunk.toString('utf8')
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          const message = JSON.parse(line)
          if (message.id === 1) {
            if (message.error) { finish(); return }
            child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n')
            child.stdin.write(JSON.stringify({ id: 2, method: 'account/rateLimits/read' }) + '\n')
          } else if (message.id === 2) { finish(message.error ? undefined : normalizeCodexRateLimits(message.result)); return }
        } catch { finish(); return }
      }
    })
    child.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'ai-dev-hud', version: '1.0.0' }, capabilities: { experimentalApi: true } } }) + '\n')
  })
}
/** Optional stdin adapter: stores only normalized quota fields, never the incoming statusline payload. */
export async function captureClaudeSubscription(input: AsyncIterable<Buffer | string>, directory = AIUSAGE_DIR): Promise<void> {
  let text = '', bytes = 0
  for await (const chunk of input) { bytes += Buffer.byteLength(chunk); if (bytes > 256 * 1024) throw new Error('Statusline input exceeds limit'); text += chunk.toString() }
  const snapshot = normalizeClaudeStatusline(JSON.parse(text))
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `subscription-claude-${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 })
  await rename(temporary, join(directory, 'subscription-claude.json'))
}
export async function readClaudeSubscription(directory = AIUSAGE_DIR): Promise<ToolSubscription | undefined> {
  try {
    const text = await readFile(join(directory, 'subscription-claude.json'), 'utf8')
    if (Buffer.byteLength(text) > 16 * 1024) return undefined
    const stored = JSON.parse(text)
    if (stored.source !== 'claude-statusline' || !Number.isFinite(stored.observedAt) || !Array.isArray(stored.windows)) return undefined
    const rate_limits = Object.fromEntries(stored.windows.filter((window: any) => window.bucketId === 'claude' && ['five_hour', 'seven_day'].includes(window.slot)).map((window: any) => [window.slot, { used_percentage: window.usedPercent, resets_at: window.resetsAt === null ? null : window.resetsAt / 1000 }]))
    return normalizeClaudeStatusline({ rate_limits }, stored.observedAt)
  } catch { return undefined }
}
export async function readSubscriptions(): Promise<ToolSubscription[]> {
  const values = await Promise.all([readCodexSubscriptions(), readClaudeSubscription()])
  return values.filter((value): value is ToolSubscription => !!value)
}
