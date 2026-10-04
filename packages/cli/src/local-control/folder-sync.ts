import { constants, readFileSync } from 'node:fs'
import { lstat, realpath, open, rename, unlink, opendir } from 'node:fs/promises'
import path from 'node:path'
import { hostname, homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import type Database from 'better-sqlite3'
import { validateUsageChunkLine, validateUsageTransfer, USAGE_CHUNK_LINE_BYTES, type UsageMetadataTransfer } from '@aiusage/core'
import type { FolderSyncStatus } from '@aiusage/core'
import { UsageMetadataStore, deviceKeyFor } from './usage.js'
import { LocalControlError } from './projects.js'

const digest = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const batchName = new RegExp(`^([a-f0-9]{64})\.(${UUID})\.(${UUID})(?:[ ._-][^/\\\\:]{1,80})?\.jsonl$`)
export const FOLDER_SYNC_INTERVAL = 60_000
const MAX_ENTRIES = 10_000, MAX_FILES = 128, MAX_PAGES = 50, CYCLE_MS = 30_000
function localMachineBinding(): string {
  let machine = ''
  try {
    if (process.platform === 'win32') machine = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 2000 }).match(/MachineGuid\s+REG_SZ\s+([^\s]+)/)?.[1] ?? ''
    else if (process.platform === 'darwin') machine = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 2000 }).match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1] ?? ''
    else machine = readFileSync('/etc/machine-id', 'utf8').trim()
  } catch { /* No raw host identifiers or OS errors leave this local adapter. */ }
  return digest(`${machine}\0${hostname()}\0${process.platform}\0${homedir()}`)
}
interface Settings { enabled: boolean; directory: string | null; writer: string; binding: string; deviceKey: string }
interface Options {
  db: Database.Database
  deviceId: string
  collect?: () => Promise<unknown>
  runWrite?: <T>(work: () => Promise<T>) => Promise<T>
  /** Injectable only for deterministic isolated tests; never sent over transport. */
  binding?: string
}
/** Reject redirected ancestors, including Windows junctions, before any folder I/O. */
export async function safeSyncDirectory(input: string): Promise<string> {
  try {
  if (!path.isAbsolute(input) || input.includes('\0') || input.split(/[\\/]/).includes('..')) throw new LocalControlError('请选择不含 .. 的绝对同步目录')
  const resolved = path.resolve(input), parsed = path.parse(resolved)
  let current = parsed.root
  for (const segment of resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const info = await lstat(current)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new LocalControlError('同步目录不能包含 symlink 或 junction')
  }
  const canonical = await realpath(resolved)
  const normalize = (s: string) => process.platform === 'win32' ? s.toLowerCase() : s
  if (normalize(canonical) !== normalize(resolved)) throw new LocalControlError('同步目录被重定向，已停止')
  return canonical
  } catch (error) {
    if (error instanceof LocalControlError) throw error
    throw new LocalControlError('同步目录不可用或无权限；请检查离线下载和应用的正常访问权限')
  }
}
function parseBatch(bytes: Buffer, device: string): UsageMetadataTransfer[] {
  if (bytes.length > USAGE_CHUNK_LINE_BYTES * 2) throw new Error('oversize')
  const lines = bytes.toString('utf8').trimEnd().split('\n')
  if (lines.length < 2 || lines.length > 3 || lines.some(s => Buffer.byteLength(s) > USAGE_CHUNK_LINE_BYTES)) throw new Error('bounds')
  const values = lines.map(s => validateUsageChunkLine(JSON.parse(s)))
  const first = values[0], last = values.at(-1)!
  if (!('type' in first) || first.type !== 'header' || !('type' in last) || last.type !== 'complete') throw new Error('incomplete')
  const chunks = values.slice(1, -1).map(v => {
    if ('type' in v || v.exportedAt !== first.exportedAt || v.records.some(r => r.deviceKey !== device)) throw new Error('identity')
    return v
  })
  if (last.chunks !== chunks.length || last.records !== chunks.reduce((n, c) => n + c.records.length, 0)) throw new Error('footer')
  return chunks
}
export class FolderSyncController {
  private settings: Settings
  private timer?: ReturnType<typeof setTimeout>
  private active?: Promise<FolderSyncStatus>
  private epoch = 0
  private failures = 0
  private owner = randomUUID()
  private stopped = false
  private state: FolderSyncStatus
  private store: UsageMetadataStore
  private binding: string
  constructor(private options: Options) {
    const db = options.db
    db.exec(`CREATE TABLE IF NOT EXISTS hud_folder_sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS hud_folder_sync_exports (target TEXT, record_key TEXT, digest TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(target,record_key));
      CREATE TABLE IF NOT EXISTS hud_folder_sync_receipts (target TEXT, name TEXT, digest TEXT NOT NULL, PRIMARY KEY(target,name));
      CREATE TABLE IF NOT EXISTS hud_folder_sync_devices (target TEXT, device_key TEXT, writer TEXT NOT NULL, seen_at INTEGER NOT NULL, PRIMARY KEY(target,device_key));`)
    this.binding = options.binding ?? localMachineBinding()
    const stored = this.get('settings')
    this.settings = stored ? JSON.parse(stored) : { enabled: false, directory: null, writer: randomUUID(), binding: this.binding, deviceKey: deviceKeyFor(options.deviceId) }
    if (!stored) this.put('settings', JSON.stringify(this.settings))
    this.store = new UsageMetadataStore(db, options.deviceId)
    this.state = { enabled: this.settings.enabled, directory: this.settings.directory, running: false, lastSuccessAt: Number(this.get('success')) || null, nextRunAt: null, error: this.get('error') || null, issues: JSON.parse(this.get('issues') ?? '[]'), published: 0, imported: 0, devices: [] }
  }
  private get(key: string): string | undefined { return (this.options.db.prepare('SELECT value FROM hud_folder_sync_state WHERE key=?').get(key) as { value: string } | undefined)?.value }
  private put(key: string, value: string) { this.options.db.prepare('INSERT INTO hud_folder_sync_state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value) }
  private refreshSettings() {
    const persisted = this.get('settings')
    if (persisted && persisted !== JSON.stringify(this.settings)) {
      this.settings = JSON.parse(persisted); this.epoch++; this.clearTimer()
    }
  }
  status(): FolderSyncStatus {
    this.refreshSettings()
    const devices = this.settings.directory ? this.options.db.prepare('SELECT device_key AS deviceKey, seen_at AS lastSeenAt FROM hud_folder_sync_devices WHERE target=? ORDER BY device_key').all(this.settings.directory) as FolderSyncStatus['devices'] : []
    return { ...this.state, enabled: this.settings.enabled, directory: this.settings.directory, devices, issues: [...this.state.issues] }
  }
  private identity() {
    if (this.settings.binding !== this.binding || this.settings.deviceKey !== deviceKeyFor(this.options.deviceId)) throw new LocalControlError('检测到复制的本机身份；请在该机器使用独立本地数据目录，禁止复制 state.json 或 cache.db', 409)
  }
  async configure(directory: unknown, enabled: unknown, confirm: unknown): Promise<FolderSyncStatus> {
    if (typeof enabled !== 'boolean' || (enabled && confirm !== true)) throw new LocalControlError('启用需要明确选择目录并确认只同步脱敏用量')
    if (!enabled) {
      this.epoch++; this.settings.enabled = false; this.clearTimer()
      this.put('settings', JSON.stringify(this.settings))
      if (this.active) await this.active
      return this.status()
    }
    this.identity()
    if (typeof directory !== 'string' || !directory) throw new LocalControlError('请选择同步目录')
    const canonical = await safeSyncDirectory(directory)
    if (this.options.db.name && this.options.db.name !== ':memory:') {
      const relative = path.relative(canonical, path.resolve(this.options.db.name))
      if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) throw new LocalControlError('同步目录不能包含本机私人 SQLite；请选择独立的空同步文件夹')
    }
    this.epoch++; this.clearTimer()
    if (this.active) await this.active
    this.settings.directory = canonical; this.settings.enabled = true; this.stopped = false
    this.put('settings', JSON.stringify(this.settings)); this.state.error = null
    this.schedule(0)
    return this.status()
  }
  start() { this.stopped = false; if (this.settings.enabled) this.schedule(0) }
  stop() { this.stopped = true; this.epoch++; this.clearTimer() }
  async drain() { await this.active }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; this.state.nextRunAt = null }
  private schedule(delay: number) {
    this.clearTimer()
    if (!this.settings.enabled || this.stopped) return
    this.state.nextRunAt = Date.now() + delay
    this.timer = setTimeout(() => { this.timer = undefined; void this.syncNow() }, delay)
    this.timer.unref()
  }
  syncNow(): Promise<FolderSyncStatus> {
    this.refreshSettings()
    if (this.active) return this.active
    if (!this.settings.enabled || this.stopped) return Promise.resolve(this.status())
    this.clearTimer(); const epoch = this.epoch
    const run = this.options.runWrite ?? (async work => work())
    this.active = run(() => this.cycle(epoch)).finally(() => {
      this.active = undefined; this.state.running = false
      this.schedule(Math.min(15 * 60_000, FOLDER_SYNC_INTERVAL * 2 ** Math.min(this.failures, 4)))
    }).then(() => this.status())
    return this.active
  }
  private async cycle(epoch: number): Promise<FolderSyncStatus> {
    const alive = () => { this.refreshSettings(); return this.epoch === epoch && this.settings.enabled && !this.stopped }
    this.state.running = true; this.state.error = null; this.state.issues = []; this.state.published = 0; this.state.imported = 0
    let leased = false
    const issue = (s: string) => { if (this.state.issues.length < 20) this.state.issues.push(s) }
    try {
      if (!alive()) return this.status()
      this.identity()
      leased = this.options.db.transaction(() => {
        const prior = JSON.parse(this.get('lease') ?? 'null')
        if (prior && prior.until > Date.now() && prior.owner !== this.owner) return false
        this.put('lease', JSON.stringify({ owner: this.owner, until: Date.now() + 10 * 60_000 })); return true
      })()
      if (!leased) throw new LocalControlError('另一进程正在同步，稍后自动重试')
      const directory = await safeSyncDirectory(this.settings.directory!)
      // Parser is existing incremental ingestion. Failure never publishes a success.
      const collected = await this.options.collect?.() as { errors?: string[] } | undefined
      if (collected?.errors?.length) throw new LocalControlError('本机采集报告错误；请检查本地来源后重试')
      if (!alive()) return this.status()
      const deadline = Date.now() + CYCLE_MS
      const names: string[] = []; let entries = 0
      const dir = await opendir(directory)
      for await (const entry of dir) {
        if (++entries > MAX_ENTRIES) throw new LocalControlError('同步目录超过 10000 项上限；请由用户归档历史文件')
        const match = batchName.exec(entry.name)
        if (!match) continue
        if (match[1] === this.settings.deviceKey && match[2] !== this.settings.writer) throw new LocalControlError('同步目录存在相同设备 ID 的其他安装；已停止发布，需独立身份', 409)
        if (match[1] !== this.settings.deviceKey) names.push(entry.name)
      }
      const receipt = this.options.db.prepare('SELECT digest FROM hud_folder_sync_receipts WHERE target=? AND name=?')
      const saveReceipt = this.options.db.prepare('INSERT INTO hud_folder_sync_receipts VALUES (?,?,?) ON CONFLICT(target,name) DO UPDATE SET digest=excluded.digest')
      const device = this.options.db.prepare('SELECT writer FROM hud_folder_sync_devices WHERE target=? AND device_key=?')
      const seen = this.options.db.prepare('INSERT INTO hud_folder_sync_devices VALUES (?,?,?,?) ON CONFLICT(target,device_key) DO UPDATE SET seen_at=excluded.seen_at')
      let processed = 0
      // Persist round-robin cursor, so damaged or unchanged files cannot starve new arrivals.
      const after = this.get(`scan:${directory}`) ?? ''
      names.sort(); const ordered = [...names.filter(n => n > after), ...names.filter(n => n <= after)]
      for (const name of ordered) {
        if (!alive() || Date.now() > deadline || processed++ >= MAX_FILES) break
        this.put(`scan:${directory}`, name)
        const match = batchName.exec(name)!
        try {
          const existing = device.get(directory, match[1]) as { writer: string } | undefined
          if (existing && existing.writer !== match[2]) throw new Error('cloned identity')
          await safeSyncDirectory(directory)
          const file = path.join(directory, name), info = await lstat(file)
          if (!info.isFile() || info.isSymbolicLink() || info.size > USAGE_CHUNK_LINE_BYTES * 2) throw new Error('unsafe or oversize')
          const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
          let bytes: Buffer
          try {
            const stat = await handle.stat()
            if (stat.ino !== info.ino || stat.dev !== info.dev || stat.size !== info.size) throw new Error('changed')
            // Bounded read also rejects a concurrently growing file.
            bytes = Buffer.alloc(Math.min(stat.size + 1, USAGE_CHUNK_LINE_BYTES * 2 + 1))
            let count = 0
            while (count < bytes.length) { const read = await handle.read(bytes, count, bytes.length - count, count); if (!read.bytesRead) break; count += read.bytesRead }
            bytes = bytes.subarray(0, count)
            const end = await handle.stat()
            if (end.size !== info.size || end.mtimeMs !== info.mtimeMs || count !== info.size) throw new Error('half-written')
          } finally { await handle.close() }
          await safeSyncDirectory(directory)
          const hash = digest(bytes), prior = receipt.get(directory, name) as { digest: string } | undefined
          if (prior?.digest === hash) continue
          if (prior) throw new Error('immutable batch changed')
          const chunks = parseBatch(bytes, match[1])
          if (!alive()) break
          this.options.db.transaction(() => {
            for (const chunk of chunks) {
              const result = this.store.import(chunk)
              if (result.conflicts) issue('发现同版本用量冲突；保留已有记录和源文件')
              this.state.imported += result.added + result.updated
            }
            saveReceipt.run(directory, name, hash); seen.run(directory, match[1], match[2], Date.now())
          })()
        } catch { issue('某批次未下载、损坏、被修改或身份冲突；保留原文件并在补扫时重试') }
      }
      const ledger = this.options.db.prepare('SELECT digest, revision FROM hud_folder_sync_exports WHERE target=? AND record_key=?')
      const save = this.options.db.prepare('INSERT INTO hud_folder_sync_exports VALUES (?,?,?,?) ON CONFLICT(target,record_key) DO UPDATE SET digest=excluded.digest, revision=excluded.revision')
      let cursor = Number(this.get(`cursor:${directory}`)) || 0
      for (let page = 0; page < MAX_PAGES && alive() && Date.now() < deadline; page++) {
        const part = this.store.localSyncPage(cursor)
        const changed = part.records.filter(r => (ledger.get(directory, r.recordKey) as { digest: string } | undefined)?.digest !== digest(JSON.stringify(r)))
        if (changed.length) {
          // Transport revisions advance even when an old parser correction or
          // pricing projection did not change the source updated_at timestamp.
          const revised = changed.map(r => ({ ...r, updatedAt: Math.max(r.updatedAt, Date.now(), ((ledger.get(directory, r.recordKey) as { revision: number } | undefined)?.revision ?? 0) + 1) }))
          const transfer = validateUsageTransfer({ format: 'ai-dev-hud-usage', version: 1, exportedAt: Date.now(), records: revised })
          await this.publish(directory, transfer, alive)
          if (!alive()) break
          this.options.db.transaction(() => { changed.forEach((r,i) => save.run(directory, r.recordKey, digest(JSON.stringify(r)), revised[i].updatedAt)) })()
          this.state.published += changed.length
        }
        cursor = part.complete ? 0 : part.cursor
        this.put(`cursor:${directory}`, String(cursor))
        if (part.complete) break
        await new Promise<void>(resolve => setImmediate(resolve))
      }
      // Empty protocol batch acts as a bounded heartbeat every 15 minutes.
      if (alive() && Date.now() - Number(this.get(`heartbeat:${directory}`) ?? 0) > 15 * 60_000) {
        await this.publish(directory, { format: 'ai-dev-hud-usage', version: 1, exportedAt: Date.now(), records: [] }, alive)
        if (alive()) this.put(`heartbeat:${directory}`, String(Date.now()))
      }
      if (alive()) {
        seen.run(directory, this.settings.deviceKey, this.settings.writer, Date.now())
        this.state.lastSuccessAt = Date.now(); this.put('success', String(this.state.lastSuccessAt)); this.failures = 0
      }
    } catch (error) {
      this.failures++
      this.state.error = error instanceof LocalControlError ? error.message : '同步目录不可用或无权限；保持本地数据，稍后自动重试'
    } finally {
      this.put('error', this.state.error ?? ''); this.put('issues', JSON.stringify(this.state.issues))
      if (leased) this.options.db.transaction(() => { const lease = JSON.parse(this.get('lease') ?? 'null'); if (lease?.owner === this.owner) this.put('lease', 'null') })()
    }
    return this.status()
  }
  private async publish(directory: string, transfer: UsageMetadataTransfer, alive: () => boolean) {
    const records = transfer.records.length
    const lines = [{ format: 'ai-dev-hud-usage-chunks', version: 1, type: 'header', exportedAt: transfer.exportedAt }, ...(records ? [transfer] : []), { format: 'ai-dev-hud-usage-chunks', version: 1, type: 'complete', chunks: records ? 1 : 0, records }]
    if (lines.some(line => Buffer.byteLength(JSON.stringify(line)) > USAGE_CHUNK_LINE_BYTES)) throw new LocalControlError('导出批次超过大小上限')
    await safeSyncDirectory(directory)
    const filename = `${this.settings.deviceKey}.${this.settings.writer}.${randomUUID()}.jsonl`
    const temporary = path.join(directory, `.${filename}.tmp`), final = path.join(directory, filename)
    const handle = await open(temporary, 'wx', 0o600)
    let published = false
    try {
      await handle.writeFile(lines.map(line => JSON.stringify(line)).join('\n') + '\n', 'utf8')
      await handle.sync(); await handle.close()
      await safeSyncDirectory(directory)
      if (!alive()) return
      await rename(temporary, final); published = true
    } finally {
      await handle.close().catch(() => {})
      // Only our uncommitted temp file may be removed, and only in the validated root.
      if (!published) { try { await safeSyncDirectory(directory); await unlink(temporary) } catch {} }
    }
  }
}
