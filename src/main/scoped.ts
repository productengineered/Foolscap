import { app, dialog, type BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/* Security-scoped bookmarks for the Mac App Store sandbox. Every export is
 * a transparent no-op outside mas builds — the Developer ID app never pays
 * for any of this.
 *
 * The sandbox grants access to what the user picks, for this process only.
 * Two things need more: session restore (reopening remembered paths after
 * relaunch) and writes beside the document (assets/, the atomic-save temp
 * file). Bookmarks are the sanctioned answer: opaque tokens minted at
 * dialog time, kept in userData, redeemed on the way back in with
 * app.startAccessingSecurityScopedResource.
 *
 * Access acquired here is deliberately long-lived: a stopper held for the
 * life of an open document, and folder grants held until quit. The kernel
 * budget for simultaneous scoped resources is generous against the handful
 * of documents and folders a writing session touches. */

const isMas = process.mas === true

type BookmarkStore = Record<string, string>

let cache: BookmarkStore | null = null
const storeFile = (): string => join(app.getPath('userData'), 'scoped-bookmarks.json')

async function store(): Promise<BookmarkStore> {
  if (!cache) {
    try {
      cache = JSON.parse(await readFile(storeFile(), 'utf8')) as BookmarkStore
    } catch {
      cache = {}
    }
  }
  return cache
}

async function persist(): Promise<void> {
  if (!cache) return
  try {
    await writeFile(storeFile(), JSON.stringify(cache))
  } catch {
    // best effort; worst case a future launch asks the user again
  }
}

/* Called with whatever the dialog returned — undefined outside mas, where
 * dialogs mint no bookmarks and none are needed. */
export async function rememberBookmark(path: string, bookmark: string | undefined): Promise<void> {
  if (!isMas || !bookmark) return
  ;(await store())[path] = bookmark
  await persist()
}

/* Begin scoped access to a path (via its own bookmark or its folder's).
 * Returns a stopper for the caller to hold while the document is open.
 * No bookmark is not an error: paths arriving through open dialogs, drops,
 * file associations, and Recent Documents carry live grants already. */
export async function acquireAccess(path: string): Promise<() => void> {
  if (!isMas) return () => undefined
  const known = await store()
  const bookmark = known[path] ?? known[dirname(path)]
  if (!bookmark) return () => undefined
  try {
    const stop = app.startAccessingSecurityScopedResource(bookmark)
    return () => void stop()
  } catch {
    // Stale bookmark — target moved or deleted while we were away.
    delete known[path]
    void persist()
    return () => undefined
  }
}

/* Sibling writes need the folder, not the file. One explained grant per
 * folder, bookmarked so it never asks twice; held until quit. False means
 * the user declined and the caller should fail its operation gracefully. */
export async function ensureFolderAccess(
  win: BrowserWindow,
  dir: string,
  why: string
): Promise<boolean> {
  if (!isMas) return true
  const known = await store()
  const existing = known[dir]
  if (existing) {
    try {
      app.startAccessingSecurityScopedResource(existing)
      return true
    } catch {
      delete known[dir]
    }
  }
  const result = await dialog.showOpenDialog(win, {
    title: 'Allow folder access',
    message: why,
    defaultPath: dir,
    buttonLabel: 'Allow',
    properties: ['openDirectory', 'createDirectory'],
    securityScopedBookmarks: true
  })
  const picked = result.filePaths[0]
  const bookmark = result.bookmarks?.[0]
  if (result.canceled || !picked || !bookmark) return false
  known[picked] = bookmark
  await persist()
  try {
    app.startAccessingSecurityScopedResource(bookmark)
  } catch {
    return false
  }
  return true
}
