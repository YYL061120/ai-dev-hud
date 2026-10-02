import { afterEach, describe, expect, it, vi } from 'vitest'
import { isDashboardReachable, refreshDashboard } from '../src/dashboard-client'

const page = "<html><script>localStorage.getItem('aiusage-theme')</script></html>"
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
afterEach(() => vi.unstubAllGlobals())

describe('AIUsage native dashboard client', () => {
  it.each([404, 500])('rejects HTTP %i without treating a listening port as ready', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, status)))
    expect(await isDashboardReachable(3847)).toBe(false)
  })
  it('rejects an unrelated 200 page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>other app</html>')))
    expect(await isDashboardReachable(3847)).toBe(false)
  })
  it('requires a valid summary and the real refresh API contract', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(page))
      .mockResolvedValueOnce(json({ totalTokens: 0, totalSessions: 0, byTool: {} }))
      .mockResolvedValueOnce(json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405))
    vi.stubGlobal('fetch', fetch)
    expect(await isDashboardReachable(3848)).toBe(true)
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'http://127.0.0.1:3848/', 'http://127.0.0.1:3848/api/summary?range=day&tool=codex',
      'http://127.0.0.1:3848/api/refresh',
    ])
    expect(fetch.mock.calls.every(call => call[1].method === 'GET')).toBe(true)
  })
  it('rejects a branded page with broken or protected APIs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(page)).mockResolvedValueOnce(json({}, 401)))
    expect(await isDashboardReachable(3847)).toBe(false)
  })
  it('manual and scheduled refresh ask the CLI to parse via POST', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ parsedCount: 1, toolCallCount: 0, errors: [] }))
    vi.stubGlobal('fetch', fetch)
    await refreshDashboard(3848)
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3848/api/refresh', expect.objectContaining({ method: 'POST', redirect: 'error' }))
  })
  it('reports parse and HTTP failures rather than claiming refreshed data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ parsedCount: 1, errors: ['fixture error'] })))
    await expect(refreshDashboard(3847)).rejects.toThrow('解析失败')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 503)))
    await expect(refreshDashboard(3847)).rejects.toThrow('HTTP 503')
  })
})
