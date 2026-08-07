import { EditorSelection, EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extForMime, imageInsertion, insertPastedImage } from './paste-image'

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

describe('insertPastedImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubView = (): { view: EditorView; dispatch: ReturnType<typeof vi.fn> } => {
    const dispatch = vi.fn()
    const view = {
      dispatch,
      focus: vi.fn(),
      state: EditorState.create({ doc: '' })
    } as unknown as EditorView
    return { view, dispatch }
  }

  const stubFile = (): File => ({ arrayBuffer: async () => new ArrayBuffer(4) }) as unknown as File

  const stubBridge = (pasteImage: () => Promise<string | null>): void => {
    vi.stubGlobal('window', { foolscap: { pasteImage } })
  }

  it('inserts the link main answers with', async () => {
    stubBridge(async () => 'assets/a.png')
    const { view, dispatch } = stubView()
    await insertPastedImage(view, stubFile(), 'png', vi.fn())
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('reports the unsaved document instead of inserting', async () => {
    stubBridge(async () => null)
    const { view, dispatch } = stubView()
    const onNoDocument = vi.fn()
    await insertPastedImage(view, stubFile(), 'png', onNoDocument)
    expect(onNoDocument).toHaveBeenCalledOnce()
    expect(dispatch).not.toHaveBeenCalled()
  })

  /* The write failing is the silent case: the paste handler has already
   * called preventDefault, so the rejection has to escape for it to catch. */
  it('rejects when the save fails, leaving the document untouched', async () => {
    stubBridge(async () => {
      throw new Error('EACCES')
    })
    const { view, dispatch } = stubView()
    const onNoDocument = vi.fn()
    await expect(insertPastedImage(view, stubFile(), 'png', onNoDocument)).rejects.toThrow('EACCES')
    expect(onNoDocument).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
