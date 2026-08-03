import { countColumn } from '@codemirror/state'
import type { SyntaxNodeRef } from '@lezer/common'
import type { ActiveCtx, CollectCtx } from './index'
import { selectionTouches } from './marks'

/* Construct 4: lists. Two halves:
 *
 * Hanging indent (content-derived): every line of a list item is padded to
 * the item's content column and the first line is pulled back over the
 * marker, so soft-wrapped text aligns under the text, not under the bullet.
 * The ch values are derived from the document text (marker width + leading
 * indent), not design values, which is why they are computed here rather
 * than living in tokens.css.
 *
 * Bullet swap (selection-derived): off the active line, the raw `-`/`*`/`+`
 * marker is replaced by a real typographic bullet. Ordered-list numbers are
 * already real content and are never replaced, just quieted. */

function isBulletMark(node: SyntaxNodeRef): boolean {
  if (node.name !== 'ListMark') return false
  const parent = node.node.parent
  return parent?.name === 'ListItem' && parent.parent?.name === 'BulletList'
}

function isOrderedMark(node: SyntaxNodeRef): boolean {
  if (node.name !== 'ListMark') return false
  const parent = node.node.parent
  return parent?.name === 'ListItem' && parent.parent?.name === 'OrderedList'
}

export function collectListIndents(node: SyntaxNodeRef, ctx: CollectCtx): void {
  if (node.name !== 'ListMark') return
  const line = ctx.doc.lineAt(node.from)
  // Content column: indent + marker + the marker's actual trailing gap —
  // CommonMark allows 1-4 spaces or a tab, not always one space — counted
  // in tab-aware columns so tab-indented items align too.
  const markerEnd = node.to - line.from
  const rest = line.text.slice(markerEnd)
  const gap = rest.length - rest.replace(/^[ \t]+/, '').length
  const width =
    gap === 0
      ? countColumn(line.text, ctx.tabSize, markerEnd) + 1
      : countColumn(line.text, ctx.tabSize, markerEnd + gap)
  ctx.push({
    kind: 'line',
    at: line.from,
    attrs: { style: `padding-left: ${width}ch; text-indent: ${-width}ch` }
  })
  if (isOrderedMark(node) || isBulletMark(node)) {
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-list-mark' })
  }
}

export function collectListBullets(node: SyntaxNodeRef, ctx: ActiveCtx): void {
  if (!isBulletMark(node)) return
  const line = ctx.doc.lineAt(node.from)
  if (selectionTouches(ctx.selection, line.from, line.to)) return
  ctx.push({
    kind: 'replace',
    from: node.from,
    to: node.to,
    widget: { type: 'bullet' }
  })
}
