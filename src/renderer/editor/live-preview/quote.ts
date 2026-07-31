import type { SyntaxNodeRef } from '@lezer/common'
import type { CollectCtx } from './index'

/* Construct 3a: blockquote lines get the sunk paper fill. Contiguous lines
 * each carry the class; the fills abut seamlessly. The > marks recede via
 * marks.ts (QuoteMark). */
export function collectQuote(node: SyntaxNodeRef, ctx: CollectCtx): void {
  if (node.name !== 'Blockquote') return
  const first = ctx.doc.lineAt(Math.max(node.from, ctx.from)).number
  const last = ctx.doc.lineAt(Math.min(node.to, ctx.to)).number
  for (let n = first; n <= last; n++) {
    ctx.push({ kind: 'line', at: ctx.doc.line(n).from, class: 'fs-quote' })
  }
}
