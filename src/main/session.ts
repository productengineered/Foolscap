import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import type { FSWatcher } from 'chokidar'
import { basename, dirname, join } from 'node:path'
import {
  IPC,
  NEW_DOC_TEMPLATE,
  type ConflictChoice,
  type DocPayload,
  type LoadReason,
  type SavedPayload,
  type TabsState
} from '../shared/types'
import { renderExportHtml } from './export/html'
import { printDocument, renderPdf } from './export/pdf'
import { atomicWriteFile, readTextFile, timestampName, watchFile } from './files'
import { acquireAccess, ensureFolderAccess, rememberBookmark } from './scoped'
import type { SessionEntry, WindowEntry } from './session-store'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

interface SessionHooks {
  isQuitting(): boolean
  onQuitCancelled(): void
}

const MD_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }]

/* App-unique tab identity; ids never recycle within a run. */
let nextDocId = 1

/* ---- TabSession: one document ----
 *
 * Owns everything about one document except the text itself: path, dirty
 * flag, disk watcher, save/export dialogs. The renderer holds the buffer
 * and nothing else; when main needs the text (saving), it asks for it over
 * IPC by docId. A TabSession outlives its window: dragging a tab out
 * re-homes the same session — watcher, scoped access, and all — into the
 * new window. */
export class TabSession {
  readonly docId = nextDocId++
  private path: string | null = null
  private dirty = false
  /* Content we last wrote or read ourselves — used to swallow the watcher
   * echo of our own atomic saves. */
  private lastSynced: string | null = null
  private pendingDiskContent: string | null = null
  private watcher: FSWatcher | null = null
  /* mas: scoped-resource stopper for the current document; held while open. */
  private stopScopedAccess: (() => void) | null = null

  constructor(private host: WindowSession) {}

  /* Detach hands the session to another window. */
  rehost(host: WindowSession): void {
    this.host = host
  }

  get isDirty(): boolean {
    return this.dirty
  }

  getPath(): string | null {
    return this.path
  }

  /* An untitled, untouched tab — reusable for opening a file into. */
  get isEmpty(): boolean {
    return this.path === null && !this.dirty
  }

  name(): string {
    return this.path ? basename(this.path) : 'Untitled'
  }

  private get win(): BrowserWindow {
    return this.host.window
  }

  /* ---- session persistence ---- */

  /* Snapshot for the session store: clean documents record only their path;
   * dirty ones carry the buffer. Untouched untitled tabs record nothing. */
  async captureState(): Promise<SessionEntry | null> {
    if (this.isEmpty) return null
    if (!this.dirty) return { path: this.path, dirty: false, content: null }
    const content = await this.getRendererContent(3000)
    return { path: this.path, dirty: true, content }
  }

  async restore(entry: SessionEntry): Promise<void> {
    this.path = entry.path
    let disk: string | null = null
    if (entry.path) {
      await this.scopeTo(entry.path)
      try {
        disk = await readTextFile(entry.path)
      } catch {
        // deleted or unreadable while we were closed; the buffer (or an
        // empty doc) stands in, and saving will recreate the file
      }
    }
    this.lastSynced = disk
    this.rewatch()
    const content = entry.dirty && entry.content !== null ? entry.content : (disk ?? '')
    this.load(content, entry.dirty)
    if (entry.path) app.addRecentDocument(entry.path)
  }

  setDirty(dirty: boolean): void {
    if (dirty !== this.dirty) {
      this.dirty = dirty
      this.host.onTabChanged()
    }
  }

  /* Opens always land in a fresh or empty tab (WindowSession routes them),
   * so there is no buffer here worth guarding. */
  async openPath(path: string): Promise<void> {
    await this.scopeTo(path)
    let content = ''
    try {
      content = await readTextFile(path)
    } catch (err) {
      // A nonexistent path becomes a new file that will be created on save;
      // any other failure is a real error.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        dialog.showErrorBox('Could not open file', `${path}\n\n${String(err)}`)
        return
      }
    }
    this.path = path
    this.lastSynced = content
    this.rewatch()
    this.load(content)
    app.addRecentDocument(path)
  }

  /* The blank document a fresh tab opens as. */
  loadTemplate(): void {
    this.load(NEW_DOC_TEMPLATE)
  }

  /* A detached tab arriving in its new window, buffer carried over. */
  loadTransferred(content: string, dirty: boolean): void {
    this.dirty = dirty
    this.load(content, dirty, 'transfer')
  }

  /* Save the buffer. Returns true on success, false if the user cancelled a
   * save-as dialog or the write failed. */
  async save(saveAs = false): Promise<boolean> {
    let target = this.path
    if (saveAs || !target) {
      const result = await dialog.showSaveDialog(this.win, {
        defaultPath: target ?? join(app.getPath('documents'), 'Untitled.md'),
        filters: MD_FILTERS,
        securityScopedBookmarks: true
      })
      if (result.canceled || !result.filePath) return false
      target = result.filePath
      await rememberBookmark(target, result.bookmark)
    }
    let content: string
    try {
      content = await this.getRendererContent()
    } catch (err) {
      dialog.showErrorBox('Save failed', `${target}\n\n${String(err)}`)
      return false
    }
    // Atomic saves write a temp file beside the target — under the mas
    // sandbox that needs the folder, not just the file.
    if (
      !(await ensureFolderAccess(
        this.win,
        dirname(target),
        'Foolscap saves safely by writing a temporary file next to your document. Allow access to this folder.'
      ))
    ) {
      return false
    }
    this.unwatch()
    try {
      await atomicWriteFile(target, content)
    } catch (err) {
      dialog.showErrorBox('Save failed', `${target}\n\n${String(err)}`)
      this.rewatch()
      return false
    }
    this.path = target
    this.lastSynced = content
    this.rewatch()
    this.dirty = false
    this.host.onTabChanged()
    const saved: SavedPayload = { docId: this.docId, path: target, dir: dirname(target) }
    this.win.webContents.send(IPC.saved, saved)
    app.addRecentDocument(target)
    return true
  }

  async exportHtml(): Promise<void> {
    const target = await this.pickExportPath('HTML', 'html')
    if (!target) return
    try {
      const content = await this.getRendererContent()
      const html = await renderExportHtml(content, { title: this.docName() })
      await atomicWriteFile(target, html)
    } catch (err) {
      dialog.showErrorBox('Export failed', `${target}\n\n${String(err)}`)
    }
  }

  async exportPdf(): Promise<void> {
    const target = await this.pickExportPath('PDF', 'pdf')
    if (!target) return
    try {
      const content = await this.getRendererContent()
      const dir = this.path ? dirname(this.path) : null
      const pdf = await renderPdf(content, this.docName(), dir)
      await atomicWriteFile(target, pdf)
    } catch (err) {
      dialog.showErrorBox('Export failed', `${target}\n\n${String(err)}`)
    }
  }

  /* Paste target per the plan: a sibling assets/ folder, relative link back.
   * Null for unsaved documents — no directory to be a sibling of. */
  async savePastedImage(bytes: Uint8Array, ext: string): Promise<string | null> {
    if (!this.path) return null
    if (
      !(await ensureFolderAccess(
        this.win,
        dirname(this.path),
        'Pasted images live in an assets folder next to your document. Allow access to this folder.'
      ))
    ) {
      return null
    }
    const assetsDir = join(dirname(this.path), 'assets')
    await mkdir(assetsDir, { recursive: true })
    let name = timestampName('pasted', ext, new Date())
    for (let n = 2; existsSync(join(assetsDir, name)); n++) {
      name = timestampName(`pasted-${n}`, ext, new Date())
    }
    await atomicWriteFile(join(assetsDir, name), bytes)
    return `assets/${name}`
  }

  async printDoc(): Promise<void> {
    try {
      const content = await this.getRendererContent()
      await printDocument(content, this.docName(), this.path ? dirname(this.path) : null)
    } catch (err) {
      dialog.showErrorBox('Print failed', String(err))
    }
  }

  private docName(): string {
    return this.path ? basename(this.path).replace(/\.(md|markdown|mdx)$/i, '') : 'Untitled'
  }

  private async pickExportPath(label: string, ext: string): Promise<string | null> {
    const result = await dialog.showSaveDialog(this.win, {
      defaultPath: join(
        this.path ? dirname(this.path) : app.getPath('documents'),
        `${this.docName()}.${ext}`
      ),
      filters: [{ name: label, extensions: [ext] }],
      securityScopedBookmarks: true
    })
    if (result.canceled || !result.filePath) return null
    await rememberBookmark(result.filePath, result.bookmark)
    // Exports are atomic writes too; the temp file needs the folder.
    if (
      !(await ensureFolderAccess(
        this.win,
        dirname(result.filePath),
        `Foolscap writes the ${label} safely via a temporary file in this folder. Allow access.`
      ))
    ) {
      return null
    }
    return result.filePath
  }

  resolveConflict(choice: ConflictChoice): void {
    if (choice === 'reload' && this.pendingDiskContent !== null) {
      this.load(this.pendingDiskContent, false, 'reload')
    }
    this.pendingDiskContent = null
  }

  /* Returns true when it is safe to discard the buffer. Public: the window
   * runs this per dirty tab when closing. */
  async guardUnsaved(): Promise<boolean> {
    if (!this.dirty) return true
    const { response } = await dialog.showMessageBox(this.win, {
      type: 'warning',
      message: `Do you want to save the changes you made to “${this.name()}”?`,
      detail: 'Your changes will be lost if you don’t save them.',
      buttons: ['Save', 'Don’t Save', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (response === 2) return false
    if (response === 1) return true
    return this.save()
  }

  /* Watcher and scoped access released — the tab is gone for good. */
  dispose(): void {
    this.unwatch()
    this.stopScopedAccess?.()
    this.stopScopedAccess = null
  }

  /* ---- internals ---- */

  /* Swap long-lived scoped access to follow the open document (mas no-op
   * elsewhere). Released implicitly at process exit. */
  private async scopeTo(path: string): Promise<void> {
    this.stopScopedAccess?.()
    this.stopScopedAccess = await acquireAccess(path)
  }

  private load(content: string, dirty = false, reason: LoadReason = 'open'): void {
    if (this.win.isDestroyed()) return
    this.dirty = dirty
    this.pendingDiskContent = null
    this.host.onTabChanged()
    const payload: DocPayload = {
      docId: this.docId,
      path: this.path,
      dir: this.path ? dirname(this.path) : null,
      content,
      dirty,
      reason
    }
    this.win.webContents.send(IPC.load, payload)
  }

  /* A promise that never settles would hang its caller — quit most fatally,
   * where one wedged window would also cost every other window's drafts. A
   * crashed or destroyed renderer rejects; timeoutMs (the quit path) bounds
   * a merely hung one. */
  getRendererContent(timeoutMs?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const wc = this.win.webContents
      let timer: NodeJS.Timeout | undefined
      const cleanup = (): void => {
        ipcMain.off(IPC.content, handler)
        wc.off('render-process-gone', onGone)
        wc.off('destroyed', onGone)
        clearTimeout(timer)
      }
      // Filter by sender AND docId: with several windows and tabs open,
      // another document's reply must never satisfy this request.
      const handler = (e: Electron.IpcMainEvent, docId: number, content: string): void => {
        if (e.sender.id === wc.id && docId === this.docId) {
          cleanup()
          resolve(content)
        }
      }
      const onGone = (): void => {
        cleanup()
        reject(new Error('renderer gone before replying with its content'))
      }
      ipcMain.on(IPC.content, handler)
      wc.on('render-process-gone', onGone)
      wc.on('destroyed', onGone)
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          cleanup()
          reject(new Error('renderer did not reply with its content'))
        }, timeoutMs)
      }
      try {
        wc.send(IPC.requestContent, this.docId)
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  private rewatch(): void {
    this.unwatch()
    if (!this.path) return
    this.watcher = watchFile(this.path, () => void this.onDiskChange())
  }

  private unwatch(): void {
    void this.watcher?.close()
    this.watcher = null
  }

  /* External-change policy per ULTRAPLAN §6: clean buffer reloads silently;
   * dirty buffer gets a non-modal bar offering reload or keep. Never silently
   * overwrite in either direction. */
  private async onDiskChange(): Promise<void> {
    if (!this.path) return
    let disk: string
    try {
      disk = await readTextFile(this.path)
    } catch {
      return
    }
    if (disk === this.lastSynced) return // echo of our own save
    if (this.win.isDestroyed()) return // read completed after close
    this.lastSynced = disk
    if (this.dirty) {
      this.pendingDiskContent = disk
      this.win.webContents.send(IPC.conflict, this.docId)
    } else {
      this.load(disk, false, 'reload')
    }
  }
}

/* ---- WindowSession: one window's tab strip ----
 *
 * Owns tab identity, order, and activation; pushes the strip to the
 * renderer as tabs:state and applies the intents that come back. The close
 * guard walks every dirty tab. */
export class WindowSession {
  private tabs: TabSession[] = []
  private activeIndex = 0
  private forceClose = false
  /* Loads requested before the renderer can receive them queue here. */
  private ready = false
  private pendingPaths: string[] = []
  private pendingRestore: WindowEntry | null = null
  private pendingHelp = false
  private pendingAdopt: { tab: TabSession; content: string; dirty: boolean } | null = null

  constructor(
    readonly window: BrowserWindow,
    private hooks: SessionHooks
  ) {
    this.updateTitle()
    window.webContents.once('did-finish-load', () => {
      this.ready = true
      if (this.pendingRestore) {
        const entry = this.pendingRestore
        this.pendingRestore = null
        void this.restore(entry)
      }
      if (this.pendingAdopt) {
        const adopt = this.pendingAdopt
        this.pendingAdopt = null
        this.finishAdopt(adopt.tab, adopt.content, adopt.dirty)
      }
      for (const path of this.pendingPaths.splice(0)) void this.openPath(path)
      // A window that arrived with nothing to show opens an untitled tab.
      if (this.tabs.length === 0) this.newTab()
      if (this.pendingHelp) {
        this.pendingHelp = false
        this.window.webContents.send(IPC.command, 'show-help')
      }
    })
    window.on('close', (e) => {
      if (this.forceClose) return
      if (this.tabs.some((t) => t.isDirty)) {
        e.preventDefault()
        void this.confirmCloseAll()
      }
    })
    window.on('closed', () => {
      for (const tab of this.tabs) tab.dispose()
      this.tabs = []
    })
  }

  get activeTab(): TabSession | null {
    return this.tabs[this.activeIndex] ?? null
  }

  get tabCount(): number {
    return this.tabs.length
  }

  tab(docId: number): TabSession | null {
    return this.tabs.find((t) => t.docId === docId) ?? null
  }

  tabWithPath(path: string): TabSession | null {
    return this.tabs.find((t) => t.getPath() === path) ?? null
  }

  /* ---- opening ---- */

  newTab(): void {
    if (!this.ready) return
    const tab = new TabSession(this)
    this.tabs.push(tab)
    this.activeIndex = this.tabs.length - 1
    tab.loadTemplate()
    this.broadcast()
  }

  /* Consecutive opens (a multi-file launch, a burst of drops) must not race
   * for the same "empty" tab — each open sees the previous one's result. */
  private opening: Promise<void> = Promise.resolve()

  /* A file arriving in this window: activate it if already open, open into
   * an untouched untitled active tab, otherwise a fresh tab. */
  openPath(path: string): Promise<void> {
    if (!this.ready) {
      this.pendingPaths.push(path)
      return Promise.resolve()
    }
    const run = this.opening.then(() => this.openPathNow(path))
    this.opening = run.catch(() => undefined)
    return run
  }

  private async openPathNow(path: string): Promise<void> {
    const existing = this.tabWithPath(path)
    if (existing) {
      this.activate(existing.docId)
      return
    }
    const active = this.activeTab
    let target: TabSession
    if (active && active.isEmpty) {
      target = active
    } else {
      target = new TabSession(this)
      this.tabs.push(target)
      this.activeIndex = this.tabs.length - 1
    }
    await target.openPath(path)
    this.activeIndex = this.tabs.indexOf(target)
    this.broadcast()
  }

  async openViaDialog(): Promise<void> {
    const result = await dialog.showOpenDialog(this.window, {
      properties: ['openFile'],
      filters: [...MD_FILTERS, { name: 'All Files', extensions: ['*'] }],
      securityScopedBookmarks: true
    })
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return
    await rememberBookmark(picked, result.bookmarks?.[0])
    await this.openPath(picked)
  }

  async restore(entry: WindowEntry): Promise<void> {
    if (!this.ready) {
      this.pendingRestore = entry
      return
    }
    for (const tabEntry of entry.tabs) {
      const tab = new TabSession(this)
      this.tabs.push(tab)
      await tab.restore(tabEntry)
    }
    this.activeIndex = Math.max(0, Math.min(entry.active, this.tabs.length - 1))
    this.broadcast()
  }

  /* ---- tab intents from the renderer ---- */

  activate(docId: number): void {
    const index = this.tabs.findIndex((t) => t.docId === docId)
    if (index === -1 || index === this.activeIndex) return
    this.activeIndex = index
    this.broadcast()
  }

  /* Close one tab, guarding its unsaved changes; the last tab closes the
   * window (whose own guard then runs). */
  async closeTab(docId: number): Promise<void> {
    const tab = this.tab(docId)
    if (!tab) return
    if (this.tabs.length === 1) {
      this.window.close()
      return
    }
    if (tab.isDirty) {
      this.activate(docId) // the user should see what they're deciding about
      if (!(await tab.guardUnsaved())) return
    }
    this.removeTab(tab)
    tab.dispose()
  }

  closeActiveTab(): void {
    const active = this.activeTab
    if (active) void this.closeTab(active.docId)
  }

  reorder(docId: number, toIndex: number): void {
    const from = this.tabs.findIndex((t) => t.docId === docId)
    if (from === -1) return
    const activeId = this.activeTab?.docId
    const clamped = Math.max(0, Math.min(toIndex, this.tabs.length - 1))
    const moved = this.tabs.splice(from, 1)
    this.tabs.splice(clamped, 0, ...moved)
    this.activeIndex = Math.max(
      0,
      this.tabs.findIndex((t) => t.docId === activeId)
    )
    this.broadcast()
  }

  /* Drag-out, source side: pull the buffer (edits travel with the tab),
   * remove the tab from this strip, and hand the session over. Null when
   * the tab can't leave (sole tab, or a wedged renderer). */
  async extractTab(docId: number): Promise<{ tab: TabSession; content: string; dirty: boolean } | null> {
    const tab = this.tab(docId)
    if (!tab || this.tabs.length <= 1) return null
    let content: string
    try {
      content = await tab.getRendererContent(2000)
    } catch {
      return null
    }
    const dirty = tab.isDirty
    this.removeTab(tab)
    return { tab, content, dirty }
  }

  /* Drag-out, target side: the same TabSession, re-homed. */
  adoptTab(tab: TabSession, content: string, dirty: boolean): void {
    if (!this.ready) {
      this.pendingAdopt = { tab, content, dirty }
      return
    }
    this.finishAdopt(tab, content, dirty)
  }

  private finishAdopt(tab: TabSession, content: string, dirty: boolean): void {
    tab.rehost(this)
    this.tabs.push(tab)
    this.activeIndex = this.tabs.length - 1
    tab.loadTransferred(content, dirty)
    this.broadcast()
  }

  private removeTab(tab: TabSession): void {
    const index = this.tabs.indexOf(tab)
    if (index === -1) return
    this.tabs.splice(index, 1)
    if (this.activeIndex >= this.tabs.length) this.activeIndex = this.tabs.length - 1
    else if (index < this.activeIndex) this.activeIndex--
    this.broadcast()
  }

  /* ---- window-level plumbing ---- */

  /* Tabs report every path/dirty change here; the strip and title follow. */
  onTabChanged(): void {
    this.broadcast()
  }

  private broadcast(): void {
    if (this.window.isDestroyed() || this.tabs.length === 0) {
      this.updateTitle()
      return
    }
    const state: TabsState = {
      tabs: this.tabs.map((t) => ({
        docId: t.docId,
        name: t.name(),
        path: t.getPath(),
        dirty: t.isDirty
      })),
      active: this.activeTab?.docId ?? -1
    }
    this.window.webContents.send(IPC.tabsState, state)
    this.updateTitle()
  }

  private updateTitle(): void {
    if (this.window.isDestroyed()) return
    const active = this.activeTab
    const name = active?.name() ?? 'Untitled'
    const dirty = active?.isDirty ?? false
    if (process.platform === 'darwin') {
      // hiddenInset shows no title text, but the close button gets the
      // document-edited dot and Mission Control shows the name.
      this.window.setTitle(name)
      this.window.setRepresentedFilename(active?.getPath() ?? '')
      this.window.setDocumentEdited(dirty)
    } else {
      this.window.setTitle(`${dirty ? '• ' : ''}${name} — Foolscap`)
    }
  }

  /* ---- quit-time persistence ---- */

  async captureState(): Promise<WindowEntry | null> {
    const caps: (SessionEntry | null)[] = []
    for (const tab of this.tabs) {
      try {
        caps.push(await tab.captureState())
      } catch {
        caps.push(null) // a wedged tab must not block quitting
      }
    }
    const entries = caps.filter((c): c is SessionEntry => c !== null)
    if (entries.length === 0) return null
    let active = 0
    for (let i = 0, seen = 0; i < caps.length; i++) {
      if (caps[i]) {
        if (i === this.activeIndex) active = seen
        seen++
      }
    }
    return { tabs: entries, active }
  }

  /* Quit is persisting the session — close without the unsaved prompt. */
  allowSilentClose(): void {
    this.forceClose = true
  }

  focus(): void {
    if (this.window.isMinimized()) this.window.restore()
    this.window.focus()
  }

  /* Show the help overlay once the renderer can receive it. */
  showHelpWhenReady(): void {
    if (this.ready && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC.command, 'show-help')
    } else {
      this.pendingHelp = true
    }
  }

  /* Walk every dirty tab; any Cancel aborts the whole close. */
  private async confirmCloseAll(): Promise<void> {
    const wasQuitting = this.hooks.isQuitting()
    for (const tab of [...this.tabs]) {
      if (!tab.isDirty) continue
      this.activate(tab.docId)
      if (!(await tab.guardUnsaved())) {
        this.hooks.onQuitCancelled()
        return
      }
    }
    this.forceClose = true
    this.window.close()
    if (wasQuitting) app.quit()
  }
}
