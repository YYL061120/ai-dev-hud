/** Native loopback client for the existing AIUsage dashboard and parse API. */
async function request(port: number, path: string, method = 'GET'): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(method === 'POST' ? 120_000 : 2500),
  })
}

export async function isDashboardReachable(port: number): Promise<boolean> {
  try {
    // A listening socket, a 404, or an unrelated 200 page is not a dashboard.
    // Check AIUsage's page marker and both required API contracts.
    const page = await request(port, '/')
    if (!page.ok || !(await page.text()).includes("localStorage.getItem('aiusage-theme')")) return false
    const summary = await request(port, '/api/summary?range=day&tool=codex')
    if (!summary.ok) return false
    const totals = await summary.json() as Record<string, unknown>
    if (!Number.isFinite(totals.totalTokens) || !Number.isFinite(totals.totalSessions)
      || !totals.byTool || typeof totals.byTool !== 'object') return false
    // GET probes the refresh contract without initiating a parse.
    const refresh = await request(port, '/api/refresh')
    if (refresh.status !== 405) return false
    const result = await refresh.json() as { error?: { code?: string } }
    return result.error?.code === 'METHOD_NOT_ALLOWED'
  } catch { return false }
}

export async function refreshDashboard(port: number): Promise<void> {
  const response = await request(port, '/api/refresh', 'POST')
  if (!response.ok) throw new Error(`AIUsage 用量刷新失败（HTTP ${response.status}）`)
  const result = await response.json() as { parsedCount?: number; errors?: unknown[] }
  if (!Number.isFinite(result.parsedCount) || !Array.isArray(result.errors)) {
    throw new Error('AIUsage 刷新响应无效')
  }
  if (result.errors.length > 0) throw new Error('AIUsage 部分日志解析失败，请检查 Dashboard')
}
