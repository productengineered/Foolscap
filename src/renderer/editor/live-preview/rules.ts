import type { SyntaxNodeRef } from '@lezer/common'
import type { ActiveCtx } from './index'
import { selectionTouches } from './marks'

/* Construct 8: a horizontal rule renders as an actual hairline when the
 * cursor is elsewhere; on the active line the raw --- returns for editing.
 *
 * Footnotes, the other half of the plan's item 8, are deliberately absent:
 * the lezer markdown parser has no footnote syntax, so the editor treats
 * [^1] as plain text. The remark export pipeline (Phase 3) will render them;
 * an editor-side extension can follow if they earn their keep. */
export function collectRules(node: SyntaxNodeRef, ctx: ActiveCtx): void {
  if (node.name !== 'HorizontalRule') return
  const line = ctx.doc.lineAt(node.from)
  if (selectionTouches(ctx.selection, line.from, line.to)) return
  ctx.push({ kind: 'replace', from: node.from, to: node.to, widget: { type: 'hr' } })
}
