import type { Text } from '@codemirror/state'
import type { SyntaxNode, Tree } from '@lezer/common'

export interface BlockGlyph {
  glyph: string
  /* Start of the block's first line — the glyph aligns to its first baseline. */
  lineFrom: number
}

const HEADING = /^(ATXHeading[1-6]|SetextHeading[12])$/

function glyphFor(node: SyntaxNode): string | null {
  if (HEADING.test(node.name)) return '#'
  if (node.name === 'Blockquote') return '>'
  if (node.name === 'FencedCode' || node.name === 'CodeBlock') return '~'
  if (node.name === 'ListItem') {
    return node.parent?.name === 'OrderedList' ? '1.' : '•'
  }
  return null
}

function walkUp(start: SyntaxNode, doc: Text): BlockGlyph | null {
  for (let node: SyntaxNode | null = start; node; node = node.parent) {
    const glyph = glyphFor(node)
    if (glyph) return { glyph, lineFrom: doc.lineAt(node.from).from }
  }
  return null
}

/* Construct 3b: the block-type glyph shown in the hairline gutter (§4.3).
 * Resolves the innermost enclosing block at pos — a list item inside a
 * blockquote reads as a list item. Plain paragraphs get no glyph. The -1
 * side biases toward the character before the caret, which keeps the glyph
 * stable at end-of-line while typing; the +1 fallback covers a caret sitting
 * exactly at a block's start (position 0 included), where the backward
 * resolve lands outside the block entirely. */
export function glyphForPos(tree: Tree, doc: Text, pos: number): BlockGlyph | null {
  return (
    walkUp(tree.resolveInner(pos, -1), doc) ?? walkUp(tree.resolveInner(pos, 1), doc)
  )
}
