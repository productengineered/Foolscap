import { markdownLanguage } from '@codemirror/lang-markdown'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collectHeadingItems } from './outline'
import { scoreMatch } from './palette'

describe('palette scoreMatch', () => {
  it('empty query matches everything neutrally', () => {
    expect(scoreMatch('', 'Save As…')).toBe(0)
  })

  it('prefix beats word-start beats subsequence', () => {
    expect(scoreMatch('sa', 'Save')).toBe(3)
    expect(scoreMatch('as', 'Save As…')).toBe(2)
    expect(scoreMatch('sv', 'Save')).toBe(1)
  })

  it('non-matches return null', () => {
    expect(scoreMatch('xyz', 'Save')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(scoreMatch('SAVE', 'save as')).toBe(3)
  })
})

function headings(doc: string) {
  return collectHeadingItems(markdownLanguage.parser.parse(doc), Text.of(doc.split('\n')))
}

describe('collectHeadingItems', () => {
  it('collects all levels in order with hash marks stripped', () => {
    const doc = '# One\n\ntext\n\n## Two\n\n### Three'
    expect(headings(doc)).toEqual([
      { level: 1, text: 'One', from: 0 },
      { level: 2, text: 'Two', from: 13 },
      { level: 3, text: 'Three', from: 21 }
    ])
  })

  it('strips closing hashes and trims', () => {
    expect(headings('##  Spaced heading  ##')[0]?.text).toBe('Spaced heading')
  })

  it('setext headings map to their levels', () => {
    const doc = 'Alpha\n=====\n\nBeta\n----'
    expect(headings(doc)).toEqual([
      { level: 1, text: 'Alpha', from: 0 },
      { level: 2, text: 'Beta', from: 13 }
    ])
  })

  it('headings inside blockquotes are found', () => {
    expect(headings('> # Quoted heading')).toEqual([
      { level: 1, text: 'Quoted heading', from: 2 }
    ])
  })

  it('hash lines inside code fences are not headings', () => {
    expect(headings('```\n# not a heading\n```')).toEqual([])
  })

  it('empty heading gets a placeholder', () => {
    expect(headings('#')[0]?.text).toBe('(untitled)')
  })

  it('empty document yields no items', () => {
    expect(headings('')).toEqual([])
  })
})
