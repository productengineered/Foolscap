import type { SyntaxNodeRef } from '@lezer/common'
import type { ActiveCtx } from './index'
import { selectionTouches } from './marks'

/* Construct 7: images render as inline widgets when the cursor isn't inside
 * the construct; put the cursor in and the raw ![alt](path) comes back. This
 * is the adjacency predicate's real use — construct extent, not line. A
 * broken path renders a labeled fallback state instead of a layout ghost. */

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/* Resolve an image target against the document's directory. Returns null
 * when there's no way to resolve it (relative path, unsaved document). */
export function resolveImageSrc(target: string, docDir: string | null): string | null {
  if (target === '') return null
  if (SCHEME.test(target)) return target
  if (target.startsWith('/')) return `file://${encodeURI(target)}`
  if (!docDir) return null
  return `file://${encodeURI(`${docDir}/${target}`)}`
}

export function collectImages(node: SyntaxNodeRef, ctx: ActiveCtx): void {
  if (node.name !== 'Image') return
  if (selectionTouches(ctx.selection, node.from, node.to)) return
  const url = node.node.getChild('URL')
  const target = url ? ctx.doc.sliceString(url.from, url.to) : ''
  // Alt text sits between the ![ and ] marks.
  const marks = node.node.getChildren('LinkMark')
  const altFrom = marks[0]?.to ?? node.from
  const altTo = marks[1]?.from ?? altFrom
  ctx.push({
    kind: 'replace',
    from: node.from,
    to: node.to,
    widget: {
      type: 'image',
      src: resolveImageSrc(target, ctx.docDir),
      alt: ctx.doc.sliceString(altFrom, altTo)
    }
  })
}
