import { markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collectActiveSpecs, collectConstructSpecs, type DecoSpec } from './index'

function specs(doc: string): DecoSpec[] {
  return collectConstructSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    [{ from: 0, to: doc.length }]
  )
}

function activeSpecs(doc: string, cursor: number): DecoSpec[] {
  return collectActiveSpecs(
    markdownLanguage.parser.parse(doc),
    Text.of(doc.split('\n')),
    EditorSelection.create([EditorSelection.cursor(cursor)]),
    [{ from: 0, to: doc.length }]
  )
}

const indentOf = (all: DecoSpec[], at: number) =>
  all.find((s) => s.kind === 'line' && s.at === at && s.attrs?.['style'])?.attrs?.['style']

const bulletsIn = (all: DecoSpec[]) =>
  all.filter((s) => s.kind === 'replace' && s.widget?.type === 'bullet').map((s) => [s.from, s.to])

describe('construct 4: lists', () => {
  it('hanging indent matches marker width plus its space', () => {
    expect(indentOf(specs('- item'), 0)).toBe('padding-left: 2ch; text-indent: -2ch')
  })

  it('nested items indent to their own content column', () => {
    const doc = '- outer\n  - inner'
    // inner ListMark at 10..11, line start 8 → width 4
    expect(indentOf(specs(doc), 8)).toBe('padding-left: 4ch; text-indent: -4ch')
  })

  it('ordered markers are wider and get the quiet-mark class, never a bullet', () => {
    const all = specs('1. first')
    // '1.' is two chars + one space = content column 3
    expect(indentOf(all, 0)).toBe('padding-left: 3ch; text-indent: -3ch')
    expect(
      all.filter((s) => s.kind === 'mark' && s.class === 'fs-list-mark').map((s) => [s.from, s.to])
    ).toEqual([[0, 2]])
    expect(bulletsIn(activeSpecs('1. first\n\nelsewhere', 12))).toEqual([])
  })

  it('bullet marker becomes a real bullet when the line is not active', () => {
    expect(bulletsIn(activeSpecs('- item\n\nelsewhere', 10))).toEqual([[0, 1]])
  })

  it('the active line keeps its raw marker', () => {
    expect(bulletsIn(activeSpecs('- item\n\nelsewhere', 3))).toEqual([])
  })
})
