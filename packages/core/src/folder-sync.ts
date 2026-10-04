/** Local DTO only. Directory paths and checkpoints never enter transfer files. */
export interface FolderSyncStatus {
  enabled: boolean
  directory: string | null
  running: boolean
  lastSuccessAt: number | null
  nextRunAt: number | null
  error: string | null
  issues: string[]
  published: number
  imported: number
  devices: Array<{ deviceKey: string; lastSeenAt: number }>
}
