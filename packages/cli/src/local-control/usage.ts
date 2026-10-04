import { createHash, randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { aggregateUsage, safeUsageIdentifier, calculateCostForPrice, codexBillingTokens, resolveExchangeRate, TRANSFER_RECORD_LIMIT, USAGE_METADATA_FIELDS, USAGE_CHUNK_RECORDS, validateUsageTransfer, type PriceEntry, type UsageMetadataRecord, type UsageMetadataTransfer, type MetadataImportResult } from '@aiusage/core'
import { resolvePriceFromRegistry } from '../pricing-registry.js'
import { loadConfig } from '../config.js'
import { LOCAL_RECORDS_WHERE } from '../db/records.js'
import { LocalControlError } from './projects.js'
import { buildUsageRings, type DeviceUsageOrigin, type UsagePeriod } from '@aiusage/core'
const hash = (namespace: string, value: string) => createHash('sha256').update(`${namespace}\0${value}`).digest('hex')
export const deviceKeyFor = (id: string) => hash('device', id)
const projection = 'id, ts, updated_at, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source, session_id, cwd, device_instance_id, platform'
const identityCaches = new WeakMap<Database.Database, { currentId: string; revision: number; cursor: number; ceiling: number; baselineDone: boolean; complete: boolean }>()
const revision = (db: Database.Database) => (db.prepare('SELECT revision FROM hud_usage_local_revision WHERE id=1').get() as {revision:number}).revision
const projectPathKey = (value: string) => /^[a-z]:|\\/.test(value.toLowerCase()) ? value.replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '') : value.replace(/\/+$/, '')
function localRow(row: any, currentId: string, pricing?: (model: string) => PriceEntry | undefined, exchangeRate?: number): UsageMetadataRecord {
  const deviceId = !row.device_instance_id || row.device_instance_id === 'unknown' ? currentId : row.device_instance_id
  const deviceKey = deviceKeyFor(deviceId)
  const record: UsageMetadataRecord = {
    deviceKey, recordKey: hash('record', `${deviceKey}\0${row.id}`), projectKey: row.cwd ? hash('project', `${deviceKey}\0${projectPathKey(row.cwd)}`) : null,
    sessionKey: row.session_id ? hash('session', `${deviceKey}\0${row.tool}\0${row.session_id}`) : null,
    ts: row.ts, updatedAt: row.updated_at, tool: row.tool, model: safeUsageIdentifier(row.model), provider: safeUsageIdentifier(row.provider, 'provider'),
    platform: ['win32', 'darwin', 'linux'].includes(row.platform) ? row.platform : 'unknown', inputTokens: row.input_tokens, outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens, cacheWriteTokens: row.cache_write_tokens, thinkingTokens: row.thinking_tokens, cost: row.cost,
    costSource: ['log', 'pricing', 'unknown'].includes(row.cost_source) ? row.cost_source : 'unknown',
  }
  // Historical Codex rows may predate pricing support and incorrectly label $0
  // as priced. Re-project locally without rewriting the private DB or imports.
  if (record.tool === 'codex' && record.costSource !== 'log' && pricing) {
    const price = pricing(record.model)
    record.cost = price ? calculateCostForPrice(price, codexBillingTokens(record), exchangeRate) : 0
    record.costSource = price ? 'pricing' : 'unknown'
  }
  return record
}
export class UsageMetadataStore {
  constructor(private db: Database.Database, private currentId: string) {
    // Receipt/checkpoint/pricing writes cannot invalidate local record identities.
    db.transaction(() => db.exec(`CREATE TABLE IF NOT EXISTS hud_usage_local_revision(id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO hud_usage_local_revision VALUES(1,0);
      CREATE TABLE IF NOT EXISTS hud_usage_identity_changes(revision INTEGER PRIMARY KEY,old_id TEXT,old_device TEXT,new_id TEXT,new_device TEXT);
      CREATE TABLE IF NOT EXISTS hud_usage_identity_journal_state(id INTEGER PRIMARY KEY CHECK(id=1),floor INTEGER NOT NULL);
      INSERT OR IGNORE INTO hud_usage_identity_journal_state SELECT 1,revision FROM hud_usage_local_revision WHERE id=1;
      DROP TRIGGER IF EXISTS hud_local_identity_insert;
      DROP TRIGGER IF EXISTS hud_local_identity_delete;
      DROP TRIGGER IF EXISTS hud_local_identity_update;
      CREATE TRIGGER hud_local_identity_insert AFTER INSERT ON records WHEN NEW.origin='local'
      BEGIN
        UPDATE hud_usage_local_revision SET revision=revision+1 WHERE id=1;
        INSERT INTO hud_usage_identity_changes SELECT revision,NULL,NULL,NEW.id,NEW.device_instance_id FROM hud_usage_local_revision WHERE id=1;
        UPDATE hud_usage_identity_journal_state SET floor=MAX(floor,(SELECT revision-100000 FROM hud_usage_local_revision WHERE id=1)) WHERE id=1;
        DELETE FROM hud_usage_identity_changes WHERE revision<=(SELECT floor FROM hud_usage_identity_journal_state WHERE id=1);
      END;
      CREATE TRIGGER hud_local_identity_delete AFTER DELETE ON records WHEN OLD.origin='local'
      BEGIN
        UPDATE hud_usage_local_revision SET revision=revision+1 WHERE id=1;
        INSERT INTO hud_usage_identity_changes SELECT revision,OLD.id,OLD.device_instance_id,NULL,NULL FROM hud_usage_local_revision WHERE id=1;
        UPDATE hud_usage_identity_journal_state SET floor=MAX(floor,(SELECT revision-100000 FROM hud_usage_local_revision WHERE id=1)) WHERE id=1;
        DELETE FROM hud_usage_identity_changes WHERE revision<=(SELECT floor FROM hud_usage_identity_journal_state WHERE id=1);
      END;
      CREATE TRIGGER hud_local_identity_update AFTER UPDATE OF id,device_instance_id,origin ON records
      WHEN (OLD.origin='local' OR NEW.origin='local') AND (OLD.id IS NOT NEW.id OR OLD.device_instance_id IS NOT NEW.device_instance_id OR OLD.origin IS NOT NEW.origin)
      BEGIN
        UPDATE hud_usage_local_revision SET revision=revision+1 WHERE id=1;
        INSERT INTO hud_usage_identity_changes SELECT revision,CASE WHEN OLD.origin='local' THEN OLD.id END,OLD.device_instance_id,CASE WHEN NEW.origin='local' THEN NEW.id END,NEW.device_instance_id FROM hud_usage_local_revision WHERE id=1;
        UPDATE hud_usage_identity_journal_state SET floor=MAX(floor,(SELECT revision-100000 FROM hud_usage_local_revision WHERE id=1)) WHERE id=1;
        DELETE FROM hud_usage_identity_changes WHERE revision<=(SELECT floor FROM hud_usage_identity_journal_state WHERE id=1);
      END;`))()
  }
  projectKeyFor(cwd: string): string { return hash('project', `${deviceKeyFor(this.currentId)}\0${projectPathKey(cwd)}`) }
  /** Automatic transport excludes imported and foreign-device rows. Rolling rowid
   * reconciliation detects old corrections even when updated_at was not bumped. */
  localSyncPage(cursor: number, limit = 1000): { cursor: number; records: UsageMetadataRecord[]; complete: boolean } {
    const rows = this.db.prepare(`SELECT rowid AS cursor, ${projection} FROM records WHERE ${LOCAL_RECORDS_WHERE} AND rowid>? ORDER BY rowid LIMIT ?`).all(cursor, limit) as any[]
    const project = this.localProjector(), key = deviceKeyFor(this.currentId)
    return { cursor: rows.at(-1)?.cursor ?? cursor, records: rows.map(project).filter(r => r.deviceKey === key), complete: rows.length < limit }
  }
  private exists() { return !!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='hud_usage_metadata'").get() }
  private localRecords(): UsageMetadataRecord[] {
    // Explicit projection: no raw content, source_file, hostnames, or tool-call arguments are read.
    const rows = this.db.prepare(`SELECT id, ts, updated_at, tool, model, provider, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, thinking_tokens, cost, cost_source, session_id, cwd, device_instance_id, platform FROM records WHERE ${LOCAL_RECORDS_WHERE}`).all()
    const project = this.localProjector()
    return rows.map(project)
  }
  private localProjector() {
    const prices = new Map<string, PriceEntry | undefined>(), exchangeRate = resolveExchangeRate(loadConfig() ?? {})
    const pricing = (model: string) => { if (!prices.has(model)) prices.set(model, resolvePriceFromRegistry(this.db, model)); return prices.get(model) }
    return (row: any) => localRow(row, this.currentId, pricing, exchangeRate)
  }
  private records(origins?: Map<string, DeviceUsageOrigin>): UsageMetadataRecord[] {
    const local = this.localRecords(); const keyed = new Map(local.map(r => [`${r.deviceKey}:${r.recordKey}`, r]))
    for (const row of local) origins?.set(row.deviceKey, { source: 'local', importedAt: null })
    const receipts = new Map<string, number>()
    if (origins && this.db.prepare("SELECT name FROM sqlite_master WHERE name='hud_usage_import_receipts'").get()) for (const row of this.db.prepare('SELECT device_key, received_at FROM hud_usage_import_receipts').all() as Array<{ device_key: string; received_at: number }>) receipts.set(row.device_key, row.received_at)
    if (this.exists()) for (const row of this.db.prepare('SELECT payload FROM hud_usage_metadata').all() as Array<{ payload: string }>) {
      const record = JSON.parse(row.payload) as UsageMetadataRecord
      const key = `${record.deviceKey}:${record.recordKey}`
      if (!keyed.has(key)) {
        keyed.set(key, record)
        if (origins) { const previous = origins.get(record.deviceKey); origins.set(record.deviceKey, { source: previous?.source === 'local' || previous?.source === 'mixed' ? 'mixed' : 'imported', importedAt: receipts.get(record.deviceKey) ?? null }) }
      }
    }
    return [...keyed.values()]
  }
  overview(period = 'thirty', device?: string, project?: string, now?: Date, includeRingPeriods = false) {
    const origins = new Map<string, DeviceUsageOrigin>(), records = this.records(origins), key = deviceKeyFor(this.currentId)
    const clock = now ?? new Date(), build = (p: UsagePeriod) => buildUsageRings(records, key, p, origins, device, project, clock)
    const ringPeriods = includeRingPeriods ? Object.fromEntries((['today', 'seven', 'thirty', 'lifetime'] as UsagePeriod[]).map(p => [p, build(p)])) as Record<UsagePeriod, ReturnType<typeof build>> : undefined
    return { ...aggregateUsage(records, key, period, device, project, clock), rings: ringPeriods?.[period as UsagePeriod] ?? build(period as UsagePeriod), ...(ringPeriods ? { ringPeriods } : {}) }
  }
  export(): UsageMetadataTransfer {
    const records: UsageMetadataRecord[] = []; let bytes = 128
    for (const chunk of this.exportChunks()) {
      records.push(...chunk.records); bytes += Buffer.byteLength(JSON.stringify(chunk.records))
      if (records.length > TRANSFER_RECORD_LIMIT || bytes > 10 * 1024 * 1024) throw new LocalControlError('Legacy JSON limit exceeded; use the chunked export button', 409)
    }
    const transfer: UsageMetadataTransfer = { format: 'ai-dev-hud-usage', version: 1, exportedAt: Date.now(), records }
    try { validateUsageTransfer(transfer) } catch { throw new LocalControlError('Some local records need normalized usage values before export', 409) }
    if (Buffer.byteLength(JSON.stringify(transfer)) > 10 * 1024 * 1024) throw new LocalControlError('Legacy JSON limit exceeded; use the chunked export button', 409)
    return transfer
  }
  /** One WAL read snapshot; only bounded batches are held in JS. TEMP identity keys stay on disk. */
  *exportChunks(): Generator<UsageMetadataTransfer> {
    const owned = this.db.name !== ':memory:' && this.db.name !== ''
    const snapshot = owned ? new Database(this.db.name, { readonly: true, fileMustExist: true }) : this.db
    const keys = `hud_export_${randomUUID().replaceAll('-', '')}`
    const exportedAt = Date.now()
    try {
      if (snapshot.pragma('temp_store', { simple: true }) !== 1) snapshot.pragma('temp_store = FILE')
      if (owned) { snapshot.pragma('cache_size = -4096'); snapshot.exec('BEGIN'); snapshot.prepare('SELECT id FROM records LIMIT 1').get() }
      snapshot.exec(`CREATE TEMP TABLE ${keys}(device_key TEXT, record_key TEXT, PRIMARY KEY(device_key,record_key)) WITHOUT ROWID`)
      const put = snapshot.prepare(`INSERT OR IGNORE INTO ${keys} VALUES (?,?)`)
      const local = snapshot.prepare(`SELECT rowid AS cursor, ${projection} FROM records WHERE ${LOCAL_RECORDS_WHERE} AND rowid>? ORDER BY rowid LIMIT ?`)
      let cursor = 0
      while (true) {
        const rows = local.all(cursor, USAGE_CHUNK_RECORDS) as any[]
        if (!rows.length) break
        const records = rows.map(row => localRow(row, this.currentId))
        for (const record of records) put.run(record.deviceKey, record.recordKey)
        cursor = rows.at(-1)!.cursor
        yield this.validChunk(records, exportedAt)
      }
      if (snapshot.prepare("SELECT name FROM sqlite_master WHERE name='hud_usage_metadata'").get()) {
        const imported = snapshot.prepare(`SELECT m.rowid AS cursor, m.payload FROM hud_usage_metadata m WHERE m.rowid>? AND NOT EXISTS (SELECT 1 FROM ${keys} k WHERE k.device_key=m.device_key AND k.record_key=m.record_key) ORDER BY m.rowid LIMIT ?`)
        cursor = 0
        while (true) {
          const rows = imported.all(cursor, USAGE_CHUNK_RECORDS) as Array<{ cursor: number; payload: string }>
          if (!rows.length) break
          cursor = rows.at(-1)!.cursor
          yield this.validChunk(rows.map(row => JSON.parse(row.payload)), exportedAt)
        }
      }
    } finally {
      if (owned) { if (snapshot.inTransaction) snapshot.exec('ROLLBACK'); snapshot.close() }
      else snapshot.exec(`DROP TABLE IF EXISTS ${keys}`)
    }
  }
  private validChunk(records: UsageMetadataRecord[], exportedAt: number): UsageMetadataTransfer {
    try { return validateUsageTransfer({ format: 'ai-dev-hud-usage', version: 1, exportedAt, records }) }
    catch { throw new LocalControlError('Some local records need normalized usage values before export', 409) }
  }
  /** Finite baseline plus a bounded private identity journal: append, delete and
   * identity updates are replayed without discarding pagination progress. */
  private identityPage() {
    if (this.db.pragma('temp_store', { simple: true }) !== 1) this.db.pragma('temp_store = FILE')
    return this.db.transaction(() => {
      const currentRevision = revision(this.db)
      const floor = (this.db.prepare('SELECT floor FROM hud_usage_identity_journal_state WHERE id=1').get() as {floor:number}).floor
      let index = identityCaches.get(this.db)
      if (index?.currentId !== this.currentId || index.revision < floor) {
        this.db.exec('DROP TABLE IF EXISTS temp.hud_local_identity; CREATE TEMP TABLE hud_local_identity(device_key TEXT, record_key TEXT, PRIMARY KEY(device_key,record_key)) WITHOUT ROWID')
        const ceiling = (this.db.prepare('SELECT COALESCE(MAX(rowid),0) AS ceiling FROM records').get() as {ceiling:number}).ceiling
        index = { currentId: this.currentId, revision: currentRevision, cursor: 0, ceiling, baselineDone: false, complete: false }
        identityCaches.set(this.db, index)
      }
      if (index.complete && index.revision === currentRevision) return true
      index.complete = false
      const key = (id:string, deviceId:string|null) => { const device=deviceKeyFor(!deviceId || deviceId==='unknown' ? this.currentId : deviceId);return [device,hash('record',`${device}\0${id}`)] }
      const put=this.db.prepare('INSERT OR IGNORE INTO hud_local_identity VALUES (?,?)')
      if (!index.baselineDone) {
        const rows = this.db.prepare(`SELECT rowid AS cursor, id, device_instance_id FROM records WHERE ${LOCAL_RECORDS_WHERE} AND rowid>? AND rowid<=? ORDER BY rowid LIMIT 1000`).all(index.cursor,index.ceiling) as Array<{cursor:number;id:string;device_instance_id:string}>
        for (const row of rows) put.run(...key(row.id,row.device_instance_id))
        index.cursor=rows.at(-1)?.cursor ?? index.cursor
        index.baselineDone=rows.length<1000
      } else {
        const changes=this.db.prepare('SELECT * FROM hud_usage_identity_changes WHERE revision>? AND revision<=? ORDER BY revision LIMIT 1000').all(index.revision,currentRevision) as Array<{revision:number;old_id:string|null;old_device:string|null;new_id:string|null;new_device:string|null}>
        const remove=this.db.prepare('DELETE FROM hud_local_identity WHERE device_key=? AND record_key=?')
        for (const change of changes) {
          if (change.old_id!==null) remove.run(...key(change.old_id,change.old_device))
          if (change.new_id!==null) put.run(...key(change.new_id,change.new_device))
        }
        index.revision=changes.at(-1)?.revision ?? index.revision
      }
      index.complete=index.baselineDone && index.revision===currentRevision
      return index.complete
    })()
  }
  /** Automatic imports prepare in bounded pages before entering synchronous
   * import transactions. A cancelled/expired build resumes at its saved cursor. */
  async prepareLocalIdentityIndex(alive: () => boolean, deadline: number, maximumPages = 50): Promise<boolean> {
    for (let page = 0; page < maximumPages && alive() && Date.now() < deadline; page++) {
      if (this.identityPage()) return true
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    return false
  }
  private localIdentityIndex() {
    while (!this.identityPage()) { /* Legacy explicit import stays synchronous. */ }
  }
  import(value: unknown, preparedOnly = false): MetadataImportResult {
    let transfer: UsageMetadataTransfer
    try { transfer = validateUsageTransfer(value) } catch { throw new LocalControlError('Invalid version 1 usage metadata or non-allowlisted fields') }
    if (preparedOnly) {
      const cached = identityCaches.get(this.db)
      if (!cached?.complete || cached.currentId !== this.currentId || cached.revision !== revision(this.db)) throw new LocalControlError('本机记录身份已变化；本轮不重建全历史索引，下一轮分页续扫后重试', 409)
    } else this.localIdentityIndex()
    const local = this.db.prepare('SELECT 1 FROM hud_local_identity WHERE device_key=? AND record_key=?')
    const result = this.db.transaction(() => {
      const cached=identityCaches.get(this.db)
      if (!cached?.complete || cached.currentId!==this.currentId || cached.revision!==revision(this.db)) throw new LocalControlError('本机记录身份已变化；下一轮分页续扫后重试',409)
      this.db.exec('CREATE TABLE IF NOT EXISTS hud_usage_metadata (device_key TEXT NOT NULL, record_key TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(device_key, record_key))')
      this.db.exec('CREATE TABLE IF NOT EXISTS hud_usage_import_receipts (device_key TEXT PRIMARY KEY, received_at INTEGER NOT NULL)')
      const received = new Set<string>()
      const get = this.db.prepare('SELECT updated_at, payload FROM hud_usage_metadata WHERE device_key=? AND record_key=?')
      const put = this.db.prepare('INSERT INTO hud_usage_metadata(device_key, record_key, updated_at, payload) VALUES (?,?,?,?) ON CONFLICT(device_key,record_key) DO UPDATE SET updated_at=excluded.updated_at, payload=excluded.payload')
      const result: MetadataImportResult = { added: 0, updated: 0, duplicates: 0, conflicts: 0 }
      for (const input of transfer.records) {
        // Canonical property order makes semantic equality independent of JSON key order.
        const record = Object.fromEntries(USAGE_METADATA_FIELDS.map(key => [key, input[key]])) as unknown as UsageMetadataRecord
        if (local.get(record.deviceKey, record.recordKey)) { result.duplicates++; continue }
        const previous = get.get(record.deviceKey, record.recordKey) as { updated_at: number; payload: string } | undefined
        const payload = JSON.stringify(record)
        if (previous && previous.updated_at === record.updatedAt && previous.payload !== payload) { result.conflicts++; continue }
        if (previous && previous.updated_at >= record.updatedAt) { result.duplicates++; received.add(record.deviceKey); continue }
        put.run(record.deviceKey, record.recordKey, record.updatedAt, payload)
        received.add(record.deviceKey)
        if (previous) result.updated++; else result.added++
      }
      const receipt = this.db.prepare('INSERT INTO hud_usage_import_receipts VALUES (?,?) ON CONFLICT(device_key) DO UPDATE SET received_at=excluded.received_at')
      const receivedAt = Date.now()
      for (const key of received) receipt.run(key, receivedAt)
      return result
    })()
    return result
  }
}
