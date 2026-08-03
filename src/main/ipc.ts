import { dialog, ipcMain, shell } from 'electron'
import { IPC, type AppCommand, type ConflictChoice } from '../shared/types'
import { readTextFile } from './files'
import type { MenuActions } from './menu'
import type { DocumentSession } from './session'

export const OPENABLE_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/* Renderer → main channels, routed to the sender's session — with several
 * windows open, e.sender.id is the only truth about which document is
 * talking. IPC.content is intentionally absent: it is a reply channel
 * consumed (sender-filtered) by DocumentSession.getRendererContent(). */
export function registerIpc(
  sessionFor: (webContentsId: number) => DocumentSession | null,
  actions: MenuActions
): void {
  ipcMain.on(IPC.dirty, (e, dirty: boolean) => sessionFor(e.sender.id)?.setDirty(dirty))
  ipcMain.on(IPC.conflictResolve, (e, choice: ConflictChoice) =>
    sessionFor(e.sender.id)?.resolveConflict(choice)
  )
  ipcMain.on(IPC.exec, (e, command: AppCommand) => {
    const session = sessionFor(e.sender.id)
    switch (command) {
      case 'window-new':
        return actions.newWindow()
      case 'help-window':
        return actions.help()
      case 'file-open':
        return actions.open()
      case 'file-save':
        return void session?.save()
      case 'file-save-as':
        return void session?.save(true)
      case 'export-html':
        return void session?.exportHtml()
      case 'export-pdf':
        return void session?.exportPdf()
      case 'file-print':
        return void session?.printDoc()
    }
  })
  ipcMain.handle(IPC.pasteImage, (e, bytes: Uint8Array, ext: string) => {
    const session = sessionFor(e.sender.id)
    if (!session || !/^[a-z0-9]+$/.test(ext)) return null
    return session.savePastedImage(bytes, ext)
  })
  ipcMain.on(IPC.openDropped, (e, path: string) => {
    if (typeof path === 'string' && path.length > 0) {
      void sessionFor(e.sender.id)?.openPath(path)
    }
  })
  ipcMain.handle(IPC.loadCustomTheme, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'CSS', extensions: ['css'] }]
    })
    const picked = result.filePaths[0]
    if (result.canceled || !picked) return null
    try {
      return await readTextFile(picked)
    } catch {
      return null
    }
  })
  ipcMain.on(IPC.openExternal, (_e, url: string) => {
    try {
      if (OPENABLE_SCHEMES.has(new URL(url).protocol)) void shell.openExternal(url)
    } catch {
      // not a parseable URL — ignore
    }
  })
}
