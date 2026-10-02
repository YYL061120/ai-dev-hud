import type Database from 'better-sqlite3'

export interface HudUsage {
  tokens: number
  sessions: number
  usageRecords: number
  cost: number
}

export interface HudData {
  status: 'ready' | 'unavailable'
  today: HudUsage
  week: HudUsage
  models: Array<{ name: string; tokens: number; share: number }>
  updatedAt: number
  error?: string
}

const TOKEN_SUM = 'input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + thinking_tokens'
const LOCAL_CODEX = "tool = 'codex' AND COALESCE(origin, 'local') = 'local'"

export function getHudDateBounds(now = new Date()): { today: number; tomorrow: number; week: number } {
  // Calendar boundaries, rather than fixed 24-hour days, also handle DST.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const week = new Date(today)
  week.setDate(week.getDate() - 6)
  return { today: today.getTime(), tomorrow: tomorrow.getTime(), week: week.getTime() }
}

export function unavailableHudData(error: string): HudData {
  const empty = (): HudUsage => ({ tokens: 0, sessions: 0, usageRecords: 0, cost: 0 })
  return { status: 'unavailable', today: empty(), week: empty(), models: [], updatedAt: Date.now(), error }
}

/** Adapter over AIUsage's parsed records; never reads provider logs. Main process only. */
export function queryHudData(db: Database.Database, now = new Date()): HudData {
  const bounds = getHudDateBounds(now)
  const totals = db.prepare(`
    SELECT COALESCE(SUM(${TOKEN_SUM}), 0) AS tokens,
      COUNT(DISTINCT NULLIF(session_id, '')) AS sessions,
      COUNT(*) AS usageRecords, COALESCE(SUM(cost), 0) AS cost
    FROM records WHERE ${LOCAL_CODEX} AND ts >= ? AND ts < ?
  `)
  const today = totals.get(bounds.today, bounds.tomorrow) as HudUsage
  const week = totals.get(bounds.week, bounds.tomorrow) as HudUsage
  const models = (db.prepare(`
    SELECT model AS name, SUM(${TOKEN_SUM}) AS tokens
    FROM records WHERE ${LOCAL_CODEX} AND ts >= ? AND ts < ?
    GROUP BY model ORDER BY tokens DESC, model
  `).all(bounds.today, bounds.tomorrow) as Array<{ name: string; tokens: number }>).map(model => ({
    ...model, share: today.tokens > 0 ? Math.round(model.tokens / today.tokens * 100) : 0,
  }))
  return { status: 'ready', today, week, models, updatedAt: Date.now() }
}
