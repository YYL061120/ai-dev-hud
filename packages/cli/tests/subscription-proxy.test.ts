import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: mocks.spawn }))
import { readCodexProxy } from '../src/local-control/subscriptions.js'
function proxy() {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill: vi.fn() })
  mocks.spawn.mockReturnValue(child)
  return child
}
describe('bounded existing-daemon quota proxy', () => {
  beforeEach(() => vi.clearAllMocks())
  it('uses only initialize and rateLimits/read, projects allowed fields and terminates the proxy', async () => {
    const child = proxy(), result = readCodexProxy('official-codex.exe')
    child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n')
    child.stdout.write(JSON.stringify({ method: 'unrelated', params: { secret: 'PRIVATE_FIXTURE' } }) + '\n')
    child.stdout.write(JSON.stringify({ id: 2, result: { rateLimits: { limitId: 'codex', primary: { usedPercent: 10, windowDurationMins: 30 } }, credentials: 'PRIVATE_FIXTURE' } }) + '\n')
    const value = await result
    expect(mocks.spawn).toHaveBeenCalledWith('official-codex.exe', ['app-server', 'proxy'], expect.objectContaining({ windowsHide: true }))
    expect(child.stdin.read()?.toString()).toMatch(/initialize.*\n.*initialized.*\n.*account\/rateLimits\/read/s)
    expect(value?.windows[0]).toMatchObject({ usedPercent: 10, durationMinutes: 30 })
    expect(JSON.stringify(value)).not.toContain('PRIVATE_FIXTURE')
    expect(child.kill).toHaveBeenCalledTimes(1)
  })
  it('returns unavailable for official errors without exposing server messages', async () => {
    const child = proxy(), result = readCodexProxy('official-codex.exe')
    child.stdout.write(JSON.stringify({ id: 1, error: { message: 'PRIVATE_ERROR' } }) + '\n')
    expect(await result).toBeUndefined(); expect(child.kill).toHaveBeenCalledTimes(1)
  })
  it('bounds oversized responses and handles process failure', async () => {
    let child = proxy(), result = readCodexProxy('official-codex.exe')
    child.stdout.write('x'.repeat(1024 * 1024 + 1))
    expect(await result).toBeUndefined(); expect(child.kill).toHaveBeenCalledTimes(1)
    child = proxy(); result = readCodexProxy('official-codex.exe'); child.emit('error', new Error('PRIVATE_ERROR'))
    expect(await result).toBeUndefined()
  })
})
