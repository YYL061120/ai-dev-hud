import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { normalizeClaudeStatusline, normalizeCodexRateLimits, type ToolSubscription } from '@aiusage/core'
import { AIUSAGE_DIR } from '../config.js'
import { codexStatus } from './launcher.js'
import { readManagedClaude } from './claude-observation.js'
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
  })().then(value => { cache = { until: Math.min(Date.now() + (value ? 15_000 : 1000), value?.validUntil ?? Infinity), value }; return value }).finally(() => { pending = undefined })
  return pending
}
export function readCodexProxy(executable: string): Promise<ToolSubscription | undefined> {
  return readCodexRpc(executable, ['app-server', 'proxy'], 2500, true)
}
export function readCodexStdio(executable: string): Promise<ToolSubscription | undefined> {
  return readCodexRpc(executable, ['app-server', '--listen', 'stdio://', '-c', 'analytics.enabled=false'], 5000, true)
}
function readCodexRpc(executable: string, args: string[], timeout: number, graceful: boolean): Promise<ToolSubscription | undefined> {
  return new Promise(resolve => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, CODEX_HOME: process.env.CODEX_HOME || join(homedir(), '.codex') } })
    let buffer = '', bytes = 0, finished = false
    let result: ToolSubscription | undefined, termination: ReturnType<typeof setTimeout> | undefined
    let identity: string | undefined, quota: ToolSubscription | undefined, verified = false, expected = 1
    const generation = randomUUID()
    const send = (id: number, method: string, params?: object) => child.stdin.write(JSON.stringify({ id, method, ...(params ? { params } : {}) }) + '\n')
    const accountIdentity = (value: any): string | undefined => {
      const account = value?.account
      return account?.type === 'chatgpt' && typeof account.email === 'string' && account.email.trim() && typeof account.planType === 'string' && account.planType.trim() ? JSON.stringify([account.type, account.email, account.planType]) : undefined
    }
    const finish = (value?: ToolSubscription) => {
      if (finished) return
      finished = true; result = value; identity = undefined; quota = undefined; clearTimeout(timer); child.stdin.end()
      if (graceful) termination = setTimeout(() => { result = undefined; child.kill(); resolve(undefined) }, 1000)
      else { child.kill(); resolve(result) }
    }
    const timer = setTimeout(() => finish(), timeout)
    const invalidate = () => { result = undefined; verified = false; finish() }
    child.on('error', invalidate); child.stdin.on('error', invalidate)
    child.on('exit', (code, signal) => { if (!verified || code !== 0 || signal) invalidate() })
    child.on('close', (code, signal) => { if (!finished) finish(); clearTimeout(termination); resolve(verified && (!graceful || code === 0 && !signal) ? result : undefined) })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > 1024 * 1024) { invalidate(); return }
      buffer += chunk.toString('utf8')
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          const message = JSON.parse(line)
          // Never supply credentials or begin another auth flow in response to a server request.
          if (['account/chatgptAuthTokens/refresh', 'account/updated', 'account/login/completed'].includes(message.method)) { invalidate(); return }
          if (finished) continue
          if (![1, 2, 3, 4].includes(message.id)) continue
          if (message.id !== expected || message.error) { invalidate(); return }
          if (message.id === 1) {
            child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
            expected = 2; send(2, 'account/read', { refreshToken: false })
          } else if (message.id === 2) {
            identity = accountIdentity(message.result)
            if (!identity) { invalidate(); return }
            expected = 3; send(3, 'account/rateLimits/read')
          } else if (message.id === 3) {
            quota = normalizeCodexRateLimits(message.result); expected = 4; send(4, 'account/read', { refreshToken: false })
          } else {
            if (!identity || accountIdentity(message.result) !== identity || !quota) { invalidate(); return }
            verified = true
            const validUntil = Math.min(Date.now() + 30_000, ...quota.windows.flatMap(window => window.resetsAt === null ? [] : [window.resetsAt]))
            finish({ ...quota, generation, validUntil }); continue
          }
        } catch { invalidate(); return }
      }
    })
    child.stdin.write(JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'ai-dev-hud', version: '1.0.0' }, capabilities: { experimentalApi: true } } }) + '\n')
  })
}
/** Optional stdin adapter: stores only normalized quota fields, never the incoming statusline payload. */
export async function captureClaudeSubscription(input: AsyncIterable<Buffer | string>, directory = AIUSAGE_DIR): Promise<void> {
  const observedAt = Date.now()
  const observationOrder = process.hrtime.bigint().toString()
  let text = '', bytes = 0
  for await (const chunk of input) { bytes += Buffer.byteLength(chunk); if (bytes > 256 * 1024) throw new Error('Statusline input exceeds limit'); text += chunk.toString() }
  const snapshot = normalizeClaudeStatusline(JSON.parse(text), observedAt)
  await mkdir(directory, { recursive: true })
  // SQLite's OS lock is released on process death; no PID or age-based stealing.
  const lock = new Database(join(directory, 'subscription-claude-lock.sqlite'), { timeout: 0 }), started = performance.now()
  try {
    while (true) {
      try { lock.exec('BEGIN IMMEDIATE'); break } catch (error) {
        if ((error as { code?: string }).code !== 'SQLITE_BUSY' || performance.now() - started > 2000) throw new Error('Subscription capture lock unavailable')
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    const target = join(directory, 'subscription-claude.json')
    try {
      const existing = JSON.parse(await readFile(target, 'utf8'))
      if (Number.isFinite(existing.observedAt) && existing.observedAt > observedAt) return
      if (existing.observedAt === observedAt && Array.isArray(existing.windows)) {
        if (!existing.windows.length && snapshot.windows.length) return
        if (snapshot.windows.length && typeof existing.observationOrder === 'string' && /^\d+$/.test(existing.observationOrder) && BigInt(existing.observationOrder) >= BigInt(observationOrder)) return
      }
    } catch { /* No valid prior observation. */ }
    const temporary = join(directory, `subscription-claude-${randomUUID()}.tmp`)
    await writeFile(temporary, JSON.stringify({ ...snapshot, observationOrder }), { mode: 0o600 })
    await rename(temporary, target)
  } finally { if (lock.inTransaction) lock.exec('ROLLBACK'); lock.close() }
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
  const values = await Promise.all([readCodexSubscriptions(), readManagedClaude()])
  return values.filter((value): value is ToolSubscription => !!value).map(value => value.generation && (value.validUntil ?? 0) > Date.now() ? value : { ...value, windows: [] })
}
