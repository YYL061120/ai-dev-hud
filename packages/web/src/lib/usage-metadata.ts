import type { UsageOverview, UsageMetadataTransfer, MetadataImportResult } from '../../../core/src/usage-metadata.js'
import { localRequest } from './local-control'
export const usageApi = {
  overview: (period: string, device: string, project: string) => localRequest<UsageOverview>(`usage?${new URLSearchParams({ period, ...(device ? { device } : {}), ...(project ? { project } : {}) })}`),
  export: () => localRequest<UsageMetadataTransfer>('usage/export'),
  import: (transfer: unknown) => localRequest<MetadataImportResult>('usage/import', 'POST', transfer),
}
