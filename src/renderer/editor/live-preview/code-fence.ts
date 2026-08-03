import { syntaxTree } from '@codemirror/language'
import { StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { SyntaxNodeRef } from '@lezer/common'
import type { BundledLanguage, LanguageInput } from 'shiki'
import { getHighlighter, shikiTheme } from '../../../shared/markdown'
import type { CollectCtx } from './index'

/* Construct 6: fenced code via Shiki (ULTRAPLAN §3: real TextMate grammars,
 * themeable from the same tokens). The theme is css-variables — every token
 * color is a var(--shiki-*) reference defined in tokens.css from the ledger
 * palette, so Light/Dark/custom themes restyle code for free.
 *
 * Tokenization is async (grammar loading), so the flow is:
 * collectFence reads a synchronous cache; ensureFenceTokens schedules
 * tokenization for visible fences that miss, and dispatches fenceTokensReady
 * when results land, which re-runs the construct build. Cache keys are
 * lang + content, so edits inside a fence retokenize and everything else
 * stays cached. */

export const fenceTokensReady = StateEffect.define<null>()

interface TokenSpan {
  /* Offsets relative to the CodeText node start. */
  start: number
  end: number
  color: string
}

export function keyFor(lang: string, code: string): string {
  return `${lang}\u0000${code}`
}

/* The language is the first word of the info string; the rest is metadata
 * (```js {1-3}, ```ts twoslash) that must not reach the grammar lookup. */
export function fenceLang(info: string): string {
  return info.trim().split(/\s/, 1)[0]?.toLowerCase() ?? ''
}

const cache = new Map<string, TokenSpan[]>()
const pending = new Set<string>()
const unknownLangs = new Set<string>()

/* The highlighter itself lives in shared/markdown.ts — one instance per
 * process, shared with preview and exports, so a grammar loaded for the
 * editor is already warm when the same document renders as HTML. */

async function tokenize(lang: string, code: string, key: string): Promise<boolean> {
  const { bundledLanguages } = await import('shiki')
  const grammar = (bundledLanguages as Record<string, LanguageInput | undefined>)[lang]
  if (!grammar) {
    unknownLangs.add(lang)
    return false
  }
  const highlighter = await getHighlighter()
  if (!highlighter.getLoadedLanguages().includes(lang)) {
    await highlighter.loadLanguage(grammar)
  }
  // The bundledLanguages lookup above proved `lang` is a real language id.
  const lines = highlighter.codeToTokensBase(code, {
    lang: lang as BundledLanguage,
    theme: shikiTheme
  })
  const spans: TokenSpan[] = []
  let lineStart = 0
  for (const line of lines) {
    let col = 0
    for (const token of line) {
      const start = token.offset ?? lineStart + col
      if (token.color) {
        spans.push({ start, end: start + token.content.length, color: token.color })
      }
      col += token.content.length
    }
    const lineLength = line.reduce((n, t) => n + t.content.length, 0)
    lineStart += lineLength + 1 // newline
  }
  if (cache.size > 100) cache.clear()
  cache.set(key, spans)
  return true
}

export function collectFence(node: SyntaxNodeRef, ctx: CollectCtx): void {
  if (node.name === 'CodeInfo') {
    ctx.push({ kind: 'mark', from: node.from, to: node.to, class: 'fs-code-info' })
    return
  }
  if (node.name !== 'FencedCode') return

  // Fill + mono for every fence line, clamped to the visible range.
  const first = ctx.doc.lineAt(Math.max(node.from, ctx.from)).number
  const last = ctx.doc.lineAt(Math.min(node.to, ctx.to)).number
  for (let n = first; n <= last; n++) {
    ctx.push({ kind: 'line', at: ctx.doc.line(n).from, class: 'fs-fence' })
  }

  // Shiki tokens from the cache, if they've arrived.
  const info = node.node.getChild('CodeInfo')
  const code = node.node.getChild('CodeText')
  if (!info || !code) return
  const lang = fenceLang(ctx.doc.sliceString(info.from, info.to))
  const content = ctx.doc.sliceString(code.from, code.to)
  const spans = cache.get(keyFor(lang, content))
  if (!spans) return
  // Clamped like the line decos above: a giant fence with one visible line
  // must not rebuild thousands of offscreen marks (and a fence overlapping
  // two visible ranges is entered once per range — unclamped, every span
  // would be pushed twice).
  for (const span of spans) {
    const from = Math.max(code.from + span.start, ctx.from)
    const to = Math.min(code.from + span.end, ctx.to)
    if (from >= to) {
      if (code.from + span.start >= ctx.to) break // spans are start-sorted
      continue
    }
    ctx.push({ kind: 'mark', from, to, style: `color: ${span.color}` })
  }
}

/* Side-effect half: request tokenization for visible fences not yet cached.
 * Fire-and-forget; a fenceTokensReady dispatch re-runs the collector. */
export function ensureFenceTokens(view: EditorView): void {
  const tree = syntaxTree(view.state)
  const doc = view.state.doc
  const wanted: { lang: string; code: string; key: string }[] = []
  for (const range of view.visibleRanges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return
        const info = node.node.getChild('CodeInfo')
        const code = node.node.getChild('CodeText')
        if (!info || !code) return
        const lang = fenceLang(doc.sliceString(info.from, info.to))
        const content = doc.sliceString(code.from, code.to)
        const key = keyFor(lang, content)
        if (cache.has(key) || pending.has(key) || unknownLangs.has(lang)) return
        wanted.push({ lang, code: content, key })
      }
    })
  }
  for (const { lang, code, key } of wanted) {
    pending.add(key)
    void tokenize(lang, code, key)
      .then((hit) => {
        if (hit) view.dispatch({ effects: fenceTokensReady.of(null) })
      })
      .catch(() => undefined)
      .finally(() => pending.delete(key))
  }
}

/* Test hooks — the async path is exercised via these, the pure path via
 * collectFence with a seeded cache. */
export const fenceTestHooks = { cache, tokenize }
