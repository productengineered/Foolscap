import type { SyntaxNode, Tree } from '@lezer/common'
import type { ActiveCtx } from './index'
import { selectionTouches } from './marks'

/* An easter egg, and nothing more: `:yes-yes:` renders as a small nodding
 * face. Same cursor-adjacency contract as images — put the cursor in it and
 * the literal text comes back — and the same one rule holds: the buffer is
 * still plain markdown, so the file on disk keeps the eight characters you
 * typed. Exports and preview show them too; the nod lives in the editor. */

/* 15x15 two-frame GIF, inline so it needs no asset pipeline and no
 * network — the renderer CSP already allows data: images. */
export const NOD_SRC =
  'data:image/gif;base64,R0lGODlhDwAPAKIGAAAAAP//AP/KAP/YAP/lAP/xAP///wAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQFEgAGACwAAAAADwAPAAADTWiq0L3QtFACEQ+CWkMYArYAXkkRAwgw3eQ1Ilm6QaNuplmgmJxTuxuhU+LwYAOCYwlbAQTJoZSAGjih1GxVxICmvqGV5hkKiyOSZSQBACH5BAUSAAYALAQABAAKAAcAAAMUaBHWMy1KCUCsM2u5SiggAVVkKSQAOw=='

const TOKEN = /:yes-yes:/g

/* Code is code: a fence or an inline span keeps its text literal. */
function inCode(tree: Tree, pos: number): boolean {
  let node: SyntaxNode | null = tree.resolveInner(pos, 1)
  while (node) {
    if (node.name.includes('Code')) return true
    node = node.parent
  }
  return false
}

export function collectNods(tree: Tree, ctx: ActiveCtx): void {
  const text = ctx.doc.sliceString(ctx.from, ctx.to)
  for (const match of text.matchAll(TOKEN)) {
    const from = ctx.from + (match.index ?? 0)
    const to = from + match[0].length
    if (selectionTouches(ctx.selection, from, to)) continue
    if (inCode(tree, from)) continue
    ctx.push({ kind: 'replace', from, to, widget: { type: 'nod' } })
  }
}
