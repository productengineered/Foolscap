import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSession, loadSession, saveSession, type SessionEntry } from './session-store'

describe('session store', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'foolscap-session-'))
    file = join(dir, 'session.json')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const entries: SessionEntry[] = [
    { path: '/docs/notes.md', dirty: false, content: null },
    { path: '/docs/draft.md', dirty: true, content: '# edited but unsaved' },
    { path: null, dirty: true, content: 'untitled scratch survives quit' }
  ]

  it('round-trips clean files, dirty buffers, and untitled drafts', async () => {
    await saveSession(file, entries)
    expect(await loadSession(file)).toEqual(entries)
  })

  it('missing file loads as null', async () => {
    expect(await loadSession(file)).toBeNull()
  })

  it('garbage and wrong versions load as null', async () => {
    await writeFile(file, 'not json at all')
    expect(await loadSession(file)).toBeNull()
    await writeFile(file, JSON.stringify({ version: 99, entries }))
    expect(await loadSession(file)).toBeNull()
  })

  it('malformed entries are dropped, not fatal', async () => {
    await writeFile(
      file,
      JSON.stringify({ version: 1, entries: [entries[0], { nonsense: true }, 42] })
    )
    expect(await loadSession(file)).toEqual([entries[0]])
  })

  it('an empty session loads as null and clear removes the file', async () => {
    await saveSession(file, [])
    expect(await loadSession(file)).toBeNull()
    await clearSession(file)
    await clearSession(file) // idempotent
    expect(await loadSession(file)).toBeNull()
  })
})
