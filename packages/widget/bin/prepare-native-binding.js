#!/usr/bin/env node
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const widgetRoot = join(__dirname, '..')
const nativeTarget = join(widgetRoot, 'dist', 'native', 'better_sqlite3.node')

function bindingWorksInElectron() {
  if (!existsSync(nativeTarget)) return false
  const check = spawnSync(require('electron'), ['-e',
    `const Database=require('better-sqlite3');const db=new Database(':memory:',{nativeBinding:${JSON.stringify(nativeTarget)}});db.close()`,
  ], {
    cwd: widgetRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8', windowsHide: true,
  })
  return check.status === 0
}

// Validate the actual ABI, not the mtime of the shared Node binding. Download
// through the existing staging installer; never replace the CLI's loaded DLL.
if (!process.argv.includes('--force') && bindingWorksInElectron()) {
  console.log('Electron SQLite binding verified; shared Node binding unchanged.')
} else {
  execFileSync(process.execPath, [join(__dirname, 'install-native.js')], { cwd: widgetRoot, stdio: 'inherit' })
  if (!bindingWorksInElectron()) {
    throw new Error('Electron SQLite binding could not be prepared. See install-native output above.')
  }
}
