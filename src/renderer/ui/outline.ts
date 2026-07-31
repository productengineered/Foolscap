import { syntaxTree } from '@codemirror/language'
import type { Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'
import type { Tree } from '@lezer/common'

/* Outline panel (pulled forward from Phase 3; chosen over a minimap —
 * headings are the structure of prose, pixel thumbnails aren't). Toggleable,
 * off by default, floats at the right edge without touching the measure. */

export interface HeadingItem {
  level: number
  text: string
  from: number
}

const ATX = /^ATXHeading([1-6])$/
const SETEXT = /^SetextHeading([12])$/

export function collectHeadingItems(tree: Tree, doc: Text): HeadingItem[] {
  const items: HeadingItem[] = []
  tree.iterate({
    enter: (node) => {
      // Headings can't nest in these; skipping their subtrees keeps the
      // full-document walk cheap while the panel is open.
      if (node.name === 'Paragraph' || node.name === 'FencedCode' || node.name === 'Table') {
        return false
      }
      const match = ATX.exec(node.name) ?? SETEXT.exec(node.name)
      if (!match) return
      const firstLine = doc.lineAt(node.from)
      const raw = doc.sliceString(node.from, Math.min(node.to, firstLine.to))
      const text = raw
        .replace(/^#{1,6}[ \t]*/, '')
        .replace(/[ \t]*#+[ \t]*$/, '')
        .trim()
      items.push({ level: Number(match[1]), text: text || '(untitled)', from: node.from })
      return
    }
  })
  return items
}

export class Outline {
  private panel: HTMLElement | null = null
  private list: HTMLElement | null = null

  /* onJump lets the app route navigation by mode — in preview the visible
   * pane must scroll, not just the (hidden) editor. */
  constructor(
    private readonly view: EditorView,
    private readonly onJump?: (pos: number) => void
  ) {}

  toggle(): void {
    if (this.panel) {
      this.close()
    } else {
      this.open()
    }
  }

  /* For document loads: replace() swaps state via setState, which emits no
   * ViewUpdate, so the load path must refresh explicitly. */
  refresh(): void {
    if (this.panel) this.render()
  }

  handleUpdate(update: ViewUpdate): void {
    if (!this.panel) return
    // The tree comparison matters: after a document load the parse finishes
    // asynchronously, in updates where docChanged is false.
    if (update.docChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
      this.render()
    } else if (update.selectionSet) {
      this.markActive()
    }
  }

  private open(): void {
    this.panel = document.createElement('nav')
    this.panel.className = 'outline'
    this.panel.setAttribute('aria-label', 'Document outline')
    this.list = document.createElement('div')
    this.panel.append(this.list)
    document.body.append(this.panel)
    this.render()
  }

  private close(): void {
    this.panel?.remove()
    this.panel = null
    this.list = null
  }

  private render(): void {
    if (!this.list) return
    const items = collectHeadingItems(syntaxTree(this.view.state), this.view.state.doc)
    this.list.replaceChildren()
    if (items.length === 0) {
      const empty = document.createElement('span')
      empty.className = 'outline-empty'
      empty.textContent = 'No headings'
      this.list.append(empty)
      return
    }
    for (const item of items) {
      const button = document.createElement('button')
      button.className = `outline-item outline-l${item.level}`
      button.textContent = item.text
      button.dataset['from'] = String(item.from)
      button.addEventListener('click', () => this.jump(item.from))
      this.list.append(button)
    }
    this.markActive()
  }

  /* The active entry is the last heading at or above the cursor. */
  private markActive(): void {
    if (!this.list) return
    const head = this.view.state.selection.main.head
    let active: HTMLElement | null = null
    for (const el of this.list.querySelectorAll<HTMLElement>('.outline-item')) {
      el.classList.remove('active')
      if (Number(el.dataset['from']) <= head) active = el
    }
    active?.classList.add('active')
  }

  private jump(from: number): void {
    if (this.onJump) {
      this.onJump(from)
      return
    }
    this.view.dispatch({
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: 'start' })
    })
    this.view.focus()
  }
}
