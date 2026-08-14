/* Document title in the drag strip — hiddenInset gives us no native title
 * text, so the strip carries the name: centered, quiet, with an accent dot
 * while there are unsaved changes (fullscreen hides the traffic-light dot,
 * so the strip is the one place dirty state is always visible). */

let title: HTMLElement | null = null

export function initTitlebar(): void {
  const strip = document.getElementById('titlebar')
  if (!strip) return
  title = document.createElement('span')
  title.className = 'titlebar-title'
  strip.append(title)
}

/* With two or more tabs the strip belongs to the tab bar; the centered
 * title text stands down. */
export function setTitlebarVisible(visible: boolean): void {
  if (title) title.hidden = !visible
}

export function setTitlebar(path: string | null, dirty: boolean): void {
  if (!title) return
  const name = path ? (path.split(/[\\/]/).pop() ?? 'Untitled') : 'Untitled'
  title.replaceChildren()
  if (dirty) {
    const dot = document.createElement('span')
    dot.className = 'titlebar-dirty'
    dot.textContent = '•'
    title.append(dot)
  }
  title.append(name)
}
