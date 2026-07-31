import { markdownLanguage } from '@codemirror/lang-markdown'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collectConstructSpecs, type DecoSpec } from './index'

function specs(doc: string): DecoSpec[] {
  return collectConstructSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    [{ from: 0, to: doc.length }]
  )
}

describe('construct 5: links', () => {
  it('inline link: brackets, parens, and URL all recede; text does not', () => {
    const doc = '[text](http://x.y)'
    const all = specs(doc)
    const marks = all.filter((s) => s.kind === 'mark' && s.class?.includes('fs-mark'))
    expect(marks.map((s) => [s.from, s.to])).toEqual([
      [0, 1],
      [5, 6],
      [6, 7],
      [7, 17],
      [17, 18]
    ])
    const url = all.find((s) => s.class?.includes('fs-url'))
    expect(url).toMatchObject({ from: 7, to: 17 })
    // 'text' (1..5) carries no receding class
    expect(all.some((s) => s.kind === 'mark' && (s.from ?? 0) >= 1 && (s.to ?? 0) <= 5)).toBe(
      false
    )
  })

  it('bare autolinks keep their URL readable — no recede on the URL span', () => {
    const doc = 'go to <https://a.example> now'
    const all = specs(doc)
    expect(all.some((s) => s.class?.includes('fs-url'))).toBe(false)
  })
})
