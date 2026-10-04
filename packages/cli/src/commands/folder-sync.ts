import { createDatabase } from '../db/index.js'
import { AIUSAGE_DIR } from '../config.js'
import { ensureAiusageDir, getState } from '../init.js'
import { FolderSyncController } from '../local-control/folder-sync.js'
import { runParse } from './parse.js'
import { join } from 'node:path'

export async function runFolderSync(options: { directory?: string; enable?: boolean; pause?: boolean; once?: boolean; status?: boolean; watch?: boolean }) {
  if ([options.enable, options.pause, options.status].filter(Boolean).length > 1) throw new Error('启用、暂停、状态选项不能同时使用')
  ensureAiusageDir(AIUSAGE_DIR)
  const id = getState(AIUSAGE_DIR)?.deviceInstanceId
  if (!id || id === 'unknown') throw new Error('本机设备身份不可用')
  const db = createDatabase(join(AIUSAGE_DIR, 'cache.db'))
  const controller = new FolderSyncController({ db, deviceId: id, collect: async () => {
    const codex = await runParse(db, 'codex'), claude = await runParse(db, 'claude-code')
    return { errors: [...codex.errors, ...claude.errors] }
  } })
  const report = () => {
    const { directory: _privatePath, ...status } = controller.status()
    console.log(JSON.stringify({ ...status, directoryConfigured: !!_privatePath }, null, 2))
  }
  try {
    if (options.enable) await controller.configure(options.directory, true, true)
    if (options.pause) await controller.configure(undefined, false, true)
    if (options.once || options.enable) await controller.syncNow()
    report()
    if (controller.status().error) process.exitCode = 1
    if (options.watch) {
      if (!controller.status().enabled) throw new Error('请先显式选择目录并启用同步')
      controller.start()
      console.log('无界面采集与文件夹同步已运行；Ctrl+C 停止当前进程。未安装后台任务。')
      await new Promise<void>(resolve => {
        const stop = () => { controller.stop(); process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve() }
        process.once('SIGINT', stop); process.once('SIGTERM', stop)
        // Controller timers are unref for serve. This keeps only explicit watch alive.
        const keepAlive = setInterval(() => {}, 60_000)
        const cleanup = () => clearInterval(keepAlive)
        process.once('SIGINT', cleanup); process.once('SIGTERM', cleanup)
      })
    }
  } finally { controller.stop(); await controller.drain(); db.close() }
}
