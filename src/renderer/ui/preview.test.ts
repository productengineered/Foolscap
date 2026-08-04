import { describe, expect, it } from 'vitest'
import { bestCoveringIndex } from './preview'

describe('bestCoveringIndex', () => {
  it('picks the largest stamp at or below the target', () => {
    expect(bestCoveringIndex([0, 120, 300, 480], 310)).toBe(2)
    expect(bestCoveringIndex([0, 120, 300, 480], 480)).toBe(3)
  })

  it('is not fooled by footnote definitions rendered at the end with early offsets', () => {
    // Body elements in source order, then the hoisted footnote block at pos 50.
    expect(bestCoveringIndex([0, 120, 300, 50], 300)).toBe(2)
  })

  it('returns -1 when everything is past the target', () => {
    expect(bestCoveringIndex([100, 200], 40)).toBe(-1)
  })

  it('skips unstamped elements (NaN)', () => {
    expect(bestCoveringIndex([0, NaN, 80], 90)).toBe(2)
  })
})
