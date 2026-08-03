import { resolveImageSrc } from '../editor/live-preview/images'
import { renderMarkdown } from '../../shared/markdown'

/* Preview mode: the document rendered by THE export pipeline — what you
 * preview is exactly what HTML and PDF export produce. Read-only by nature;
 * double-clicking any element drops back into the editor at that element's
 * source position (the data-pos stamps). Links open externally instead of
 * navigating the window. */

export class Preview {
  private readonly el: HTMLElement
  visible = false

  constructor(private readonly onEdit: (pos: number) => void) {
    this.el = document.createElement('div')
    this.el.className = 'preview'
    this.el.hidden = true
    document.body.append(this.el)

    this.el.addEventListener('dblclick', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const holder = target?.closest<HTMLElement>('[data-pos]')
      this.onEdit(holder ? Number(holder.dataset['pos']) : 0)
    })

    this.el.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const link = target?.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      event.preventDefault()
      const href = link.getAttribute('href') ?? ''
      if (href.startsWith('#')) {
        // In-document link (GFM footnotes): navigate inside this pane.
        // link.href would resolve against the page URL — file:// (rejected
        // by main's scheme allowlist) or, in dev, the dev server's http URL
        // (which would open the dev server in the user's browser). Scoped to
        // this.el because help and preview panes share one document.
        const id = decodeURIComponent(href.slice(1))
        this.el.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' })
        return
      }
      window.foolscap.openExternal(link.href)
    })
  }

  async show(markdown: string, docDir: string | null, nearPos: number): Promise<void> {
    const html = await renderMarkdown(markdown, { sourcePositions: true })
    this.el.innerHTML = `<main class="preview-doc">${html}</main>`
    // The pipeline escapes raw HTML, so this is our own output only.
    for (const img of this.el.querySelectorAll('img')) {
      const src = img.getAttribute('src')
      const resolved = src ? resolveImageSrc(src, docDir) : null
      if (resolved) img.src = resolved
      else img.removeAttribute('src')
    }
    this.el.hidden = false
    this.visible = true
    // Land near where the cursor was in the editor.
    if (nearPos > 0) this.scrollTo(nearPos, 'center')
    else this.el.scrollTop = 0
  }

  /* Scroll the rendered pane to the element covering a source position —
   * outline jumps while previewing land here. */
  scrollTo(pos: number, block: ScrollLogicalPosition = 'start'): void {
    let best: HTMLElement | null = null
    for (const candidate of this.el.querySelectorAll<HTMLElement>('[data-pos]')) {
      if (Number(candidate.dataset['pos']) <= pos) best = candidate
      else break
    }
    best?.scrollIntoView({ block })
  }

  hide(): void {
    this.el.hidden = true
    this.visible = false
  }
}
