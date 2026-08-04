import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { extForMime, imageInsertion } from './paste-image'

describe('extForMime', () => {
  it('maps known image mimes and rejects the rest', () => {
    expect(extForMime('image/png')).toBe('png')
    expect(extForMime('image/jpeg')).toBe('jpg')
    expect(extForMime('text/plain')).toBeNull()
  })
})

describe('imageInsertion', () => {
  it('inserts the link and parks the caret in the alt brackets', () => {
    const state = EditorState.create({ doc: 'before after', selection: { anchor: 7 } })
    const next = state.update(imageInsertion(state, 'assets/a.png')).state
    expect(next.doc.toString()).toBe('before ![](assets/a.png)after')
    expect(next.selection.main.head).toBe(9)
  })

  it('replaces a non-empty selection', () => {
    const state = EditorState.create({
      doc: 'before after',
      selection: EditorSelection.create([EditorSelection.range(7, 12)])
    })
    const next = state.update(imageInsertion(state, 'assets/a.png')).state
    expect(next.doc.toString()).toBe('before ![](assets/a.png)')
  })

  it('multi-cursor: every cursor gets a link with its own caret in the alt brackets', () => {
    const state = EditorState.create({
      doc: 'ab cd',
      selection: EditorSelection.create(
        [EditorSelection.cursor(0), EditorSelection.cursor(3)],
        1 // main is the later cursor, as after clicking with alt held
      ),
      extensions: EditorState.allowMultipleSelections.of(true)
    })
    const next = state.update(imageInsertion(state, 'x.png')).state
    expect(next.doc.toString()).toBe('![](x.png)ab ![](x.png)cd')
    expect(next.selection.ranges.map((r) => r.head)).toEqual([2, 15])
  })
})
