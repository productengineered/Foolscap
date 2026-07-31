import { Menu, MenuItem, type BrowserWindow } from 'electron'
import { IPC, type MenuCommand } from '../shared/types'

/* Electron provides no context menu; this is the standard writer's one:
 * spelling suggestions from the native spellchecker first (that's what a
 * right-click in prose is usually for), then the edit operations, enabled
 * according to what the click landed on. */
export function attachContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_e, params) => {
    const menu = new Menu()

    for (const suggestion of params.dictionarySuggestions) {
      menu.append(
        new MenuItem({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion)
        })
      )
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length === 0) {
        menu.append(new MenuItem({ label: 'No Guesses Found', enabled: false }))
      }
      menu.append(
        new MenuItem({
          label: 'Add to Dictionary',
          click: () =>
            win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
        })
      )
      menu.append(new MenuItem({ type: 'separator' }))
    }

    menu.append(new MenuItem({ role: 'cut', enabled: params.editFlags.canCut }))
    menu.append(new MenuItem({ role: 'copy', enabled: params.editFlags.canCopy }))
    menu.append(new MenuItem({ role: 'paste', enabled: params.editFlags.canPaste }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({ role: 'selectAll' }))
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(
      new MenuItem({
        label: 'Commands…',
        accelerator: 'CmdOrCtrl+K',
        click: () =>
          win.webContents.send(IPC.command, 'toggle-palette' satisfies MenuCommand)
      })
    )

    menu.popup()
  })
}
