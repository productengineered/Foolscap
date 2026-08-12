import type { SyntaxNodeRef } from '@lezer/common'
import type { ActiveCtx } from './index'
import { selectionTouches } from './marks'

/* GFM task lists: `- [ ]` and `- [x]` markers render as real checkboxes.
 * Clicking one writes the three characters back the other way — the buffer
 * is the only state there is, so toggling is a plain text edit and the
 * rebuild that follows re-renders the new truth. Cursor adjacency reveals
 * the literal marker, the same contract as every other mark. */
export function collectTask(node: SyntaxNodeRef, ctx: ActiveCtx): void {
  if (node.name !== 'TaskMarker') return
  if (selectionTouches(ctx.selection, node.from, node.to)) return
  const marker = ctx.doc.sliceString(node.from, node.to)
  ctx.push({
    kind: 'replace',
    from: node.from,
    to: node.to,
    widget: { type: 'task', checked: /x/i.test(marker), at: node.from }
  })
}
