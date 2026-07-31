import { readFile, rm } from 'node:fs/promises'
import { atomicWriteFile } from './files'

/* Quit-time session persistence: ⌘Q quits silently and the open windows —
 * including unsaved edits and untitled drafts — come back on the next bare
 * launch. Drafts persist here in userData, never into the user's files;
 * the disk copy of a document is only ever written by an explicit save. */

export interface SessionEntry {
  path: string | null
  dirty: boolean
  /* Buffer text; null when the disk copy is authoritative (clean). */
  content: string | null
}

interface SessionFile {
  version: 1
  entries: SessionEntry[]
}

export async function saveSession(file: string, entries: SessionEntry[]): Promise<void> {
  const data: SessionFile = { version: 1, entries }
  await atomicWriteFile(file, JSON.stringify(data))
}

function isEntry(value: unknown): value is SessionEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    (typeof e['path'] === 'string' || e['path'] === null) &&
    typeof e['dirty'] === 'boolean' &&
    (typeof e['content'] === 'string' || e['content'] === null)
  )
}

export async function loadSession(file: string): Promise<SessionEntry[] | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const data = parsed as Partial<SessionFile>
    if (data.version !== 1 || !Array.isArray(data.entries)) return null
    const entries = data.entries.filter(isEntry)
    return entries.length > 0 ? entries : null
  } catch {
    return null
  }
}

export async function clearSession(file: string): Promise<void> {
  await rm(file, { force: true })
}
