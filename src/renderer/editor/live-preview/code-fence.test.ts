import { markdownLanguage } from '@codemirror/lang-markdown'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { fenceLang, fenceTestHooks, keyFor } from './code-fence'
import { collectConstructSpecs, type DecoSpec } from './index'

function specs(doc: string, ranges?: { from: number; to: number }[]): DecoSpec[] {
  return collectConstructSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    ranges ?? [{ from: 0, to: doc.length }]
  )
}

describe('construct 6: code fences', () => {
  it('every fence line gets the sunk mono fill; delimiters and info recede', () => {
    const doc = '```js\nconst x = 1\n```'
    const all = specs(doc)
    expect(
      all.filter((s) => s.kind === 'line' && s.class === 'fs-fence').map((s) => s.at)
    ).toEqual([0, 6, 18])
    // ``` delimiters via the shared mark set
    expect(
      all.filter((s) => s.kind === 'mark' && s.class === 'fs-mark').map((s) => [s.from, s.to])
    ).toEqual([
      [0, 3],
      [18, 21]
    ])
    expect(all.find((s) => s.class === 'fs-code-info')).toMatchObject({ from: 3, to: 5 })
  })

  it('emits cached Shiki token colors as var() styles', () => {
    const code = 'const x = 1'
    fenceTestHooks.cache.set(keyFor('js', code), [
      { start: 0, end: 5, color: 'var(--shiki-token-keyword)' }
    ])
    const all = specs('```js\nconst x = 1\n```')
    const styled = all.filter((s) => s.kind === 'mark' && s.style)
    expect(styled).toEqual([
      { kind: 'mark', from: 6, to: 11, style: 'color: var(--shiki-token-keyword)' }
    ])
    fenceTestHooks.cache.clear()
  })

  it('tokenizes real javascript through Shiki with absolute offsets across lines', async () => {
    const code = 'const a = 1\nconst b = 2'
    const ok = await fenceTestHooks.tokenize('js', code, keyFor('js', code))
    expect(ok).toBe(true)
    const spans = fenceTestHooks.cache.get(keyFor('js', code))
    expect(spans).toBeDefined()
    expect(spans!.length).toBeGreaterThan(0)
    for (const span of spans!) {
      expect(span.color).toMatch(/^var\(--shiki-/)
      expect(code.slice(span.start, span.end)).not.toContain('\n')
    }
    // tokens from the second line prove offsets are absolute
    expect(spans!.some((s) => s.start >= 12)).toBe(true)
    fenceTestHooks.cache.clear()
  })

  it('info-string metadata does not defeat the language lookup', () => {
    expect(fenceLang('js {1-3}')).toBe('js')
    expect(fenceLang('ts twoslash')).toBe('ts')
    expect(fenceLang('  PYTHON  ')).toBe('python')
    expect(fenceLang('')).toBe('')
  })

  it('fences with metadata still match cached tokens', () => {
    const code = 'const x = 1'
    fenceTestHooks.cache.set(keyFor('js', code), [
      { start: 0, end: 5, color: 'var(--shiki-token-keyword)' }
    ])
    const all = specs('```js {1-3}\nconst x = 1\n```')
    const styled = all.filter((s) => s.kind === 'mark' && s.style)
    expect(styled).toEqual([
      { kind: 'mark', from: 12, to: 17, style: 'color: var(--shiki-token-keyword)' }
    ])
    fenceTestHooks.cache.clear()
  })

  it('token marks are clamped to the visible range', () => {
    const doc = '```js\nconst x = 1\nconst y = 2\n```'
    const content = 'const x = 1\nconst y = 2'
    fenceTestHooks.cache.set(keyFor('js', content), [
      { start: 0, end: 5, color: 'var(--shiki-token-keyword)' },
      { start: 12, end: 17, color: 'var(--shiki-token-keyword)' }
    ])
    // Only the fence's first code line is visible: the second span is offscreen.
    const styled = specs(doc, [{ from: 0, to: 17 }]).filter((s) => s.kind === 'mark' && s.style)
    expect(styled.map((s) => [s.from, s.to])).toEqual([[6, 11]])
    fenceTestHooks.cache.clear()
  })

  it('a fence overlapping two visible ranges emits each span once, not twice', () => {
    const doc = '```js\nconst x = 1\nconst y = 2\n```'
    const content = 'const x = 1\nconst y = 2'
    fenceTestHooks.cache.set(keyFor('js', content), [
      { start: 0, end: 5, color: 'var(--shiki-token-keyword)' },
      { start: 12, end: 17, color: 'var(--shiki-token-keyword)' }
    ])
    const styled = specs(doc, [
      { from: 0, to: 17 },
      { from: 18, to: doc.length }
    ]).filter((s) => s.kind === 'mark' && s.style)
    expect(styled.map((s) => [s.from, s.to])).toEqual([
      [6, 11],
      [18, 23]
    ])
    fenceTestHooks.cache.clear()
  })

  it('unknown languages are skipped without error', async () => {
    const ok = await fenceTestHooks.tokenize('nolang', 'x', 'nolang x')
    expect(ok).toBe(false)
  })

  it('the cache evicts its oldest entry instead of clearing wholesale', () => {
    fenceTestHooks.cache.clear()
    for (let i = 0; i <= 100; i++) fenceTestHooks.cacheSet(`k${i}`, [])
    expect(fenceTestHooks.cache.size).toBe(100)
    expect(fenceTestHooks.cache.has('k0')).toBe(false)
    expect(fenceTestHooks.cache.has('k1')).toBe(true)
    expect(fenceTestHooks.cache.has('k100')).toBe(true)
    fenceTestHooks.cache.clear()
  })

  it('a cache hit refreshes recency, so hot fences survive eviction', () => {
    fenceTestHooks.cache.clear()
    for (let i = 0; i < 100; i++) fenceTestHooks.cacheSet(`k${i}`, [])
    fenceTestHooks.cacheGet('k0')
    fenceTestHooks.cacheSet('k100', [])
    expect(fenceTestHooks.cache.has('k0')).toBe(true)
    expect(fenceTestHooks.cache.has('k1')).toBe(false)
    fenceTestHooks.cache.clear()
  })

  it('an edited fence keeps painting its last spans until retokenized', () => {
    const before = 'const x = 1'
    fenceTestHooks.cache.set(keyFor('js', before), [
      { start: 0, end: 5, color: 'var(--shiki-token-keyword)' }
    ])
    // A hit records the spans against the fence's position…
    specs('```js\nconst x = 1\n```')
    fenceTestHooks.cache.clear()
    // …so the very next keystroke (new content, cache miss) still paints.
    const styled = specs('```js\nconst xx = 1\n```').filter((s) => s.kind === 'mark' && s.style)
    expect(styled).toEqual([
      { kind: 'mark', from: 6, to: 11, style: 'color: var(--shiki-token-keyword)' }
    ])
    fenceTestHooks.stale.clear()
  })

  it('stale spans are clamped when the fence content shrinks', () => {
    const before = 'const x = 1'
    fenceTestHooks.cache.set(keyFor('js', before), [
      { start: 0, end: 11, color: 'var(--shiki-token-keyword)' }
    ])
    specs('```js\nconst x = 1\n```')
    fenceTestHooks.cache.clear()
    const styled = specs('```js\nab\n```').filter((s) => s.kind === 'mark' && s.style)
    // Span end 11 would overrun the two-character content; it clamps to it.
    expect(styled.map((s) => [s.from, s.to])).toEqual([[6, 8]])
    fenceTestHooks.stale.clear()
  })
})
