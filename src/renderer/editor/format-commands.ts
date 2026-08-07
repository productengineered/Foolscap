import { syntaxTree } from '@codemirror/language'
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type SelectionRange,
  type StateCommand
} from '@codemirror/state'
import type { SyntaxNode, Tree } from '@lezer/common'

/* Inline formatting as plain text transactions: wrap the selection in the
 * construct's markers, or strip the markers when the selection already sits
 * inside that construct (detected from the lezer tree, never by string
 * matching). An empty selection formats the word under the caret; with no
 * word, it inserts a marker pair and parks the caret between — pressing the
 * shortcut again before typing removes the empty pair. */

export interface InlineFormat {
  /* The lezer node the wrapped construct parses to. */
  node: string
  marker: string
}

export const strong: InlineFormat = { node: 'StrongEmphasis', marker: '**' }
export const emphasis: InlineFormat = { node: 'Emphasis', marker: '*' }
export const strikethrough: InlineFormat = { node: 'Strikethrough', marker: '~~' }
export const inlineCode: InlineFormat = { node: 'InlineCode', marker: '`' }

/* Innermost node named `name` covering [from, to], approached from both
 * sides so a caret flush against a marker still counts as inside. */
function enclosingFormat(tree: Tree, from: number, to: number, name: string): SyntaxNode | null {
  for (const side of [-1, 1] as const) {
    for (
      let node: SyntaxNode | null = tree.resolveInner(from, side);
      node;
      node = node.parent
    ) {
      if (node.name === name && node.from <= from && node.to >= to) return node
    }
  }
  return null
}

interface RangeEdit {
  changes: ChangeSpec[]
  range: SelectionRange
}

function unwrap(state: EditorState, range: SelectionRange, node: SyntaxNode, len: number): RangeEdit {
  /* The construct's only children are its marker nodes (EmphasisMark,
   * CodeMark, …) — the text between them is not a node. */
  const marks: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name.endsWith('Mark')) marks.push(child)
  }
  const first = marks[0]
  const last = marks.length > 1 ? marks[marks.length - 1] : undefined
  const changes: ChangeSpec[] =
    first && last
      ? [
          { from: first.from, to: first.to },
          { from: last.from, to: last.to }
        ]
      : [
          { from: node.from, to: node.from + len },
          { from: node.to - len, to: node.to }
        ]
  const mapped = state.changes(changes)
  return {
    changes,
    range: EditorSelection.range(mapped.mapPos(range.anchor), mapped.mapPos(range.head))
  }
}

function wrap(from: number, to: number, marker: string): RangeEdit {
  return {
    changes: [
      { from, insert: marker },
      { from: to, insert: marker }
    ],
    range: EditorSelection.range(from + marker.length, to + marker.length)
  }
}

export function toggleInlineRange(
  state: EditorState,
  tree: Tree,
  range: SelectionRange,
  format: InlineFormat
): RangeEdit {
  const len = format.marker.length
  const inside = enclosingFormat(tree, range.from, range.to, format.node)
  if (inside) return unwrap(state, range, inside, len)
  if (!range.empty) return wrap(range.from, range.to, format.marker)
  const pos = range.head
  /* Caret between an empty pair it just inserted: take the pair back out. */
  if (
    state.sliceDoc(pos - len, pos) === format.marker &&
    state.sliceDoc(pos, pos + len) === format.marker
  ) {
    return { changes: [{ from: pos - len, to: pos + len }], range: EditorSelection.cursor(pos - len) }
  }
  const word = state.wordAt(pos)
  if (word) return wrap(word.from, word.to, format.marker)
  return {
    changes: [{ from: pos, insert: format.marker + format.marker }],
    range: EditorSelection.cursor(pos + len)
  }
}

function toggleInline(format: InlineFormat): StateCommand {
  return ({ state, dispatch }) => {
    const tree = syntaxTree(state)
    const spec = state.changeByRange((range) => toggleInlineRange(state, tree, range, format))
    dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input' }))
    return true
  }
}

export const toggleBold = toggleInline(strong)
export const toggleItalic = toggleInline(emphasis)
export const toggleStrikethrough = toggleInline(strikethrough)
export const toggleInlineCode = toggleInline(inlineCode)

/* [selection]() with the caret in the URL parens; empty selection leaves the
 * caret in the brackets instead. Insert-only — unlinking is an edit, not a
 * toggle. */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const spec = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    return {
      changes: { from: range.from, to: range.to, insert: `[${text}]()` },
      range: EditorSelection.cursor(range.empty ? range.from + 1 : range.from + text.length + 3)
    }
  })
  dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input' }))
  return true
}

/* Fallback bindings: the menu accelerators normally consume these first —
 * whichever fires first wins, the other never sees the event. */
export const formatKeymap = [
  { key: 'Mod-b', run: toggleBold },
  { key: 'Mod-i', run: toggleItalic },
  { key: 'Mod-Shift-x', run: toggleStrikethrough },
  { key: 'Mod-Shift-c', run: toggleInlineCode },
  { key: 'Mod-Shift-k', run: insertLink }
]
