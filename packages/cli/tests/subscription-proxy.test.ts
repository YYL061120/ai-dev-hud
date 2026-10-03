import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: mocks.spawn }))
import { readCodexProxy, readCodexStdio } from '../src/local-control/subscriptions.js'
const account = (email: string | null = 'PRIVATE_A@example.invalid', planType = 'pro') => ({ account: { type: 'chatgpt', email, planType } })
function proxy() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill: vi.fn() })
  mocks.spawn.mockReturnValue(child)
  return child
}
const reply = (child: ReturnType<typeof proxy>, id: number, result: unknown) => child.stdout.write(JSON.stringify({ id, result }) + '\n')
function success(child: ReturnType<typeof proxy>, before = account(), after = before) {
  reply(child, 1, {}); reply(child, 2, before)
  reply(child, 3, { rateLimits: { limitId: 'codex', primary: { usedPercent: 0, windowDurationMins: 300 } }, credentials: 'PRIVATE_SECRET' })
  reply(child, 4, after)
}
describe('bounded official account quota connection', () => {
  beforeEach(() => vi.clearAllMocks())
  it('verifies the same account before and after quota without returning identity, retaining only an opaque generation and TTL', async () => {
    const child = proxy(), result = readCodexProxy('official-codex.exe'); success(child)
    const value = await result
    expect(mocks.spawn).toHaveBeenCalledWith('official-codex.exe', ['app-server', 'proxy'], expect.objectContaining({ windowsHide: true }))
    const requests = child.stdin.read()?.toString().trim().split('\n').map((line: string) => JSON.parse(line))
    expect(requests.map((r: any) => r.method)).toEqual(['initialize', 'initialized', 'account/read', 'account/rateLimits/read', 'account/read'])
    expect(requests.filter((r: any) => r.method === 'account/read').map((r: any) => r.params)).toEqual([{ refreshToken: false }, { refreshToken: false }])
    expect(value?.windows[0].usedPercent).toBe(0)
    expect(value?.generation).toMatch(/^[a-f0-9-]{36}$/)
    expect(value!.validUntil! - Date.now()).toBeGreaterThan(29_000)
    expect(value!.validUntil! - Date.now()).toBeLessThanOrEqual(30_000)
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE|email|planType|credentials/)
  })
  it.each([account('PRIVATE_B@example.invalid'), account(null), account(''), account('PRIVATE_A@example.invalid', 'plus'), { account: null }])('rejects changed or unconfirmed account %s', async after => {
    const child = proxy(), result = readCodexProxy('official-codex.exe'); success(child, account(), after)
    expect(await result).toBeUndefined()
  })
  it.each(['account/updated', 'account/login/completed', 'account/chatgptAuthTokens/refresh'])('invalidates on %s, including an event after the quota response', async method => {
    const child = proxy(), result = readCodexStdio('official-codex.exe'); success(child)
    child.stdout.write(JSON.stringify({ method, params: { secret: 'PRIVATE' } }) + '\n'); child.emit('close', 0)
    expect(await result).toBeUndefined()
    expect(child.stdin.read()?.toString()).not.toMatch(/PRIVATE|login\/start|refreshToken":true/)
  })
  it('normal EOF preserves completed observations, abnormal close invalidates and each connection uses a new generation', async () => {
    let child = proxy(), result = readCodexStdio('official-codex.exe'); success(child)
    expect(child.stdin.writableEnded).toBe(true); expect(child.kill).not.toHaveBeenCalled(); child.emit('close', 0)
    const first = await result
    child = proxy(); result = readCodexStdio('official-codex.exe'); success(child); child.emit('close', 0)
    expect((await result)?.generation).not.toBe(first?.generation)
    child = proxy(); result = readCodexStdio('official-codex.exe'); success(child); child.emit('close', 1)
    expect(await result).toBeUndefined()
  })
  it('invalidates malformed, oversized, errored and premature-close replies without returning private server messages', async () => {
    for (const kind of ['malformed', 'oversized', 'error', 'close']) {
      const child = proxy(), result = readCodexProxy('official-codex.exe')
      if (kind === 'malformed') child.stdout.write('bad\n')
      else if (kind === 'oversized') child.stdout.write('x'.repeat(1024 * 1024 + 1))
      else if (kind === 'error') child.stdout.write(JSON.stringify({ id: 1, error: { message: 'PRIVATE' } }) + '\n')
      else child.emit('close', 0)
      expect(await result).toBeUndefined()
    }
  })
})
