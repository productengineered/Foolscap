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

/* One window: its tabs in order and which one was active. */
export interface WindowEntry {
  tabs: SessionEntry[]
  /* Index into tabs; clamped on restore. */
  active: number
}

interface SessionFile {
  version: 2
  windows: WindowEntry[]
}

export async function saveSession(file: string, windows: WindowEntry[]): Promise<void> {
  const data: SessionFile = { version: 2, windows }
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

function isWindowEntry(value: unknown): value is WindowEntry {
  if (typeof value !== 'object' || value === null) return false
  const w = value as Record<string, unknown>
  return Array.isArray(w['tabs']) && typeof w['active'] === 'number'
}

export async function loadSession(file: string): Promise<WindowEntry[] | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const data = parsed as { version?: unknown; windows?: unknown; entries?: unknown }
    let windows: WindowEntry[] = []
    if (data.version === 2 && Array.isArray(data.windows)) {
      windows = (data.windows as unknown[])
        .filter(isWindowEntry)
        .map((w) => ({ tabs: w.tabs.filter(isEntry), active: w.active }))
    } else if (data.version === 1 && Array.isArray(data.entries)) {
      // Pre-tabs sessions: each entry was its own window.
      windows = (data.entries as unknown[])
        .filter(isEntry)
        .map((entry) => ({ tabs: [entry], active: 0 }))
    } else {
      return null
    }
    windows = windows.filter((w) => w.tabs.length > 0)
    return windows.length > 0 ? windows : null
  } catch {
    return null
  }
}

export async function clearSession(file: string): Promise<void> {
  await rm(file, { force: true })
}
