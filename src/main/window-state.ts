import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/* Remember window bounds across launches. Read synchronously at window
 * creation (it gates the BrowserWindow constructor), written on close.
 * Deliberately not written on every move/resize — close is the only moment
 * that matters, and a crash just means last-known-good bounds. */

const FILE = 'window-state.json'

const DEFAULTS = { width: 980, height: 760 }

function stateFile(): string {
  return join(app.getPath('userData'), FILE)
}

function isRectangle(value: unknown): value is Rectangle {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r['x'] === 'number' &&
    typeof r['y'] === 'number' &&
    typeof r['width'] === 'number' &&
    typeof r['height'] === 'number'
  )
}

/* Clamp saved bounds to a currently attached display, so a window last seen
 * on a disconnected monitor doesn't restore off-screen. */
function visible(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    )
  })
}

export function restoreWindowBounds(): Partial<Rectangle> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFile(), 'utf8'))
    if (isRectangle(parsed) && visible(parsed)) return parsed
  } catch {
    // first launch or unreadable state — fall through to defaults
  }
  return DEFAULTS
}

export function trackWindowBounds(win: BrowserWindow): void {
  win.on('close', () => {
    try {
      writeFileSync(stateFile(), JSON.stringify(win.getNormalBounds()))
    } catch {
      // losing window bounds is not worth interrupting a close
    }
  })
}
