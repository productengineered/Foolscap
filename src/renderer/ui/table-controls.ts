import type { EditorView } from '@codemirror/view'
import { tableAt } from '../editor/table-commands'
import {
  cellRangesOfLine,
  cycleAlign,
  deleteColumn,
  formatTable,
  insertColumn,
  parseTable,
  type TableModel
} from '../editor/table-model'
import { tokenMs, tokenPx } from './tokens'

/* Phase 4 column controls: a quiet chip bar that appears above a table
 * while the pointer is over it, acting on the hovered column. All actions
 * are the pure model transforms — parse, transform, format, replace. */

type Transform = (model: TableModel, column: number) => TableModel

export class TableControls {
  private bar: HTMLElement | null = null
  private hideTimer: number | undefined
  private tableFrom = -1
  private column = 0
  private rafPending = false

  constructor(private readonly view: EditorView) {
    view.scrollDOM.addEventListener('mousemove', (e) => this.onMove(e))
    view.scrollDOM.addEventListener('mouseleave', () => this.scheduleHide())
    view.dom.addEventListener('keydown', () => this.hide())
  }

  private onMove(event: MouseEvent): void {
    if (this.rafPending) return
    this.rafPending = true
    requestAnimationFrame(() => {
      this.rafPending = false
      this.locate(event.clientX, event.clientY)
    })
  }

  private locate(x: number, y: number): void {
    const pos = this.view.posAtCoords({ x, y })
    const table = pos === null ? null : tableAt(this.view.state, pos)
    if (!table || pos === null) {
      this.scheduleHide()
      return
    }
    const line = this.view.state.doc.lineAt(pos)
    const cells = cellRangesOfLine(line.text)
    let column = cells.length - 1
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      if (cell && pos - line.from <= cell.to) {
        column = i
        break
      }
    }
    this.tableFrom = table.from
    this.column = Math.max(0, column)
    this.show()
  }

  private show(): void {
    window.clearTimeout(this.hideTimer)
    if (!this.bar) {
      this.bar = this.build()
      document.body.append(this.bar)
    }
    const coords = this.view.coordsAtPos(this.tableFrom)
    if (!coords) return
    this.bar.style.left = `${Math.max(tokenPx('--edge-inset'), coords.left)}px`
    this.bar.style.top = `${coords.top - this.bar.offsetHeight - tokenPx('--table-bar-gap')}px`
    const label = this.bar.querySelector('.table-controls-col')
    if (label) label.textContent = `col ${this.column + 1}`
  }

  private scheduleHide(): void {
    window.clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => this.hide(), tokenMs('--dur-table-bar-hide'))
  }

  private hide(): void {
    this.bar?.remove()
    this.bar = null
  }

  private build(): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'table-controls'
    bar.addEventListener('mouseenter', () => window.clearTimeout(this.hideTimer))
    bar.addEventListener('mouseleave', () => this.scheduleHide())

    const label = document.createElement('span')
    label.className = 'table-controls-col'
    bar.append(label)

    const button = (text: string, title: string, transform: Transform): void => {
      const el = document.createElement('button')
      el.type = 'button'
      el.textContent = text
      el.title = title
      el.setAttribute('aria-label', title)
      el.addEventListener('click', () => this.apply(transform))
      bar.append(el)
    }

    button('+‹', 'Insert column before', (m, c) => insertColumn(m, c))
    button('+›', 'Insert column after', (m, c) => insertColumn(m, c + 1))
    button('⇄', 'Cycle column alignment', (m, c) => cycleAlign(m, c))
    button('×', 'Delete column', (m, c) => deleteColumn(m, c))
    return bar
  }

  private apply(transform: Transform): void {
    const table = tableAt(this.view.state, this.tableFrom)
    if (!table || table.from !== this.tableFrom) {
      this.hide()
      return
    }
    const text = this.view.state.sliceDoc(table.from, table.to)
    const next = formatTable(transform(parseTable(text), this.column))
    this.view.dispatch({
      changes: { from: table.from, to: table.to, insert: next },
      userEvent: 'input'
    })
    this.hide()
  }
}
