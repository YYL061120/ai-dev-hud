#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const Database = require('better-sqlite3')
function check() { const db = new Database(':memory:'); db.close() }
try {
  check()
  console.log('Node SQLite binding verified; no rebuild needed.')
} catch {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['rebuild', 'better-sqlite3'], {
    stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  check()
}
