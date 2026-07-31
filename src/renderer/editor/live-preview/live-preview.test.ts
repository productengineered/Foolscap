import { markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { collectActiveSpecs, collectConstructSpecs, type DecoSpec } from './index'

function parse(doc: string) {
  const text = Text.of(doc.split('\n'))
  const tree = markdownLanguage.parser.parse(doc)
  const all = [{ from: 0, to: doc.length }]
  return { doc, text, tree, all }
}

const constructSpecs = (doc: string): DecoSpec[] => {
  const { text, tree, all } = parse(doc)
  return collectConstructSpecs(tree, text, all)
}

const marksIn = (specs: DecoSpec[], cls: string) =>
  specs.filter((s) => s.kind === 'mark' && s.class === cls).map((s) => [s.from, s.to])

const linesIn = (specs: DecoSpec[], cls: string) =>
  specs.filter((s) => s.kind === 'line' && s.class?.includes(cls)).map((s) => s.at)

describe('construct 1: inline marks', () => {
  it('bold: both ** pairs recede', () => {
    const specs = constructSpecs('some **bold** text')
    expect(marksIn(specs, 'fs-mark')).toEqual([
      [5, 7],
      [11, 13]
    ])
  })

  it('italic and nested bold-in-italic: every mark pair present', () => {
    const specs = constructSpecs('*it **both** it*')
    expect(marksIn(specs, 'fs-mark')).toEqual([
      [0, 1],
      [4, 6],
      [10, 12],
      [15, 16]
    ])
  })

  it('strikethrough marks recede', () => {
    const specs = constructSpecs('~~gone~~')
    expect(marksIn(specs, 'fs-mark')).toEqual([
      [0, 2],
      [6, 8]
    ])
  })

  it('inline code: backtick marks recede and the whole node gets the sunk pill', () => {
    const specs = constructSpecs('see `code` here')
    expect(marksIn(specs, 'fs-mark')).toEqual([
      [4, 5],
      [9, 10]
    ])
    expect(marksIn(specs, 'fs-code')).toEqual([[4, 10]])
  })
})

describe('construct 2: headings', () => {
  it('atx heading: line class carries the level, # mark recedes', () => {
    const specs = constructSpecs('# Title')
    expect(linesIn(specs, 'fs-h1')).toEqual([0])
    expect(marksIn(specs, 'fs-mark')).toEqual([[0, 1]])
  })

  it('all six atx levels map to their class', () => {
    const doc = '# a\n## b\n### c\n#### d\n##### e\n###### f'
    const specs = constructSpecs(doc)
    for (const [level, at] of [
      [1, 0],
      [2, 4],
      [3, 9],
      [4, 15],
      [5, 22],
      [6, 30]
    ]) {
      expect(linesIn(specs, `fs-h${level}`)).toEqual([at])
    }
  })

  it('setext heading: content line gets the class, underline ghosts as a mark', () => {
    const specs = constructSpecs('Title\n=====')
    expect(linesIn(specs, 'fs-h1')).toEqual([0])
    expect(marksIn(specs, 'fs-mark')).toEqual([[6, 11]])
  })
})

describe('construct 3a: blockquotes', () => {
  it('every quoted line gets the fill, > marks recede', () => {
    const specs = constructSpecs('> one\n> two')
    expect(linesIn(specs, 'fs-quote')).toEqual([0, 6])
    expect(marksIn(specs, 'fs-mark')).toEqual([
      [0, 1],
      [6, 7]
    ])
  })

  it('quote lines are clamped to the visible range', () => {
    const doc = '> a\n> b\n> c\n> d'
    const { text, tree } = parse(doc)
    const specs = collectConstructSpecs(tree, text, [{ from: 4, to: 7 }])
    expect(linesIn(specs, 'fs-quote')).toEqual([4])
  })
})

describe('active lines', () => {
  it('cursor line is active, others are not', () => {
    const { text, tree, all } = parse('# Title\n\nbody text')
    const sel = EditorSelection.create([EditorSelection.cursor(10)])
    const specs = collectActiveSpecs(tree, text, sel, all)
    expect(linesIn(specs, 'fs-active')).toEqual([9])
  })

  it('multi-cursor activates each line once', () => {
    const { text, tree, all } = parse('one\ntwo\nthree')
    const sel = EditorSelection.create([
      EditorSelection.cursor(0),
      EditorSelection.cursor(2),
      EditorSelection.cursor(9)
    ])
    const specs = collectActiveSpecs(tree, text, sel, all)
    expect(linesIn(specs, 'fs-active')).toEqual([0, 8])
  })

  it('a range selection activates every line it touches', () => {
    const { text, tree, all } = parse('one\ntwo\nthree')
    const sel = EditorSelection.create([EditorSelection.range(1, 9)])
    const specs = collectActiveSpecs(tree, text, sel, all)
    expect(linesIn(specs, 'fs-active')).toEqual([0, 4, 8])
  })

  it('emits the gutter glyph for the block at the main head', () => {
    const { text, tree, all } = parse('# Title\n\nbody')
    const sel = EditorSelection.create([EditorSelection.cursor(4)])
    const specs = collectActiveSpecs(tree, text, sel, all)
    const glyph = specs.find((s) => s.attrs?.['data-fs-glyph'])
    expect(glyph).toMatchObject({ at: 0, attrs: { 'data-fs-glyph': '#' } })
  })
})

describe('decoration collection performance (§6: test against 5000 lines from day one)', () => {
  it('collects a viewport-sized slice of a 5000-line doc well under the 16ms budget', () => {
    const chunk = '# Section\n\nSome **bold**, *italic*, `code`, ~~strike~~ text.\n\n> a quote\n\n'
    const doc = chunk.repeat(Math.ceil(5000 / 7))
    const { text, tree } = parse(doc)
    // ~60 visible lines mid-document.
    const from = text.line(2400).from
    const to = text.line(2460).to
    const start = performance.now()
    for (let i = 0; i < 10; i++) collectConstructSpecs(tree, text, [{ from, to }])
    const perPass = (performance.now() - start) / 10
    expect(perPass).toBeLessThan(16)
  })
})
