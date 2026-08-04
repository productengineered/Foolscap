import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
import type { FSWatcher } from 'chokidar'
import { basename, dirname, join } from 'node:path'
import {
  IPC,
  type ConflictChoice,
  type DocPayload,
  type LoadReason,
  type SavedPayload
} from '../shared/types'
import { renderExportHtml } from './export/html'
import { printDocument, renderPdf } from './export/pdf'
import { atomicWriteFile, readTextFile, timestampName, watchFile } from './files'
import type { SessionEntry } from './session-store'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'

interface SessionHooks {
  isQuitting(): boolean
  onQuitCancelled(): void
}

const MD_FILTERS = [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }]

/* Owns everything about the current document except the text itself: path,
 * dirty flag, disk watcher, dialogs, and the close/quit guard. The renderer
 * holds the buffer and nothing else; when main needs the text (saving), it
 * asks for it over IPC. */
export class DocumentSession {
  private path: string | null = null
  private dirty = false
  /* Content we last wrote or read ourselves — used to swallow the watcher
   * echo of our own atomic saves. */
  private lastSynced: string | null = null
  private pendingDiskContent: string | null = null
  private watcher: FSWatcher | null = null
  private forceClose = false
  /* Loads requested before the renderer can receive them queue here. */
  private ready = false
  private pendingPath: string | null = null
  private pendingRestore: SessionEntry | null = null
  private pendingHelp = false

  constructor(
    private win: BrowserWindow,
    private hooks: SessionHooks
  ) {
    this.updateTitle()
    win.webContents.once('did-finish-load', () => {
      this.ready = true
      if (this.pendingRestore) {
        const entry = this.pendingRestore
        this.pendingRestore = null
        void this.restore(entry)
      } else if (this.pendingPath) {
        const path = this.pendingPath
        this.pendingPath = null
        void this.openPath(path)
      }
      if (this.pendingHelp) {
        this.pendingHelp = false
        this.win.webContents.send(IPC.command, 'show-help')
      }
    })
    win.on('close', (e) => {
      if (this.dirty && !this.forceClose) {
        e.preventDefault()
        void this.confirmClose()
      }
    })
    win.on('closed', () => this.unwatch())
  }

  /* An untitled, untouched window — reusable for opening a file into. */
  get isEmpty(): boolean {
    return (
      this.path === null &&
      !this.dirty &&
      this.pendingPath === null &&
      this.pendingRestore === null
    )
  }

  /* ---- quit-time session persistence ---- */

  /* Snapshot for the session store: clean documents record only their path;
   * dirty ones carry the buffer. Untouched untitled windows record nothing. */
  async captureState(): Promise<SessionEntry | null> {
    if (this.isEmpty) return null
    if (!this.dirty) return { path: this.path, dirty: false, content: null }
    const content = await this.getRendererContent(3000)
    return { path: this.path, dirty: true, content }
  }

  /* Quit is persisting the session — close without the unsaved prompt. */
  allowSilentClose(): void {
    this.forceClose = true
  }

  async restore(entry: SessionEntry): Promise<void> {
    if (!this.ready) {
      this.pendingRestore = entry
      return
    }
    this.path = entry.path
    let disk: string | null = null
    if (entry.path) {
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

  focus(): void {
    if (this.win.isMinimized()) this.win.restore()
    this.win.focus()
  }

  /* Show the help overlay once the renderer can receive it — help opens in
   * its own fresh window so it never papers over someone's novella. */
  showHelpWhenReady(): void {
    if (this.ready && !this.win.isDestroyed()) {
      this.win.webContents.send(IPC.command, 'show-help')
    } else {
      this.pendingHelp = true
    }
  }

  setDirty(dirty: boolean): void {
    if (dirty !== this.dirty) {
      this.dirty = dirty
      this.updateTitle()
    }
  }

  async openPath(path: string): Promise<void> {
    if (!this.ready) {
      this.pendingPath = path
      return
    }
    if (!(await this.guardUnsaved())) return
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

  async openViaDialog(): Promise<void> {
    const result = await dialog.showOpenDialog(this.win, {
      properties: ['openFile'],
      filters: [...MD_FILTERS, { name: 'All Files', extensions: ['*'] }]
    })
    const picked = result.filePaths[0]
    if (!result.canceled && picked) await this.openPath(picked)
  }

  /* Save the buffer. Returns true on success, false if the user cancelled a
   * save-as dialog or the write failed. */
  async save(saveAs = false): Promise<boolean> {
    let target = this.path
    if (saveAs || !target) {
      const result = await dialog.showSaveDialog(this.win, {
        defaultPath: target ?? join(app.getPath('documents'), 'Untitled.md'),
        filters: MD_FILTERS
      })
      if (result.canceled || !result.filePath) return false
      target = result.filePath
    }
    let content: string
    try {
      content = await this.getRendererContent()
    } catch (err) {
      dialog.showErrorBox('Save failed', `${target}\n\n${String(err)}`)
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
    this.setDirty(false)
    this.updateTitle()
    const saved: SavedPayload = { path: target, dir: dirname(target) }
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
      filters: [{ name: label, extensions: [ext] }]
    })
    return result.canceled || !result.filePath ? null : result.filePath
  }

  resolveConflict(choice: ConflictChoice): void {
    if (choice === 'reload' && this.pendingDiskContent !== null) {
      this.load(this.pendingDiskContent, false, 'reload')
    }
    this.pendingDiskContent = null
  }

  /* ---- internals ---- */

  private load(content: string, dirty = false, reason: LoadReason = 'open'): void {
    if (this.win.isDestroyed()) return
    this.dirty = dirty
    this.pendingDiskContent = null
    this.updateTitle()
    const payload: DocPayload = {
      path: this.path,
      dir: this.path ? dirname(this.path) : null,
      content,
      dirty,
      reason
    }
    this.win.webContents.send(IPC.load, payload)
  }

  private updateTitle(): void {
    const name = this.path ? basename(this.path) : 'Untitled'
    if (process.platform === 'darwin') {
      // hiddenInset shows no title text, but the close button gets the
      // document-edited dot and Mission Control shows the name.
      this.win.setTitle(name)
      this.win.setRepresentedFilename(this.path ?? '')
      this.win.setDocumentEdited(this.dirty)
    } else {
      this.win.setTitle(`${this.dirty ? '• ' : ''}${name} — Foolscap`)
    }
  }

  /* Returns true when it is safe to discard the buffer. */
  private async guardUnsaved(): Promise<boolean> {
    if (!this.dirty) return true
    const name = this.path ? basename(this.path) : 'Untitled'
    const { response } = await dialog.showMessageBox(this.win, {
      type: 'warning',
      message: `Do you want to save the changes you made to “${name}”?`,
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

  private async confirmClose(): Promise<void> {
    const wasQuitting = this.hooks.isQuitting()
    if (await this.guardUnsaved()) {
      this.forceClose = true
      this.win.close()
      if (wasQuitting) app.quit()
    } else {
      this.hooks.onQuitCancelled()
    }
  }

  /* A promise that never settles would hang its caller — quit most fatally,
   * where one wedged window would also cost every other window's drafts. A
   * crashed or destroyed renderer rejects; timeoutMs (the quit path) bounds
   * a merely hung one. */
  private getRendererContent(timeoutMs?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const wc = this.win.webContents
      let timer: NodeJS.Timeout | undefined
      const cleanup = (): void => {
        ipcMain.off(IPC.content, handler)
        wc.off('render-process-gone', onGone)
        wc.off('destroyed', onGone)
        clearTimeout(timer)
      }
      // Filter by sender: with several windows open, another window's reply
      // must never satisfy this request.
      const handler = (e: Electron.IpcMainEvent, content: string): void => {
        if (e.sender.id === wc.id) {
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
        wc.send(IPC.requestContent)
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
      this.win.webContents.send(IPC.conflict)
    } else {
      this.load(disk, false, 'reload')
    }
  }
}
