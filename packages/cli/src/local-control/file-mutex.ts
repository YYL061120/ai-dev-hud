import Database from 'better-sqlite3'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
export async function withFileMutex<T>(directory: string, name: string, work: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true })
  const db = new Database(join(directory, name), { timeout: 0 }), started = performance.now()
  try {
    while (true) {
      try { db.exec('BEGIN IMMEDIATE'); break } catch (error) {
        if ((error as { code?: string }).code !== 'SQLITE_BUSY' || performance.now() - started > 2000) throw new Error('Local operation busy')
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    return await work()
  } finally { if (db.inTransaction) db.exec('ROLLBACK'); db.close() }
}
