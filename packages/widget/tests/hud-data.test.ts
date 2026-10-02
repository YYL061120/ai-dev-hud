import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { getHudDateBounds, queryHudData, unavailableHudData } from '../src/hud-data'

describe('Codex HUD data adapter', () => {
  let db: Database.Database
  const now = new Date(2026, 9, 2, 12)
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`CREATE TABLE records (
      id TEXT, ts INTEGER, tool TEXT, model TEXT, origin TEXT,
      input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER,
      cache_write_tokens INTEGER, thinking_tokens INTEGER, cost REAL, session_id TEXT
    )`)
  })
  afterEach(() => { db.close(); vi.unstubAllEnvs() })
  function insert(id: string, ts: number, tool = 'codex', origin = 'local', session: string | null = 's1', model = 'gpt-5') {
    db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, 100, 20, 30, 5, 10, 0.25, ?)').run(id, ts, tool, model, origin, session)
  }

  it('includes only local Codex, counts distinct non-empty sessions and preserves token categories', () => {
    const { today } = getHudDateBounds(now)
    insert('a', today, 'codex')
    insert('b', today + 1, 'codex')
    insert('claude', today, 'claude-code')
    insert('remote', today, 'codex', 'synced')
    insert('no-session', today, 'codex', 'local', null, 'gpt-5-mini')
    insert('empty-session', today, 'codex', 'local', '', 'gpt-5-mini')
    const data = queryHudData(db, now)
    expect(data.today).toEqual({ tokens: 660, sessions: 1, usageRecords: 4, cost: 1 })
    expect(data.models).toEqual([{ name: 'gpt-5', tokens: 330, share: 50 }, { name: 'gpt-5-mini', tokens: 330, share: 50 }])
  })

  it('includes midnight and excludes tomorrow; seven-day window includes six prior calendar days', () => {
    const { today, tomorrow, week } = getHudDateBounds(now)
    insert('old', week - 1)
    insert('week-first', week)
    insert('yesterday', today - 1)
    insert('today-first', today)
    insert('today-last', tomorrow - 1)
    insert('tomorrow', tomorrow)
    const data = queryHudData(db, now)
    expect(data.today.usageRecords).toBe(2)
    expect(data.week.usageRecords).toBe(4)
    expect(data.week.tokens).toBe(660)
  })

  it('distinguishes a ready zero day from unavailable storage', () => {
    expect(queryHudData(db, now)).toMatchObject({ status: 'ready', today: { tokens: 0, sessions: 0 }, models: [] })
    expect(unavailableHudData('等待解析')).toMatchObject({ status: 'unavailable', error: '等待解析' })
  })

  it('uses the next calendar midnight on a 23-hour DST day', () => {
    vi.stubEnv('TZ', 'America/New_York')
    const bounds = getHudDateBounds(new Date(2026, 2, 8, 12))
    expect(bounds.tomorrow - bounds.today).toBe(23 * 60 * 60 * 1000)
  })

  it('does not carry a normalized 01:00 midnight into Santiago tomorrow or week boundaries', () => {
    vi.stubEnv('TZ', 'America/Santiago')
    const day = new Date(2026, 8, 6, 12)
    const bounds = getHudDateBounds(day)
    expect(new Date(bounds.today).getHours()).toBe(1)
    expect(bounds.tomorrow).toBe(new Date(2026, 8, 7).getTime())
    expect(bounds.week).toBe(new Date(2026, 7, 31).getTime())
    insert('week-first-hour', new Date(2026, 7, 31, 0, 30).getTime())
    insert('tomorrow-first-hour', new Date(2026, 8, 7, 0, 30).getTime())
    const data = queryHudData(db, day)
    expect(data.today.tokens).toBe(0)
    expect(data.week.tokens).toBe(165)
  })
})
