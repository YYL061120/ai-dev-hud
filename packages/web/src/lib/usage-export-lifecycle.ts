import type { UsageExportProgress } from '../../../core/src/usage-transfer.js'
interface ExportCreationApi {
  startExport(): Promise<UsageExportProgress>
  cancelExport(id: string): Promise<UsageExportProgress>
}
/** A pending creation cannot outlive its page and then start a download. */
export async function beginUsageExport(api: ExportCreationApi, stopped: () => boolean, publish: (progress: UsageExportProgress) => void, download: (id: string) => void): Promise<string | undefined> {
  if (stopped()) return
  const progress = await api.startExport()
  publish(progress)
  // Check after receiving the ID, immediately before the synchronous download callback.
  if (stopped()) { publish(await api.cancelExport(progress.id)); return }
  download(progress.id)
  return progress.id
}
