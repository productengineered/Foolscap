import { syntaxTree } from '@codemirror/language'
import { EditorSelection, type Extension } from '@codemirror/state'
import { ViewPlugin, type EditorView, type KeyBinding, type ViewUpdate } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import {
  formatTable,
  insertRow,
  normalizeTable,
  parseTable,
  tableCellRanges
} from './table-model'

/* Phase 4 behavior: Tab/Shift-Tab walk cells (selecting their content), Tab
 * past the last cell appends a row, Enter inserts a row below the current
 * one. The normalizer runs when the cursor leaves a table, so the source is
 * clean pipe-table markdown whenever you're not actively inside it. */

export function tableAt(state: EditorView['state'], pos: number): SyntaxNode | null {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (node.name === 'Table') return node
  }
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
    node;
    node = node.parent
  ) {
    if (node.name === 'Table') return node
  }
  return null
}

function replaceTable(
  view: EditorView,
  table: { from: number; to: number },
  next: string,
  cursor: number
): void {
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: next },
    selection: { anchor: cursor },
    scrollIntoView: true,
    userEvent: 'input'
  })
}

/* Cursor offset (relative to table start) of the first cell on line
 * `lineIndex` of formatted table text. */
function firstCellOffset(formatted: string, lineIndex: number): number {
  const lines = formatted.split('\n')
  let offset = 0
  for (let i = 0; i < lineIndex; i++) offset += (lines[i] ?? '').length + 1
  const line = lines[lineIndex] ?? ''
  const cell = tableCellRanges(line)[0] ?? null
  // cellRangesOfLine on the single line yields line-relative positions.
  return offset + (cell ? cell.from : line.length)
}

function appendRow(view: EditorView, table: SyntaxNode): void {
  const text = view.state.sliceDoc(table.from, table.to)
  const model = parseTable(text)
  const next = formatTable(insertRow(model, model.rows.length - 1))
  const lineCount = next.split('\n').length
  replaceTable(view, table, next, table.from + firstCellOffset(next, lineCount - 1))
}

function insertRowBelow(view: EditorView, table: SyntaxNode, head: number): void {
  const state = view.state
  const tableLine = state.doc.lineAt(table.from).number
  const cursorLine = state.doc.lineAt(head).number
  // Line 0 = header, line 1 = delimiter → both insert the first body row.
  const bodyIndex = Math.max(-1, cursorLine - tableLine - 2)
  const text = state.sliceDoc(table.from, table.to)
  const next = formatTable(insertRow(parseTable(text), bodyIndex))
  replaceTable(view, table, next, table.from + firstCellOffset(next, bodyIndex + 3))
}

function moveCell(view: EditorView, forward: boolean): boolean {
  const head = view.state.selection.main.head
  const table = tableAt(view.state, head)
  if (!table) return false
  const cells = tableCellRanges(view.state.sliceDoc(table.from, table.to)).map((c) => ({
    from: c.from + table.from,
    to: c.to + table.from
  }))
  if (cells.length === 0) return false
  let index = cells.findIndex((c) => head >= c.from && head <= c.to)
  if (index === -1) {
    // Cursor on a pipe or padding: the next cell boundary decides.
    const after = cells.findIndex((c) => c.from > head)
    index = forward ? (after === -1 ? cells.length - 1 : after - 1) : after === -1 ? cells.length : after
  }
  const target = index + (forward ? 1 : -1)
  if (target < 0) return true
  if (target >= cells.length) {
    appendRow(view, table)
    return true
  }
  const cell = cells[target]
  if (!cell) return true
  view.dispatch({
    selection: EditorSelection.range(cell.from, cell.to),
    scrollIntoView: true
  })
  return true
}

export const tableKeymap: KeyBinding[] = [
  { key: 'Tab', run: (view) => moveCell(view, true) },
  { key: 'Shift-Tab', run: (view) => moveCell(view, false) },
  {
    key: 'Enter',
    run: (view) => {
      const head = view.state.selection.main.head
      const table = tableAt(view.state, head)
      if (!table) return false
      insertRowBelow(view, table, head)
      return true
    }
  }
]

/* Normalize a table's source once the cursor leaves it. */
export function tableNormalizer(): Extension {
  return ViewPlugin.fromClass(
    class {
      private prevTableFrom: number | null = null

      constructor(readonly view: EditorView) {}

      update(update: ViewUpdate): void {
        if (!update.selectionSet && !update.docChanged) return
        const head = update.state.selection.main.head
        const current = tableAt(update.state, head)?.from ?? null
        const prev =
          this.prevTableFrom === null
            ? null
            : update.changes.mapPos(this.prevTableFrom, 1)
        if (prev !== null && prev !== current) {
          const view = update.view
          queueMicrotask(() => normalizeTableAt(view, prev))
        }
        this.prevTableFrom = current
      }
    }
  )
}

function normalizeTableAt(view: EditorView, pos: number): void {
  if (pos > view.state.doc.length) return
  const table = tableAt(view.state, pos)
  if (!table || table.from !== pos) return
  const text = view.state.sliceDoc(table.from, table.to)
  const normalized = normalizeTable(text)
  if (normalized === text) return
  view.dispatch({
    changes: { from: table.from, to: table.to, insert: normalized },
    userEvent: 'format'
  })
}
