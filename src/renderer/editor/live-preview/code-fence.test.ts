import { markdownLanguage } from '@codemirror/lang-markdown'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { fenceTestHooks, keyFor } from './code-fence'
import { collectConstructSpecs, type DecoSpec } from './index'

function specs(doc: string): DecoSpec[] {
  return collectConstructSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    [{ from: 0, to: doc.length }]
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

  it('unknown languages are skipped without error', async () => {
    const ok = await fenceTestHooks.tokenize('nolang', 'x', 'nolang x')
    expect(ok).toBe(false)
  })
})
