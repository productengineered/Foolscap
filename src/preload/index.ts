import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type AppCommand,
  type ConflictChoice,
  type DocPayload,
  type FoolscapApi,
  type MenuCommand,
  type SavedPayload,
  type UpdatePayload
} from '../shared/types'

const api: FoolscapApi = {
  platform: process.platform,
  setDirty: (dirty) => ipcRenderer.send(IPC.dirty, dirty),
  sendContent: (content) => ipcRenderer.send(IPC.content, content),
  resolveConflict: (choice: ConflictChoice) => ipcRenderer.send(IPC.conflictResolve, choice),
  openExternal: (url) => ipcRenderer.send(IPC.openExternal, url),
  exec: (command: AppCommand) => ipcRenderer.send(IPC.exec, command),
  pasteImage: (bytes: Uint8Array, ext: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.pasteImage, bytes, ext),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  openDropped: (path: string) => ipcRenderer.send(IPC.openDropped, path),
  loadCustomTheme: (): Promise<string | null> => ipcRenderer.invoke(IPC.loadCustomTheme),
  onLoad: (cb) => ipcRenderer.on(IPC.load, (_e, doc: DocPayload) => cb(doc)),
  onCommand: (cb) => ipcRenderer.on(IPC.command, (_e, command: MenuCommand) => cb(command)),
  onSaved: (cb) => ipcRenderer.on(IPC.saved, (_e, saved: SavedPayload) => cb(saved)),
  onRequestContent: (cb) => ipcRenderer.on(IPC.requestContent, () => cb()),
  onConflict: (cb) => ipcRenderer.on(IPC.conflict, () => cb()),
  onUpdateReady: (cb) => ipcRenderer.on(IPC.updateReady, (_e, update: UpdatePayload) => cb(update)),
  onUpdatedTo: (cb) => ipcRenderer.on(IPC.updatedTo, (_e, version: string) => cb(version)),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck)
}

contextBridge.exposeInMainWorld('foolscap', api)
