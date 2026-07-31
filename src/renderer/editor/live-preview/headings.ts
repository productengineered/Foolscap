import type { SyntaxNodeRef } from '@lezer/common'
import type { CollectCtx } from './index'

const ATX = /^ATXHeading([1-6])$/
const SETEXT = /^SetextHeading([12])$/

/* Construct 2: headings are line decorations — Fraunces with opsz doing the
 * display-cut work (font-optical-sizing is automatic once the size changes),
 * WONK 1 at h1/h2, WONK 0 below. The # marks themselves recede via marks.ts
 * (HeaderMark), inheriting the heading's size. Styling is content-dependent,
 * never cursor-dependent, so heading lines never jump as the caret moves. */
export function collectHeadings(node: SyntaxNodeRef, ctx: CollectCtx): void {
  const level = ATX.exec(node.name)?.[1] ?? SETEXT.exec(node.name)?.[1]
  if (!level) return
  // For setext headings this is the content line; the underline line's
  // HeaderMark ghosts separately.
  const line = ctx.doc.lineAt(node.from)
  ctx.push({ kind: 'line', at: line.from, class: `fs-heading fs-h${level}` })
}
