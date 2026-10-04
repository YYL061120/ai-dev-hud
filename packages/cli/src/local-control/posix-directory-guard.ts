import { spawn } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { basename } from 'node:path'
import { LocalControlError } from './projects.js'
import type { DirectoryLease } from './directory-guard.js'

const batchName = /^[a-f0-9]{64}\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jsonl$/
export async function lockPosixDirectory(directory: string): Promise<DirectoryLease> {
  const identity = await lstat(directory, { bigint: true })
  if (!identity.isDirectory() || identity.isSymbolicLink()) throw new LocalControlError('同步目录不是安全的真实目录', 409)
  const here = import.meta.url
  const executable = fileURLToPath(new URL(basename(fileURLToPath(here)) === 'index.js' ? './hud-directory-guard' : '../../native/bin/hud-directory-guard', here))
  const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] })
  let alive = false, closed = false, busy = false
  const completion = new Promise<void>(resolve => child.once('close', () => { alive = false; closed = true; resolve() }))
  child.stderr.resume(); child.stdin.on('error', () => {})
  const exchange = (expected: string, write: () => void) => new Promise<void>((resolve, reject) => {
    let output = ''
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', receive); child.off('error', fail); child.off('close', fail) }
    const fail = () => { cleanup(); alive = false; child.kill(); reject(new LocalControlError('原生目录发布失败或 helper 不可用；请检查本机构建及文件系统兼容性', 409)) }
    const receive = (part: Buffer) => {
      output += part.toString('utf8')
      if (output === expected + '\n') { cleanup(); resolve() }
      else if (output.length > 64 || output.includes('REFUSED') || output.includes('\n')) fail()
    }
    const timer = setTimeout(fail, 8000)
    child.stdout.on('data', receive); child.once('error', fail); child.once('close', fail)
    write()
  })
  try {
    const bytes = Buffer.from(directory, 'utf8')
    if (!bytes.length || bytes.length > 32768 || bytes.includes(0)) throw new LocalControlError('同步目录超出安全边界', 409)
    await exchange('READY', () => { child.stdin.write(`${identity.dev} ${identity.ino} ${bytes.length}\n`); child.stdin.write(bytes) })
    alive = true
    return { get alive() { return alive }, async publish(filename, text) {
      const bytes = Buffer.from(text, 'utf8')
      if (!alive || busy || !batchName.test(filename) || bytes.length > 4194304) throw new LocalControlError('发布请求无效、过大或目录已停止', 409)
      busy = true
      try { await exchange('PUBLISHED', () => { child.stdin.write(`P ${filename} ${bytes.length}\n`); child.stdin.write(bytes) }) }
      finally { busy = false }
    }, async release() {
      alive = false
      if (busy) child.kill()
      else if (!closed) child.stdin.end('R\n')
      const timer = setTimeout(() => child.kill(), 2000)
      try { await completion } finally { clearTimeout(timer) }
    } }
  } catch (error) { child.kill(); await completion; throw error }
}
