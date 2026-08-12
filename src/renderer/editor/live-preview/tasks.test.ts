import { markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collectActiveSpecs, type DecoSpec } from './index'

function tasks(doc: string, cursor: number): DecoSpec[] {
  return collectActiveSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    EditorSelection.create([EditorSelection.cursor(cursor)]),
    [{ from: 0, to: doc.length }]
  ).filter((s) => s.kind === 'replace' && s.widget?.type === 'task')
}

describe('task-list checkboxes', () => {
  const doc = '- [ ] wash the wumble\n- [x] feed Brenda II\n\nfar away'

  it('replaces both markers with checkbox widgets when the cursor is away', () => {
    expect(tasks(doc, doc.length)).toEqual([
      { kind: 'replace', from: 2, to: 5, widget: { type: 'task', checked: false, at: 2 } },
      { kind: 'replace', from: 24, to: 27, widget: { type: 'task', checked: true, at: 24 } }
    ])
  })

  it('reveals the literal marker while the cursor touches it', () => {
    const specs = tasks(doc, 3)
    expect(specs).toHaveLength(1)
    expect(specs[0]?.from).toBe(24)
  })

  it('boundary positions count as touching (predicate is inclusive)', () => {
    expect(tasks(doc, 5).map((s) => s.from)).toEqual([24])
    expect(tasks(doc, 2).map((s) => s.from)).toEqual([24])
  })

  it('reads an uppercase X as checked', () => {
    const specs = tasks('- [X] shout\n\nfar', 14)
    expect(specs[0]?.widget).toEqual({ type: 'task', checked: true, at: 2 })
  })

  it('leaves plain lists alone', () => {
    expect(tasks('- just a bullet\n\nfar', 18)).toEqual([])
  })

  it('leaves bracketed text outside lists alone', () => {
    expect(tasks('paragraph with [ ] brackets\n\nfar', 30)).toEqual([])
  })
})
