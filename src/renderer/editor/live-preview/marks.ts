import type { EditorSelection } from '@codemirror/state'
import type { SyntaxNodeRef } from '@lezer/common'
import type { CollectCtx } from './index'

/* THE cursor-adjacency predicate (CLAUDE.md: one pure function, never
 * inlined elsewhere). True when any selection range touches [from, to],
 * inclusive at both ends — a cursor sitting exactly on a construct boundary
 * counts as touching it. Handles multi-cursor and non-empty ranges because
 * it checks every range, and nested constructs because callers pass whatever
 * extent they mean (inner and outer both simply touch or don't). */
export function selectionTouches(
  selection: EditorSelection,
  from: number,
  to: number
): boolean {
  return selection.ranges.some((range) => range.from <= to && range.to >= from)
}

/* Construct 1 (and the mark tokens of later constructs): syntax marks recede
 * to --ink-ghost, they never vanish. The reveal on the active line is pure
 * CSS (`.fs-active .fs-mark`), which is what lets the 140ms transition run —
 * these decorations are selection-independent, so CM never rebuilds the
 * spans when the cursor moves, only the line class changes. */
const MARK_NODES = new Set([
  'EmphasisMark', // ** * _ __
  'CodeMark', // `
  'StrikethroughMark', // ~~
  'HeaderMark', // # and setext underlines
  'QuoteMark' // >
])

export function collectMarks(node: SyntaxNodeRef, ctx: CollectCtx): void {
  if (MARK_NODES.has(node.name)) {
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-mark' })
  } else if (node.name === 'InlineCode') {
    // Whole node including backticks, so the sunk fill is one continuous pill.
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-code' })
  }
}
