import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { normalizeClaudeStatusline, type ToolSubscription, type ClaudeObservationReason } from '@aiusage/core'
import { AIUSAGE_DIR } from '../config.js'
import { managedClaudeActive, readClaudeInstallation, originalStatuslineShell } from './claude-integration.js'
import { withFileMutex } from './file-mutex.js'
const file = (directory: string) => join(directory, 'claude-session-observations.json')
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
interface SessionObservation extends ToolSubscription { key: string; fingerprint: string; order: string; lastSeenAt: number; responseProgress?: number | null; blocked?: boolean }
interface Store { installation: string; sessions: SessionObservation[]; blockedResponses?: Array<{ key: string; fingerprint: string }>; invalidAt?: number; overflowUntil?: number; reason?: ClaudeObservationReason }
async function readStore(directory: string): Promise<Store | undefined> {
  try {
    const text = await readFile(file(directory), 'utf8'); if (Buffer.byteLength(text) > 64 * 1024) return undefined
    const value = JSON.parse(text)
    return typeof value.installation === 'string' && Array.isArray(value.sessions) && value.sessions.length <= 16 && value.sessions.every((session: any) => session && /^[a-f0-9]{64}$/.test(session.key) && /^[a-f0-9]{64}$/.test(session.fingerprint) && typeof session.order === 'string' && /^\d+$/.test(session.order) && Number.isFinite(session.observedAt) && Number.isFinite(session.validUntil) && typeof session.generation === 'string' && Array.isArray(session.windows) && session.windows.length <= 2) ? value : undefined
  } catch { return undefined }
}
const unknown = (reason: ClaudeObservationReason): ToolSubscription => ({ tool: 'claude-code', scope: 'session-observed', source: 'claude-statusline', observedAt: Date.now(), windows: [], reason })
/** Official session payload projected to windows + opaque session/response hashes only. */
export async function captureManagedClaude(value: unknown, installation: string, directory = AIUSAGE_DIR, observedAt = Date.now(), order = process.hrtime.bigint().toString()): Promise<void> {
  if (!await managedClaudeActive(directory, installation)) return
  const payload = value && typeof value === 'object' ? value as any : {}, snapshot = normalizeClaudeStatusline(payload, observedAt)
  await withFileMutex(directory, 'claude-session-lock.sqlite', async () => {
    if (!await managedClaudeActive(directory, installation)) return
    let stored = await readStore(directory)
    if (!stored || stored.installation !== installation) stored = { installation, sessions: [] }
    if ((stored.invalidAt ?? -Infinity) >= observedAt) return
    if (typeof payload.session_id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(payload.session_id)) {
      stored = { ...stored, invalidAt: observedAt, reason: 'missing-session', sessions: stored.sessions.map(session => ({ ...session, blocked: true })) }
    } else {
      const key = digest(payload.session_id), previous = stored.sessions.find(session => session.key === key)
      const duration = typeof payload.cost?.total_api_duration_ms === 'number' && Number.isFinite(payload.cost.total_api_duration_ms) && payload.cost.total_api_duration_ms >= 0 ? payload.cost.total_api_duration_ms : null
      // A cumulative numeric response counter is metadata, never the input payload.
      // Cleared sessions require strictly newer progress; absent progress cannot prove it.
      if (previous?.blocked && (duration === null || previous.responseProgress == null || duration <= previous.responseProgress)) return
      if (duration !== null && previous?.responseProgress != null && duration < previous.responseProgress) return
      const fingerprint = digest(JSON.stringify([snapshot.windows, duration]))
      if (stored.blockedResponses?.some(item => item.key === key && item.fingerprint === fingerprint)) return
      if (previous && ((previous.lastSeenAt ?? previous.observedAt) > observedAt || (previous.lastSeenAt ?? previous.observedAt) === observedAt && snapshot.windows.length && (!previous.windows.length || BigInt(previous.order) >= BigInt(order)))) return
      stored.sessions = stored.sessions.filter(item => item.blocked || item.key === key || (item.lastSeenAt ?? item.observedAt) > observedAt - 30_000)
      if (previous?.fingerprint !== fingerprint || !snapshot.windows.length) {
        const session: SessionObservation = { ...snapshot, scope: 'session-observed', key, fingerprint, responseProgress: duration ?? previous?.responseProgress ?? null, order, lastSeenAt: observedAt, generation: randomUUID(), validUntil: Math.min(observedAt + 30_000, ...snapshot.windows.flatMap(window => window.resetsAt === null ? [] : [window.resetsAt])) }
        if (!previous && stored.sessions.length === 16) { stored.reason = 'multiple-sessions'; stored.overflowUntil = observedAt + 30_000 }
        else { stored.sessions = [...stored.sessions.filter(item => item.key !== key), session]; stored.reason = undefined }
      } else if (previous) { previous.lastSeenAt = observedAt; previous.order = order }
    }
    const temporary = `${file(directory)}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(stored), { mode: 0o600 }); await rename(temporary, file(directory))
  })
}
export async function readManagedClaude(directory = AIUSAGE_DIR, now = Date.now()): Promise<ToolSubscription> {
  const installation = await readClaudeInstallation(directory)
  if (!installation?.enabled) return unknown('disabled')
  if (!await managedClaudeActive(directory, installation.id)) return unknown('configuration-conflict')
  const store = await readStore(directory)
  if (!store || store.installation !== installation.id) return unknown('waiting-response')
  if ((store.overflowUntil ?? 0) > now) return unknown('multiple-sessions')
  if (store.reason && store.reason !== 'multiple-sessions') return unknown(store.reason)
  const recent = store.sessions.filter(session => !session.blocked && (session.lastSeenAt ?? session.observedAt) + 30_000 > now)
  if (recent.length > 1) return unknown('multiple-sessions')
  const active = store.sessions.filter(session => !session.blocked && (session.validUntil ?? 0) > now)
  if (active.length > 1) return unknown('multiple-sessions')
  if (!active.length) return unknown(store.sessions.some(session => session.blocked) ? 'cleared' : 'expired')
  const session = active[0]
  if (!session.windows.length) return unknown('missing-windows')
  // Re-project; opaque bookkeeping hashes and original settings never enter the domain API.
  const projected = normalizeClaudeStatusline({ rate_limits: Object.fromEntries(session.windows.map(window => [window.slot, { used_percentage: window.usedPercent, resets_at: window.resetsAt === null ? null : window.resetsAt / 1000 }])) }, session.observedAt)
  return { ...projected, scope: 'session-observed', generation: session.generation, validUntil: session.validUntil }
}
/** Capture is best effort; existing rendering still receives exactly the same stdin and stdout. */
export async function runClaudeStatusline(input: AsyncIterable<Buffer | string>, installation: string, directory = AIUSAGE_DIR): Promise<number> {
  const observedAt = Date.now(), order = process.hrtime.bigint().toString(); let text = '', bytes = 0
  const state = await readClaudeInstallation(directory)
  if (!state || state.id !== installation) return 1
  const original = state.original as any, child = state.originalPresent ? spawn(original.command, { shell: originalStatuslineShell(), windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] }) : undefined
  const rendering = child ? new Promise<number>(resolve => { child.stdin.on('error', () => {}); child.on('error', () => resolve(1)); child.on('close', code => resolve(code ?? 1)) }) : Promise.resolve(0)
  const decoder = new StringDecoder('utf8')
  for await (const chunk of input) {
    child?.stdin.write(chunk)
    bytes += Buffer.byteLength(chunk)
    if (bytes <= 256 * 1024) text += decoder.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    else text = ''
  }
  child?.stdin.end(); if (!state.originalPresent) process.stdout.write('Claude Code\n')
  if (bytes <= 256 * 1024) try { await captureManagedClaude(JSON.parse(text + decoder.end()), installation, directory, observedAt, order) } catch { /* Capture errors never replace original output. */ }
  return rendering
}
