import type { LocalProject, ProjectInspection, ProjectDiscovery, CodexLauncherStatus, KickoffPreview, ProjectTask } from '../../../core/src/local-control.js'
export async function localRequest<T>(route: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api/local/${route}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? `HTTP ${response.status}`)
  return result as T
}
export const projectApi = {
  list: () => localRequest<{ projects: LocalProject[] }>('projects'),
  register: (path: string) => localRequest<{ project: LocalProject }>('projects', 'POST', { path }),
  discover: (path: string) => localRequest<ProjectDiscovery>('discover', 'POST', { path }),
  inspect: (id: string) => localRequest<ProjectInspection>(`projects/${encodeURIComponent(id)}`),
  unregister: (id: string) => localRequest(`projects/${encodeURIComponent(id)}`, 'DELETE'),
  document: (id: string, key: string) => localRequest<{ path: string; content: string }>(`projects/${encodeURIComponent(id)}/document?key=${encodeURIComponent(key)}`),
  kickoff: (id: string, task: ProjectTask, language: string) => localRequest<KickoffPreview>(`projects/${encodeURIComponent(id)}/kickoff`, 'POST', { task, language }),
  status: () => localRequest<CodexLauncherStatus>('codex'),
  launch: (id: string) => localRequest(`projects/${encodeURIComponent(id)}/launch`, 'POST', { confirm: true }),
}
