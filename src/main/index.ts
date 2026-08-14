import { app, BrowserWindow } from 'electron'
import { statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathsFromArgv, type ArgvFilter } from './cli'
import { registerIpc } from './ipc'
import { installMenu, type MenuActions } from './menu'
import { WindowSession } from './session'
import { clearSession, loadSession, saveSession, type WindowEntry } from './session-store'
import { IPC } from '../shared/types'
import { installAndRestart, startAutoUpdater } from './updater'
import { createWindow, installContentsGuards } from './window'

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // Quit on a delay, not synchronously: on macOS the argv handoff to the
  // first instance can be lost if this process exits immediately after
  // losing the lock (observed intermittently; the relay then silently
  // no-ops and the file never opens).
  setTimeout(() => app.quit(), 200)
} else {
  /* One WindowSession per window, keyed by webContents id. */
  const sessions = new Map<number, WindowSession>()
  let quitting = false
  let appReady = false
  /* CLI/open-file paths arriving before ready queue here. */
  const pendingOpens: string[] = []
  /* Files open in the window that last held focus — even when the app is
   * in the background and getFocusedWindow() returns null. */
  let lastFocusedWcId = -1

  const hooks = {
    isQuitting: () => quitting,
    onQuitCancelled: () => {
      quitting = false
    }
  }

  const focusedSession = (): WindowSession | null => {
    const win = BrowserWindow.getFocusedWindow()
    if (win) return sessions.get(win.webContents.id) ?? null
    return sessions.get(lastFocusedWcId) ?? null
  }

  const boot = (initialPath?: string): WindowSession => {
    const win = createWindow()
    const session = new WindowSession(win, hooks)
    // Capture the id now: by the time 'closed' fires the window is
    // destroyed and touching win.webContents throws.
    const wcId = win.webContents.id
    sessions.set(wcId, session)
    lastFocusedWcId = wcId
    win.on('focus', () => {
      lastFocusedWcId = wcId
    })
    win.on('closed', () => sessions.delete(wcId))
    if (initialPath) void session.openPath(initialPath)
    return session
  }

  /* Opening a file at launch (command-line arguments, once the session has
   * restored): the tab already showing it wins, wherever it lives; otherwise
   * it opens as a tab in the window that was last in focus. Files arriving
   * while the app is already running go through openFileFromOutside. */
  const openFileSmart = (path: string): void => {
    if (!appReady) {
      pendingOpens.push(path)
      return
    }
    for (const session of sessions.values()) {
      const tab = session.tabWithPath(path)
      if (tab) {
        session.activate(tab.docId)
        session.focus()
        return
      }
    }
    const target = focusedSession() ?? [...sessions.values()][0] ?? null
    if (target) {
      void target.openPath(path)
      target.focus()
    } else {
      boot(path)
    }
  }

  /* Files arriving from outside the app — a Finder double-click, `open`, a
   * second launch carrying arguments. Nothing else can send these, so the app
   * was necessarily in the background when they arrived, and the window that
   * last held focus may be sitting on another macOS Space. Focusing it would
   * drag the user's screen to that desktop; the batch opens in a NEW window
   * instead, which macOS places on whatever desktop is active right now.
   *
   * A path already open keeps its existing tab — the same file in two windows
   * would mean two buffers and two watchers over one file. Only when every
   * requested path is already open does a window get focused, because then
   * there is nothing new to show and that tab is the whole answer.
   *
   * Finder sends one open-file event per selected file, so the batch waits a
   * beat and lands as tabs of one window rather than a window each. */
  const externalQueue: string[] = []
  let externalTimer: NodeJS.Timeout | undefined

  const flushExternalOpens = (): void => {
    externalTimer = undefined
    const paths = [...new Set(externalQueue.splice(0))]
    const fresh: string[] = []
    let holdingOpen: WindowSession | null = null
    for (const path of paths) {
      const holder = [...sessions.values()].find((s) => s.tabWithPath(path) !== null)
      const tab = holder?.tabWithPath(path)
      if (!holder || !tab) {
        fresh.push(path)
        continue
      }
      // Surface it in the window that has it, but don't pull focus there.
      holder.activate(tab.docId)
      holdingOpen ??= holder
    }
    if (fresh.length === 0) {
      holdingOpen?.focus()
      return
    }
    const target = boot()
    for (const path of fresh) void target.openPath(path)
  }

  const openFileFromOutside = (path: string): void => {
    if (!appReady) {
      pendingOpens.push(path)
      return
    }
    externalQueue.push(path)
    // 50ms: long enough to gather one Finder multi-select, short enough that
    // a lone file still opens instantly.
    if (externalTimer === undefined) externalTimer = setTimeout(flushExternalOpens, 50)
  }

  /* Drag-out: the tab leaves its window — buffer, watcher, and all — and
   * lands as the sole tab of a new window under the cursor. */
  const detachTab = async (source: WindowSession, docId: number, x: number, y: number): Promise<void> => {
    const extracted = await source.extractTab(docId)
    if (!extracted) return
    const target = boot()
    // Near the drop point, clamped by the OS to something visible.
    target.window.setPosition(Math.round(x - 80), Math.round(y - 20))
    target.adoptTab(extracted.tab, extracted.content, extracted.dirty)
  }

  const actions: MenuActions = {
    focused: focusedSession,
    newWindow: () => void boot(),
    newTab: () => {
      const session = focusedSession()
      if (session) session.newTab()
      else boot()
    },
    open: () => {
      void (focusedSession() ?? boot()).openViaDialog()
    },
    help: () => boot().showHelpWhenReady(),
    updateRestart: () => void persistAndQuit(true)
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
    openFileFromOutside(path)
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
    for (const path of paths) openFileFromOutside(path)
  })

  /* ⌘Q quits silently: the session — open windows, their tabs, unsaved
   * edits, untitled drafts — persists to userData and restores on the next
   * bare launch. Only quit behaves this way; closing still prompts. */
  const sessionFile = (): string => join(app.getPath('userData'), 'session.json')
  let persistedQuit = false

  const persistAndQuit = async (installUpdate = false): Promise<void> => {
    const windows: WindowEntry[] = []
    for (const session of sessions.values()) {
      try {
        const entry = await session.captureState()
        if (entry) windows.push(entry)
      } catch {
        // a wedged renderer must not block quitting; that window is lost
      }
    }
    try {
      await saveSession(sessionFile(), windows)
    } catch {
      // losing the session is bad, refusing to quit is worse
    }
    persistedQuit = true
    for (const session of sessions.values()) session.allowSilentClose()
    // Session is safe on disk either way; an update restart costs nothing.
    if (installUpdate) installAndRestart()
    else app.quit()
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
    installContentsGuards()
    registerIpc((wcId) => sessions.get(wcId) ?? null, actions, detachTab)
    installMenu(actions)

    appReady = true
    // The session restores even when the launch carries file arguments:
    // skipping it would leave session.json unconsumed, and the next quit's
    // persistAndQuit overwrites it wholesale — silently destroying persisted
    // drafts. Restored windows and argument files open side by side.
    const restored = await loadSession(sessionFile())
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
    const restorable = (restored ?? [])
      .map((win) => ({
        ...win,
        tabs: win.tabs.filter(
          (entry) => entry.dirty || (entry.path !== null && fileExists(entry.path))
        )
      }))
      .filter((win) => win.tabs.length > 0)
    if (restored) await clearSession(sessionFile())
    // Dedup against the argument paths: a clean persisted tab for a file
    // that's also an argument yields to the argument; a dirty tab wins and
    // the argument is dropped — the draft outranks the disk copy.
    const argPaths = new Set(pendingOpens)
    const windows = restorable
      .map((win) => ({
        ...win,
        tabs: win.tabs.filter(
          (entry) => entry.dirty || entry.path === null || !argPaths.has(entry.path)
        )
      }))
      .filter((win) => win.tabs.length > 0)
    const restoredPaths = new Set(windows.flatMap((win) => win.tabs.map((entry) => entry.path)))
    for (const win of windows) void boot().restore(win)
    for (const path of pendingOpens) {
      if (!restoredPaths.has(path)) openFileSmart(path)
    }
    pendingOpens.length = 0
    if (sessions.size === 0) boot()

    app.on('activate', () => {
      if (sessions.size === 0) boot()
    })

    // Fork build: the background updater stays off — it would poll the
    // upstream feed unprompted and auto-download upstream releases over
    // this build's own features. The manual check (Help menu, Settings,
    // palette) still works; updating means pulling upstream and rebuilding.
    if (process.env['FOOLSCAP_AUTO_UPDATE'] === '1') {
      startAutoUpdater((info) => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        if (!win || win.isDestroyed()) return false
        win.webContents.send(IPC.updateReady, info)
        return true
      })
    }

    // First launch on a new version — an update just installed, and the
    // quiet machinery that did it earns one line: "Foolscap updated to X."
    void (async () => {
      const versionFile = join(app.getPath('userData'), 'last-version.json')
      const current = app.getVersion()
      let previous: string | null = null
      try {
        const raw = JSON.parse(await readFile(versionFile, 'utf8')) as { version?: unknown }
        previous = typeof raw.version === 'string' ? raw.version : null
      } catch {
        // first run ever, or unreadable — either way, no toast
      }
      try {
        await writeFile(versionFile, JSON.stringify({ version: current }))
      } catch {
        // best effort; worst case the toast repeats after the next update
      }
      if (previous && previous !== current) {
        // Give the window time to exist and settle; a missed toast is fine.
        setTimeout(() => {
          const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) win.webContents.send(IPC.updatedTo, current)
        }, 3000)
      }
    })()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
