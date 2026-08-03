import { watch, type FSWatcher } from 'chokidar'
import { randomBytes } from 'node:crypto'
import { open, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

/* Atomic save per ULTRAPLAN §6: write a temp file in the same directory,
 * fsync, then rename over the target. A crash mid-write can lose the temp
 * file but can never truncate the manuscript. */
export function tempName(path: string): string {
  return `.${basename(path)}.foolscap-${process.pid}-${randomBytes(4).toString('hex')}.tmp`
}

export async function atomicWriteFile(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = join(dirname(path), tempName(path))
  const fh = await open(tmp, 'w')
  let closed = false
  try {
    await fh.writeFile(data, typeof data === 'string' ? 'utf8' : undefined)
    await fh.sync()
    closed = true
    await fh.close()
    await rename(tmp, path)
  } catch (err) {
    if (!closed) await fh.close().catch(() => undefined)
    await unlink(tmp).catch(() => undefined)
    throw err
  }
}

/* Timestamped asset name: pasted-YYYYMMDD-HHMMSS.ext */
export function timestampName(prefix: string, ext: string, now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `${prefix}-${date}-${time}.${ext}`
}

/* Watch a single file for external changes. awaitWriteFinish debounces other
 * programs' in-progress writes so we read a settled file, not a half-write. */
export function watchFile(path: string, onChange: () => void): FSWatcher {
  const watcher = watch(path, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }
  })
  watcher.on('change', onChange)
  return watcher
}
