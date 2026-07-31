import { markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collectActiveSpecs, type DecoSpec } from './index'

function nods(doc: string, cursor: number): DecoSpec[] {
  return collectActiveSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    EditorSelection.create([EditorSelection.cursor(cursor)]),
    [{ from: 0, to: doc.length }]
  ).filter((s) => s.kind === 'replace' && s.widget?.type === 'nod')
}

describe('easter egg: :yes-yes:', () => {
  it('replaces the token with a nod widget when the cursor is away', () => {
    const doc = 'sounds right :yes-yes:\n\nelsewhere'
    expect(nods(doc, 30)).toEqual([{ kind: 'replace', from: 13, to: 22, widget: { type: 'nod' } }])
  })

  it('shows the raw token while the cursor is inside it', () => {
    expect(nods('sounds right :yes-yes:', 17)).toEqual([])
  })

  it('cursor on the boundary counts as inside (predicate is inclusive)', () => {
    expect(nods('sounds right :yes-yes:', 22)).toEqual([])
  })

  it('finds every occurrence in the visible range', () => {
    expect(nods(':yes-yes: and :yes-yes:\n\nx', 25)).toHaveLength(2)
  })

  it('leaves code alone', () => {
    expect(nods('`:yes-yes:`\n\nx', 13)).toEqual([])
    expect(nods('```\n:yes-yes:\n```\n\nx', 19)).toEqual([])
  })

  it('ignores near misses', () => {
    expect(nods(':yes-yes and yes-yes:\n\nx', 23)).toEqual([])
  })
})
