import { markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { resolveImageSrc } from './images'
import { collectActiveSpecs, type DecoSpec } from './index'

function activeSpecs(doc: string, cursor: number, docDir: string | null): DecoSpec[] {
  return collectActiveSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    EditorSelection.create([EditorSelection.cursor(cursor)]),
    [{ from: 0, to: doc.length }],
    docDir
  )
}

const widgetsIn = (all: DecoSpec[], type: string) =>
  all.filter((s) => s.kind === 'replace' && s.widget?.type === type)

describe('resolveImageSrc', () => {
  it('passes URLs with schemes through untouched', () => {
    expect(resolveImageSrc('https://a.b/c.png', '/docs')).toBe('https://a.b/c.png')
    expect(resolveImageSrc('data:image/png;base64,xyz', null)).toBe('data:image/png;base64,xyz')
  })

  it('absolute paths become file URLs regardless of document dir', () => {
    expect(resolveImageSrc('/pics/a.png', null)).toBe('file:///pics/a.png')
  })

  it('relative paths resolve against the document dir, encoded', () => {
    expect(resolveImageSrc('assets/shot 1.png', '/docs/notes')).toBe(
      'file:///docs/notes/assets/shot%201.png'
    )
  })

  it('relative path with no document dir cannot resolve', () => {
    expect(resolveImageSrc('assets/a.png', null)).toBeNull()
  })

  it('empty target cannot resolve', () => {
    expect(resolveImageSrc('', '/docs')).toBeNull()
  })
})

describe('construct 7: images', () => {
  const doc = '![a chart](chart.png)\n\nelsewhere'

  it('replaces the whole construct with a widget when the cursor is away', () => {
    const widgets = widgetsIn(activeSpecs(doc, 25, '/docs'), 'image')
    expect(widgets).toEqual([
      {
        kind: 'replace',
        from: 0,
        to: 21,
        widget: { type: 'image', src: 'file:///docs/chart.png', alt: 'a chart' }
      }
    ])
  })

  it('shows raw markdown while the cursor is inside the construct', () => {
    expect(widgetsIn(activeSpecs(doc, 5, '/docs'), 'image')).toEqual([])
  })

  it('cursor exactly on the boundary counts as inside (predicate is inclusive)', () => {
    expect(widgetsIn(activeSpecs(doc, 21, '/docs'), 'image')).toEqual([])
  })

  it('unresolvable path yields a widget with null src (broken state)', () => {
    const widgets = widgetsIn(activeSpecs(doc, 25, null), 'image')
    expect(widgets[0]?.widget).toEqual({ type: 'image', src: null, alt: 'a chart' })
  })
})

describe('construct 8: horizontal rules', () => {
  const doc = 'above\n\n---\n\nbelow'

  it('renders as a rule widget when the cursor is elsewhere', () => {
    expect(widgetsIn(activeSpecs(doc, 2, null), 'hr')).toEqual([
      { kind: 'replace', from: 7, to: 10, widget: { type: 'hr' } }
    ])
  })

  it('the active line shows the raw dashes', () => {
    expect(widgetsIn(activeSpecs(doc, 8, null), 'hr')).toEqual([])
  })
})
