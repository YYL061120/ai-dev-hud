import { describe, it, expect, vi, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({ status: vi.fn(), exec: vi.fn() }))
vi.mock('../src/local-control/launcher.js', () => ({ codexStatus: mocks.status }))
vi.mock('node:child_process', () => ({ execFile: mocks.exec }))
beforeEach(() => { vi.resetModules(); mocks.status.mockReset(); mocks.exec.mockReset() })
describe('supported Codex metadata availability', () => {
  it('only checks the official daemon version, caches the unreachable reason and does not start or scan anything', async () => {
    mocks.status.mockResolvedValue({ available: true, executable: 'C:\\official\\codex.exe', version: 'codex-cli 0.154.0' })
    mocks.exec.mockImplementation((_exe, _args, _options, callback) => callback(new Error('unreachable')))
    const { codexMetadataStatus } = await import('../src/local-control/session-metadata.js')
    expect(await codexMetadataStatus()).toMatchObject({ available: false, reason: 'daemon-unreachable', source: 'official-codex-app-server', version: 'codex-cli 0.154.0' })
    await codexMetadataStatus(); expect(mocks.exec).toHaveBeenCalledTimes(1)
    expect(mocks.exec.mock.calls[0].slice(0, 3)).toEqual(['C:\\official\\codex.exe', ['app-server', 'daemon', 'version'], { windowsHide: true, timeout: 3000, maxBuffer: 4096 }])
  })
  it('does not claim session metadata works solely because the daemon version probe succeeds', async () => {
    mocks.status.mockResolvedValue({ available: true, executable: 'C:\\official\\codex.exe', version: 'codex-cli 0.154.0' })
    mocks.exec.mockImplementation((_exe, _args, _options, callback) => callback(null, '0.154.0', ''))
    const { codexMetadataStatus } = await import('../src/local-control/session-metadata.js')
    expect((await codexMetadataStatus()).reason).toBe('adapter-unavailable')
  })
  it('reports a missing CLI without running additional commands', async () => {
    mocks.status.mockResolvedValue({ available: false })
    const { codexMetadataStatus } = await import('../src/local-control/session-metadata.js')
    expect((await codexMetadataStatus()).reason).toBe('cli-unavailable'); expect(mocks.exec).not.toHaveBeenCalled()
  })
})
