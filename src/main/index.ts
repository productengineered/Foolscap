import { app, BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { pathsFromArgv, type ArgvFilter } from './cli'
import { registerIpc } from './ipc'
import { installMenu, type MenuActions } from './menu'
import { DocumentSession } from './session'
import { clearSession, loadSession, saveSession, type SessionEntry } from './session-store'
import { IPC } from '../shared/types'
import { scheduleUpdateCheck } from './update-check'
import { createWindow } from './window'

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // Quit on a delay, not synchronously: on macOS the argv handoff to the
  // first instance can be lost if this process exits immediately after
  // losing the lock (observed intermittently; the relay then silently
  // no-ops and the file never opens).
  setTimeout(() => app.quit(), 200)
} else {
  /* One DocumentSession per window, keyed by webContents id. */
  const sessions = new Map<number, DocumentSession>()
  let quitting = false
  let appReady = false
  /* CLI/open-file paths arriving before ready queue here. */
  const pendingOpens: string[] = []

  const hooks = {
    isQuitting: () => quitting,
    onQuitCancelled: () => {
      quitting = false
    }
  }

  const focusedSession = (): DocumentSession | null => {
    const win = BrowserWindow.getFocusedWindow()
    return win ? (sessions.get(win.webContents.id) ?? null) : null
  }

  const boot = (initialPath?: string): DocumentSession => {
    const win = createWindow()
    const session = new DocumentSession(win, hooks)
    // Capture the id now: by the time 'closed' fires the window is
    // destroyed and touching win.webContents throws.
    const wcId = win.webContents.id
    sessions.set(wcId, session)
    win.on('closed', () => sessions.delete(wcId))
    if (initialPath) void session.openPath(initialPath)
    return session
  }

  /* Opening a file targets an empty focused window; otherwise a new one.
   * Standard macOS document-app behavior. When no window holds OS focus
   * (e.g. the app is in the background), any empty window qualifies. */
  const openFileSmart = (path: string): void => {
    if (!appReady) {
      pendingOpens.push(path)
      return
    }
    const focused = focusedSession()
    const target = focused ?? [...sessions.values()].find((s) => s.isEmpty) ?? null
    if (target?.isEmpty) {
      void target.openPath(path)
      target.focus()
    } else {
      boot(path)
    }
  }

  const actions: MenuActions = {
    focused: focusedSession,
    newWindow: () => void boot(),
    open: () => {
      void (focusedSession() ?? boot()).openViaDialog()
    },
    help: () => boot().showHelpWhenReady()
  }

  const argvFilter = (): ArgvFilter => ({
    appPath: app.getAppPath(),
    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory()
      } catch {
        return false
      }
    }
  })

  app.on('open-file', (e, path) => {
    e.preventDefault()
    openFileSmart(path)
  })

  app.on('second-instance', (_e, argv, cwd) => {
    const paths = pathsFromArgv(argv, cwd, argvFilter())
    console.log(`[foolscap] second-instance: ${paths.length ? paths.join(', ') : '(no paths)'}`)
    if (paths.length === 0) {
      const focused = focusedSession() ?? [...sessions.values()][0]
      if (focused) focused.focus()
      else boot()
      return
    }
    for (const path of paths) openFileSmart(path)
  })

  /* ⌘Q quits silently: the session — open documents, unsaved edits,
   * untitled drafts — persists to userData and restores on the next bare
   * launch. Only quit behaves this way; closing a window still prompts. */
  const sessionFile = (): string => join(app.getPath('userData'), 'session.json')
  let persistedQuit = false

  const persistAndQuit = async (): Promise<void> => {
    const entries: SessionEntry[] = []
    for (const session of sessions.values()) {
      try {
        const entry = await session.captureState()
        if (entry) entries.push(entry)
      } catch {
        // a wedged renderer must not block quitting; that window is lost
      }
    }
    try {
      await saveSession(sessionFile(), entries)
    } catch {
      // losing the session is bad, refusing to quit is worse
    }
    persistedQuit = true
    for (const session of sessions.values()) session.allowSilentClose()
    app.quit()
  }

  app.on('before-quit', (e) => {
    quitting = true
    if (persistedQuit || sessions.size === 0) return
    e.preventDefault()
    void persistAndQuit()
  })

  app.whenReady().then(async () => {
    for (const path of pathsFromArgv(process.argv, process.cwd(), argvFilter())) {
      pendingOpens.push(path)
    }
    registerIpc((wcId) => sessions.get(wcId) ?? null, actions)
    installMenu(actions)

    appReady = true
    const restored = pendingOpens.length === 0 ? await loadSession(sessionFile()) : null
    // Every unclosed window comes back — clean documents only if their file
    // still exists; dirty drafts always, the content outranks the file.
    // EACCES and friends count as gone: throwIfNoEntry only covers ENOENT,
    // and a stat throw here would abort the whole launch windowless.
    const fileExists = (path: string): boolean => {
      try {
        return statSync(path, { throwIfNoEntry: false }) !== undefined
      } catch {
        return false
      }
    }
    const restorable = (restored ?? []).filter(
      (entry) => entry.dirty || (entry.path !== null && fileExists(entry.path))
    )
    if (restored) await clearSession(sessionFile())
    if (restorable.length > 0) {
      for (const entry of restorable) void boot().restore(entry)
    } else if (pendingOpens.length === 0) {
      boot()
    } else {
      for (const path of pendingOpens) boot(path)
      pendingOpens.length = 0
    }

    app.on('activate', () => {
      if (sessions.size === 0) boot()
    })

    // Unsigned builds can't self-update on macOS (Squirrel.Mac refuses apps
    // without a code signature), so ULTRAPLAN §7's electron-updater is
    // benched until a Developer ID exists. Instead: check the repo's latest
    // GitHub Release and offer one quiet toast in the focused window.
    scheduleUpdateCheck((info) => {
      const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) win.webContents.send(IPC.updateAvailable, info)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
