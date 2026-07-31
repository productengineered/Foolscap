import type { SyntaxNodeRef } from '@lezer/common'
import type { CollectCtx } from './index'

/* Phase 4: tables render in the mono cut so the normalizer's space-padding
 * becomes real column alignment. Pipes and the delimiter row recede via
 * TableDelimiter (the grammar marks both), the header row reads semibold.
 * The buffer stays plain pipe-table text throughout — alignment lives in
 * the text itself, which is exactly what exports and other editors see. */
export function collectTable(node: SyntaxNodeRef, ctx: CollectCtx): void {
  if (node.name === 'TableDelimiter') {
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-mark' })
    return
  }
  if (node.name !== 'Table') return
  const first = ctx.doc.lineAt(Math.max(node.from, ctx.from))
  const last = ctx.doc.lineAt(Math.min(node.to, ctx.to)).number
  const headerLine = ctx.doc.lineAt(node.from).from
  for (let n = first.number; n <= last; n++) {
    const line = ctx.doc.line(n)
    ctx.push({
      kind: 'line',
      at: line.from,
      class: line.from === headerLine ? 'fs-table fs-table-header' : 'fs-table'
    })
  }
}
