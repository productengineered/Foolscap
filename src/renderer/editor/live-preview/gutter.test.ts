import { markdownLanguage } from '@codemirror/lang-markdown'
import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { glyphForPos } from './gutter'

function glyphAt(doc: string, pos: number) {
  const tree = markdownLanguage.parser.parse(doc)
  return glyphForPos(tree, Text.of(doc.split('\n')), pos)
}

describe('glyphForPos — block-type glyph for the gutter', () => {
  it('heading → #', () => {
    expect(glyphAt('# Title\n\nbody', 4)).toEqual({ glyph: '#', lineFrom: 0 })
  })

  it('cursor at end of heading line still reads as the heading', () => {
    expect(glyphAt('# Title\n\nbody', 7)).toEqual({ glyph: '#', lineFrom: 0 })
  })

  it('blockquote → >', () => {
    expect(glyphAt('> quoted text', 5)).toEqual({ glyph: '>', lineFrom: 0 })
  })

  it('bullet list item → •', () => {
    expect(glyphAt('- item one\n- item two', 3)).toEqual({ glyph: '•', lineFrom: 0 })
  })

  it('ordered list item → 1.', () => {
    expect(glyphAt('1. first\n2. second', 12)).toEqual({ glyph: '1.', lineFrom: 9 })
  })

  it('fenced code → ~', () => {
    const doc = '```js\nconst x = 1\n```'
    expect(glyphAt(doc, 10)).toEqual({ glyph: '~', lineFrom: 0 })
  })

  it('plain paragraph → no glyph', () => {
    expect(glyphAt('just a paragraph', 5)).toBeNull()
  })

  it('cursor at position 0 still reads the enclosing block', () => {
    expect(glyphAt('# Title\n\nbody', 0)).toEqual({ glyph: '#', lineFrom: 0 })
    expect(glyphAt('> quote first', 0)).toEqual({ glyph: '>', lineFrom: 0 })
  })

  it('cursor at the exact start of a mid-document block reads that block', () => {
    // pos 6 is the start of the heading line after an empty line
    expect(glyphAt('body\n\n# Title', 6)).toEqual({ glyph: '#', lineFrom: 6 })
  })

  it('nested: list item inside a blockquote reads as the innermost block', () => {
    expect(glyphAt('> - nested item', 8)?.glyph).toBe('•')
  })

  it('second line of a multi-line quote anchors the glyph to the block start', () => {
    expect(glyphAt('> one\n> two', 9)).toEqual({ glyph: '>', lineFrom: 0 })
  })
})
