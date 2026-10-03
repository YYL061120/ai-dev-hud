import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, writeFile, rename, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { normalizeClaudeStatusline, normalizeCodexRateLimits, type ToolSubscription } from '@aiusage/core'
import { AIUSAGE_DIR } from '../config.js'
import { codexStatus } from './launcher.js'
const exec = promisify(execFile)
let cache: { until: number; value: ToolSubscription | undefined } | undefined
let pending: Promise<ToolSubscription | undefined> | undefined

/** Existing daemon first, otherwise one bounded official stdio child using the CLI's existing login. */
export function readCodexSubscriptions(): Promise<ToolSubscription | undefined> {
  if (cache && cache.until > Date.now()) return Promise.resolve(cache.value)
  if (pending) return pending
  pending = (async () => {
    const cli = await codexStatus()
    if (!cli.available || !cli.executable) return undefined
    try {
      await exec(cli.executable, ['app-server', 'daemon', 'version'], { windowsHide: true, timeout: 1500, maxBuffer: 4096 })
      const observed = await readCodexProxy(cli.executable)
      if (observed) return observed
    } catch { /* The ephemeral stdio transport does not require a daemon. */ }
    return readCodexStdio(cli.executable)
  })().then(value => { cache = { until: Date.now() + 60_000, value }; return value }).finally(() => { pending = undefined })
  return pending
}
export function readCodexProxy(executable: string): Promise<ToolSubscription | undefined> {
  return readCodexRpc(executable, ['app-server', 'proxy'], 2500, false)
}
export function readCodexStdio(executable: string): Promise<ToolSubscription | undefined> {
  return readCodexRpc(executable, ['app-server', '--listen', 'stdio://', '-c', 'analytics.enabled=false'], 5000, true)
}
function readCodexRpc(executable: string, args: string[], timeout: number, graceful: boolean): Promise<ToolSubscription | undefined> {
  return new Promise(resolve => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, CODEX_HOME: process.env.CODEX_HOME || join(homedir(), '.codex') } })
    let buffer = '', bytes = 0, finished = false
    let result: ToolSubscription | undefined, termination: ReturnType<typeof setTimeout> | undefined
    const finish = (value?: ToolSubscription) => {
      if (finished) return
      finished = true; result = value; clearTimeout(timer); child.stdin.end()
      if (graceful) termination = setTimeout(() => { child.kill(); resolve(result) }, 1000)
      else { child.kill(); resolve(result) }
    }
    const timer = setTimeout(() => finish(), timeout)
    child.on('error', () => finish()); child.on('exit', () => finish()); child.stdin.on('error', () => finish())
    child.on('close', () => { if (!finished) finish(); clearTimeout(termination); resolve(result) })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > 1024 * 1024) { finish(); return }
      buffer += chunk.toString('utf8')
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          const message = JSON.parse(line)
          // Never supply credentials or begin another auth flow in response to a server request.
          if (message.method === 'account/chatgptAuthTokens/refresh') { finish(); return }
          if (message.id === 1) {
            if (message.error) { finish(); return }
            child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
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
  const observedAt = Date.now()
  let text = '', bytes = 0
  for await (const chunk of input) { bytes += Buffer.byteLength(chunk); if (bytes > 256 * 1024) throw new Error('Statusline input exceeds limit'); text += chunk.toString() }
  const snapshot = normalizeClaudeStatusline(JSON.parse(text), observedAt)
  await mkdir(directory, { recursive: true })
  const lock = join(directory, 'subscription-claude.lock'), started = Date.now()
  while (true) {
    try { await mkdir(lock); break } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() - started > 2000) throw new Error('Subscription capture lock unavailable')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }
  try {
  const target = join(directory, 'subscription-claude.json')
  try { const existing = JSON.parse(await readFile(target, 'utf8')); if (Number.isFinite(existing.observedAt) && existing.observedAt >= observedAt) return } catch { /* No valid prior observation. */ }
  const temporary = join(directory, `subscription-claude-${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 })
  await rename(temporary, target)
  } finally { await rmdir(lock) }
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
  // These passive transports do not prove the currently selected login generation.
  // Keep observations internal; a cache or global statusline file cannot authorize quota display.
  return values.filter((value): value is ToolSubscription => !!value).map(value => ({ ...value, windows: [] }))
}
