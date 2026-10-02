/** Native loopback client for the existing AIUsage dashboard and parse API. */
async function request(port: number, path: string, method = 'GET'): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(method === 'POST' ? 120_000 : 2500),
  })
}

export type DashboardStatus = 'ready' | 'auth-required' | 'absent' | 'unrelated' | 'unavailable'

export async function probeDashboard(port: number): Promise<DashboardStatus> {
  try {
    // A listening socket, a 404, or an unrelated 200 page is not a dashboard.
    // Check AIUsage's page marker and both required API contracts.
    const page = await request(port, '/')
    if (!page.ok || !(await page.text()).includes("localStorage.getItem('aiusage-theme')")) return 'unrelated'
    const authResponse = await request(port, '/api/auth/status')
    if (!authResponse.ok) return 'unrelated'
    const auth = await authResponse.json() as { enabled?: boolean; authenticated?: boolean }
    if (typeof auth.enabled !== 'boolean' || typeof auth.authenticated !== 'boolean') return 'unrelated'
    const summary = await request(port, '/api/summary?range=day&tool=codex')
    if (auth.enabled && !auth.authenticated) {
      // A random service's 401 is not proof of an AIUsage login page.
      if (summary.status !== 401) return 'unrelated'
      const denied = await summary.json() as { error?: { code?: string } }
      return denied.error?.code === 'UNAUTHORIZED' ? 'auth-required' : 'unrelated'
    }
    if (!summary.ok) return 'unrelated'
    const totals = await summary.json() as Record<string, unknown>
    if (!Number.isFinite(totals.totalTokens) || !Number.isFinite(totals.totalSessions)
      || !totals.byTool || typeof totals.byTool !== 'object') return 'unrelated'
    // GET probes the refresh contract without initiating a parse.
    const refresh = await request(port, '/api/refresh')
    if (refresh.status !== 405) return 'unrelated'
    const result = await refresh.json() as { error?: { code?: string } }
    return result.error?.code === 'METHOD_NOT_ALLOWED' ? 'ready' : 'unrelated'
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED' ? 'absent' : 'unavailable'
  }
}

/** Opening an existing login page does not require background API access. */
export async function isDashboardReachable(port: number): Promise<boolean> {
  const status = await probeDashboard(port)
  return status === 'ready' || status === 'auth-required'
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
