import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/* Hot updates over the GitHub Releases feed (ULTRAPLAN §7, unlocked by
 * code signing — Squirrel.Mac verifies the running app and the downloaded
 * update against each other's signatures, so this only works signed).
 *
 * The manner is Foolscap's: everything happens quietly in the background,
 * and the user hears exactly one thing — a toast when a new version is
 * downloaded, verified, and READY. Restart now, or ignore it and the
 * update applies on whatever quit comes naturally (autoInstallOnAppQuit).
 * Every failure is silent; an updater is the least important thing this
 * app runs. Dev builds: inert. */

export interface UpdateReady {
  version: string
}

const FOUR_HOURS = 4 * 60 * 60 * 1000

export function startAutoUpdater(onReady: (info: UpdateReady) => void): void {
  if (!app.isPackaged) return
  autoUpdater.logger = null
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (event) => onReady({ version: event.version }))
  autoUpdater.on('error', () => {
    // offline, rate-limited, feed missing — all fine, all silent
  })
  const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
  // Well past startup: the check must never compete with first paint.
  setTimeout(check, 5000)
  // Long-lived sessions (⌘Q is rare here by design) still hear about
  // releases eventually.
  setInterval(check, FOUR_HOURS)
}

/* The restart half of the toast. Callers persist the session first —
 * an update must never cost anyone an unsaved draft. */
export function installAndRestart(): void {
  autoUpdater.quitAndInstall()
}
