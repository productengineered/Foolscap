import { syntaxTree } from '@codemirror/language'
import {
  Facet,
  RangeSetBuilder,
  type EditorSelection,
  type Extension,
  type Text
} from '@codemirror/state'
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from '@codemirror/view'
import type { Tree } from '@lezer/common'
import { collectFence, ensureFenceTokens, fenceTokensReady } from './code-fence'
import { glyphForPos } from './gutter'
import { collectHeadings } from './headings'
import { collectImages } from './images'
import { collectLinks, linkClickHandler } from './links'
import { collectListIndents, collectListBullets } from './lists'
import { collectMarks, selectionTouches } from './marks'
import { collectNods } from './nod'
import { collectQuote } from './quote'
import { collectRules } from './rules'
import { collectTable } from './tables'
import { specWidget, type WidgetDesc } from './widgets'

/* THE CORE (ULTRAPLAN §3.1): live preview is decorations over plain markdown
 * text, nothing else. Two ViewPlugins with a deliberate split:
 *
 *  - constructPlugin: content-derived decorations (marks, headings, quotes,
 *    list indents, link/url recede, fence fills and Shiki tokens). Rebuilt on
 *    doc/viewport/parse changes and on async fence-token arrival — NOT on
 *    selection changes.
 *  - activePlugin: selection-derived state (.fs-active lines, gutter glyph,
 *    and the constructs that swap presentation on cursor adjacency: bullets,
 *    images, horizontal rules). Rebuilt on selection changes too.
 *
 * The split is what makes the 140ms recede/reveal transition possible: when
 * the cursor moves, only line classes change on existing DOM; the mark spans
 * survive untouched, so their CSS transition actually animates. */

/* Directory of the open document, for resolving relative image paths. */
export const docDirFacet = Facet.define<string | null, string | null>({
  combine: (values) => values[0] ?? null
})

export interface DecoSpec {
  kind: 'mark' | 'line' | 'replace'
  from?: number
  to?: number
  at?: number
  class?: string
  /* Inline style for Shiki token colors — values are var() references. */
  style?: string
  attrs?: Record<string, string>
  widget?: WidgetDesc
}

export interface CollectCtx {
  doc: Text
  /* Visible-range clamp for multi-line constructs. */
  from: number
  to: number
  push(spec: DecoSpec): void
}

export interface ActiveCtx extends CollectCtx {
  selection: EditorSelection
  docDir: string | null
}

type VisibleRange = { from: number; to: number }

/* Pure collector for content-derived specs — exported for tests. */
export function collectConstructSpecs(
  tree: Tree,
  doc: Text,
  visible: readonly VisibleRange[]
): DecoSpec[] {
  const specs: DecoSpec[] = []
  for (const range of visible) {
    const ctx: CollectCtx = {
      doc,
      from: range.from,
      to: range.to,
      push: (spec) => specs.push(spec)
    }
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        collectMarks(node, ctx)
        collectHeadings(node, ctx)
        collectQuote(node, ctx)
        collectListIndents(node, ctx)
        collectLinks(node, ctx)
        collectFence(node, ctx)
        collectTable(node, ctx)
      }
    })
  }
  return specs
}

/* Pure collector for selection-derived specs — exported for tests. */
export function collectActiveSpecs(
  tree: Tree,
  doc: Text,
  selection: EditorSelection,
  visible: readonly VisibleRange[],
  docDir: string | null = null
): DecoSpec[] {
  const specs: DecoSpec[] = []
  const seen = new Set<number>()
  for (const range of visible) {
    const last = doc.lineAt(range.to).number
    for (let n = doc.lineAt(range.from).number; n <= last; n++) {
      const line = doc.line(n)
      if (!seen.has(line.from) && selectionTouches(selection, line.from, line.to)) {
        seen.add(line.from)
        specs.push({ kind: 'line', at: line.from, class: 'fs-active' })
      }
    }
    const ctx: ActiveCtx = {
      doc,
      from: range.from,
      to: range.to,
      selection,
      docDir,
      push: (spec) => specs.push(spec)
    }
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        collectListBullets(node, ctx)
        collectImages(node, ctx)
        collectRules(node, ctx)
      }
    })
    collectNods(tree, ctx)
  }
  const block = glyphForPos(tree, doc, selection.main.head)
  if (block) {
    specs.push({ kind: 'line', at: block.lineFrom, attrs: { 'data-fs-glyph': block.glyph } })
  }
  return specs
}

function specPos(spec: DecoSpec): number {
  return spec.kind === 'line' ? (spec.at ?? 0) : (spec.from ?? 0)
}

const KIND_RANK = { line: 0, mark: 1, replace: 2 } as const

function toDecorations(specs: DecoSpec[]): DecorationSet {
  // RangeSetBuilder needs sorted input; line decorations sort before marks
  // and replacements at the same position.
  specs.sort(
    (a, b) => specPos(a) - specPos(b) || KIND_RANK[a.kind] - KIND_RANK[b.kind]
  )
  const builder = new RangeSetBuilder<Decoration>()
  for (const spec of specs) {
    if (spec.kind === 'line') {
      const at = spec.at ?? 0
      builder.add(
        at,
        at,
        Decoration.line({
          ...(spec.class ? { class: spec.class } : {}),
          ...(spec.attrs ? { attributes: spec.attrs } : {})
        })
      )
    } else if (spec.kind === 'replace') {
      const widget = spec.widget ? specWidget(spec.widget) : undefined
      builder.add(spec.from ?? 0, spec.to ?? 0, Decoration.replace({ widget }))
    } else {
      builder.add(
        spec.from ?? 0,
        spec.to ?? 0,
        Decoration.mark({
          ...(spec.class ? { class: spec.class } : {}),
          ...(spec.style ? { attributes: { style: spec.style } } : {})
        })
      )
    }
  }
  return builder.finish()
}

function hasFenceTokens(update: ViewUpdate): boolean {
  return update.transactions.some((tr) => tr.effects.some((e) => e.is(fenceTokensReady)))
}

const constructPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        hasFenceTokens(update) ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = this.build(update.view)
      }
    }

    private build(view: EditorView): DecorationSet {
      ensureFenceTokens(view)
      return toDecorations(
        collectConstructSpecs(syntaxTree(view.state), view.state.doc, view.visibleRanges)
      )
    }
  },
  { decorations: (v) => v.decorations }
)

const activePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = this.build(view)
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.state.facet(docDirFacet) !== update.startState.facet(docDirFacet) ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = this.build(update.view)
      }
    }

    private build(view: EditorView): DecorationSet {
      return toDecorations(
        collectActiveSpecs(
          syntaxTree(view.state),
          view.state.doc,
          view.state.selection,
          view.visibleRanges,
          view.state.facet(docDirFacet)
        )
      )
    }
  },
  { decorations: (v) => v.decorations }
)

export function livePreview(): Extension {
  return [constructPlugin, activePlugin, linkClickHandler()]
}
