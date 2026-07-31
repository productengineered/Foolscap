import { EditorSelection } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { selectionTouches } from './marks'

const cursor = (pos: number) => EditorSelection.create([EditorSelection.cursor(pos)])
const range = (anchor: number, head: number) =>
  EditorSelection.create([EditorSelection.range(anchor, head)])

describe('selectionTouches — THE cursor-adjacency predicate', () => {
  it('cursor inside the construct touches', () => {
    expect(selectionTouches(cursor(5), 2, 8)).toBe(true)
  })

  it('cursor outside does not touch', () => {
    expect(selectionTouches(cursor(1), 2, 8)).toBe(false)
    expect(selectionTouches(cursor(9), 2, 8)).toBe(false)
  })

  it('cursor exactly on either boundary touches (inclusive)', () => {
    expect(selectionTouches(cursor(2), 2, 8)).toBe(true)
    expect(selectionTouches(cursor(8), 2, 8)).toBe(true)
  })

  it('selection range overlapping partially touches', () => {
    expect(selectionTouches(range(0, 4), 2, 8)).toBe(true)
    expect(selectionTouches(range(7, 20), 2, 8)).toBe(true)
  })

  it('selection range strictly containing the construct touches', () => {
    expect(selectionTouches(range(0, 20), 2, 8)).toBe(true)
  })

  it('selection range strictly inside the construct touches', () => {
    expect(selectionTouches(range(3, 5), 2, 8)).toBe(true)
  })

  it('multi-cursor: any cursor touching counts', () => {
    const sel = EditorSelection.create([
      EditorSelection.cursor(0),
      EditorSelection.cursor(5),
      EditorSelection.cursor(30)
    ])
    expect(selectionTouches(sel, 2, 8)).toBe(true)
    expect(selectionTouches(sel, 10, 20)).toBe(false)
  })

  it('nested constructs: inner and outer judged independently', () => {
    // e.g. **bold *italic* bold**: outer 0..22, inner 7..15, cursor in inner
    expect(selectionTouches(cursor(10), 0, 22)).toBe(true)
    expect(selectionTouches(cursor(10), 7, 15)).toBe(true)
    // cursor in outer but not inner
    expect(selectionTouches(cursor(3), 7, 15)).toBe(false)
  })

  it('zero-length construct at a cursor position touches', () => {
    expect(selectionTouches(cursor(4), 4, 4)).toBe(true)
  })

  it('construct at document start with cursor at 0', () => {
    expect(selectionTouches(cursor(0), 0, 3)).toBe(true)
  })
})
