/* The typed IPC contract. Main, preload, and renderer all import from here —
 * channel names and payload shapes exist in exactly one place. */

/* 'open' is a user-initiated document arrival (open, restore); 'reload' is
 * the same document refreshed from disk (watcher echo, conflict Reload).
 * Only 'open' may change the editor/preview mode. */
export type LoadReason = 'open' | 'reload'

export interface DocPayload {
  path: string | null
  /* Directory of the document, main-computed — the renderer has no path
   * module. Used to resolve relative image paths. */
  dir: string | null
  content: string
  /* True when restoring an unsaved buffer from a persisted session — the
   * document arrives already-dirty and opens in edit mode. */
  dirty: boolean
  reason: LoadReason
}

export type ConflictChoice = 'reload' | 'keep'

/* File types Foolscap opens via drag-and-drop. One definition for both the
 * renderer's drop filter and main's openDropped validation. */
export const DROPPABLE_FILE = /\.(md|markdown|mdx|txt)$/i

/* Sent after a successful save — Save As changes both. */
export interface SavedPayload {
  path: string | null
  dir: string | null
}

/* Menu-driven commands the renderer executes. */
export type MenuCommand =
  | 'toggle-outline'
  | 'toggle-typewriter'
  | 'toggle-focus'
  | 'toggle-palette'
  | 'toggle-preview'
  | 'show-help'
  | 'text-larger'
  | 'text-smaller'
  | 'text-reset'
  | 'open-settings'
  | 'format-bold'
  | 'format-italic'
  | 'format-strike'
  | 'format-code'
  | 'format-link'

/* A new version, downloaded and verified by src/main/updater.ts — ready to
 * install the moment the app restarts. */
export interface UpdatePayload {
  version: string
}

/* Renderer-initiated commands (command palette) the main process executes. */
export type AppCommand =
  | 'window-new'
  | 'help-window'
  | 'file-open'
  | 'file-save'
  | 'file-save-as'
  | 'export-html'
  | 'export-pdf'
  | 'file-print'
  | 'update-restart'

export const IPC = {
  // renderer → main
  dirty: 'doc:dirty',
  content: 'doc:content',
  conflictResolve: 'doc:conflict-resolve',
  openExternal: 'link:open-external',
  exec: 'app:exec',
  pasteImage: 'image:paste',
  openDropped: 'file:open-dropped',
  loadCustomTheme: 'theme:load-custom',
  // main → renderer
  command: 'menu:command',
  load: 'doc:load',
  saved: 'doc:saved',
  requestContent: 'doc:request-content',
  conflict: 'doc:conflict',
  updateReady: 'app:update-ready'
} as const

/* The contextBridge surface. Implemented in src/preload/index.ts, consumed as
 * `window.foolscap` in the renderer. */
export interface FoolscapApi {
  readonly platform: string
  setDirty(dirty: boolean): void
  sendContent(content: string): void
  resolveConflict(choice: ConflictChoice): void
  openExternal(url: string): void
  exec(command: AppCommand): void
  /* Returns the relative markdown path, or null for an unsaved document. */
  pasteImage(bytes: Uint8Array, ext: string): Promise<string | null>
  /* Absolute path of a dropped File (webUtils; File.path is long gone). */
  pathForFile(file: File): string
  openDropped(path: string): void
  /* Pick and read a custom theme css file; null if cancelled. */
  loadCustomTheme(): Promise<string | null>
  onLoad(cb: (doc: DocPayload) => void): void
  onCommand(cb: (command: MenuCommand) => void): void
  onSaved(cb: (saved: SavedPayload) => void): void
  onRequestContent(cb: () => void): void
  onConflict(cb: () => void): void
  onUpdateReady(cb: (update: UpdatePayload) => void): void
}
