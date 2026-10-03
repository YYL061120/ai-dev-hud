/** Local project context never belongs in a usage metadata export. */
export const PROJECT_TASKS = ['continue', 'feature', 'debug', 'architecture', 'review', 'new-project'] as const
export type ProjectTask = typeof PROJECT_TASKS[number]
export type ProjectEngine = 'unity' | 'unreal' | 'other'
export interface LocalProject { id: string; name: string; path: string; registeredAt: number }
export interface ProjectDocument { key: 'agents' | 'state' | 'architecture'; path: string; available: boolean }
export interface ProjectInspection extends LocalProject {
  available: boolean; engine: ProjectEngine; git: { present: boolean; branch: string | null; dirty: boolean | null; error?: string }
  documents: ProjectDocument[]
  recentSession: CodexSessionMetadataStatus
}
export interface ProjectDiscovery { projects: Array<{ path: string; name: string; engine: ProjectEngine }>; visited: number; truncated: boolean }
export interface CodexLauncherStatus { available: boolean; executable?: string; version?: string; reason?: string }
export interface CodexSessionMetadataStatus {
  available: false
  reason: 'not-checked' | 'cli-unavailable' | 'daemon-unreachable' | 'adapter-unavailable'
  source: 'official-codex-app-server'; version?: string
}
export interface KickoffPreview { task: ProjectTask; prompt: string; cwd: string; autoSubmit: false }
