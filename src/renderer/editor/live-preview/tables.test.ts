import { markdownLanguage } from '@codemirror/lang-markdown'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collectConstructSpecs, type DecoSpec } from './index'

const DOC = '| a | b |\n| --- | :-: |\n| 1 | 2 |'

function specs(doc: string): DecoSpec[] {
  return collectConstructSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    [{ from: 0, to: doc.length }]
  )
}

describe('construct: tables', () => {
  it('every table line goes mono; the header line is marked', () => {
    const lines = specs(DOC).filter((s) => s.kind === 'line' && s.class?.includes('fs-table'))
    expect(lines.map((s) => [s.at, s.class])).toEqual([
      [0, 'fs-table fs-table-header'],
      [10, 'fs-table'],
      [24, 'fs-table']
    ])
  })

  it('pipes and the whole delimiter row recede', () => {
    const marks = specs(DOC)
      .filter((s) => s.kind === 'mark' && s.class === 'fs-mark')
      .map((s) => [s.from, s.to])
    // header pipes at 0,4,8; the full delimiter row 10..23; body pipes
    expect(marks).toContainEqual([0, 1])
    expect(marks).toContainEqual([10, 23])
    expect(marks).toContainEqual([32, 33])
  })

  it('clamps to the visible range', () => {
    const partial = collectConstructSpecs(
      markdownLanguage.parser.parse(DOC),
      Text.of(DOC.split('\n')),
      [{ from: 24, to: DOC.length }]
    ).filter((s) => s.kind === 'line' && s.class?.includes('fs-table'))
    expect(partial.map((s) => s.at)).toEqual([24])
  })
})
