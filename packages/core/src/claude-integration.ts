export type ClaudeObservationReason = 'disabled' | 'waiting-response' | 'missing-session' | 'multiple-sessions' | 'expired' | 'cleared' | 'missing-progress-boundary' | 'configuration-conflict' | 'missing-windows'
export interface ClaudeStatuslineStatus {
  enabled: boolean
  configured: boolean
  originalPresent: boolean
  conflict: boolean
  canRestore: boolean
  managedConfigured: boolean
}
export interface ClaudeStatuslinePreview {
  id: string
  action: 'enable' | 'disable'
  expiresAt: number
  originalPresent: boolean
  settingsExisted: boolean
}
