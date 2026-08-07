import { markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import {
  insertLink,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough
} from './format-commands'

/* The commands read the tree via syntaxTree(state), so the state needs the
 * real markdown language — same grammar the editor runs. */
function apply(
  cmd: StateCommand,
  doc: string,
  ranges: [number, number][]
): { doc: string; ranges: [number, number][] } {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.create(ranges.map(([a, h]) => EditorSelection.range(a, h))),
    extensions: [EditorState.allowMultipleSelections.of(true), markdownLanguage]
  })
  cmd({ state, dispatch: (tr) => (state = tr.state) })
  return {
    doc: state.doc.toString(),
    ranges: state.selection.ranges.map((r) => [r.anchor, r.head])
  }
}

describe('toggleBold', () => {
  it('wraps a selection and keeps the text selected', () => {
    expect(apply(toggleBold, 'hello world', [[0, 5]])).toEqual({
      doc: '**hello** world',
      ranges: [[2, 7]]
    })
  })

  it('unwraps a selection already inside strong emphasis', () => {
    expect(apply(toggleBold, '**hello** world', [[2, 7]])).toEqual({
      doc: 'hello world',
      ranges: [[0, 5]]
    })
  })

  it('unwraps when the selection includes the markers', () => {
    expect(apply(toggleBold, '**hello** world', [[0, 9]])).toEqual({
      doc: 'hello world',
      ranges: [[0, 5]]
    })
  })

  it('caret inside a bold word unwraps it', () => {
    expect(apply(toggleBold, 'a **word** b', [[6, 6]])).toEqual({
      doc: 'a word b',
      ranges: [[4, 4]]
    })
  })

  it('caret inside a plain word wraps the word', () => {
    expect(apply(toggleBold, 'hello world', [[8, 8]])).toEqual({
      doc: 'hello **world**',
      ranges: [[8, 13]]
    })
  })

  it('caret in empty space inserts a pair and centers the caret', () => {
    expect(apply(toggleBold, 'a ', [[2, 2]])).toEqual({
      doc: 'a ****',
      ranges: [[4, 4]]
    })
  })

  it('pressed again on the empty pair removes it', () => {
    expect(apply(toggleBold, 'a ****', [[4, 4]])).toEqual({
      doc: 'a ',
      ranges: [[2, 2]]
    })
  })

  it('multi-cursor formats every range', () => {
    expect(
      apply(toggleBold, 'one two', [
        [0, 3],
        [4, 7]
      ])
    ).toEqual({
      doc: '**one** **two**',
      ranges: [
        [2, 5],
        [10, 13]
      ]
    })
  })
})

describe('the other inline formats', () => {
  it('italic wraps with a single star', () => {
    expect(apply(toggleItalic, 'hello', [[0, 5]])).toEqual({
      doc: '*hello*',
      ranges: [[1, 6]]
    })
  })

  it('italic unwraps emphasis without touching surrounding bold', () => {
    expect(apply(toggleItalic, '***hello***', [[3, 8]])).toEqual({
      doc: '**hello**',
      ranges: [[2, 7]]
    })
  })

  it('strikethrough round-trips', () => {
    expect(apply(toggleStrikethrough, 'gone', [[0, 4]]).doc).toBe('~~gone~~')
    expect(apply(toggleStrikethrough, '~~gone~~', [[2, 6]]).doc).toBe('gone')
  })

  it('inline code round-trips', () => {
    expect(apply(toggleInlineCode, 'npm', [[0, 3]]).doc).toBe('`npm`')
    expect(apply(toggleInlineCode, '`npm`', [[1, 4]]).doc).toBe('npm')
  })
})

describe('insertLink', () => {
  it('turns the selection into link text with the caret in the parens', () => {
    expect(apply(insertLink, 'see docs here', [[4, 8]])).toEqual({
      doc: 'see [docs]() here',
      ranges: [[11, 11]]
    })
  })

  it('empty selection leaves the caret in the brackets', () => {
    expect(apply(insertLink, 'see ', [[4, 4]])).toEqual({
      doc: 'see []()',
      ranges: [[5, 5]]
    })
  })
})
