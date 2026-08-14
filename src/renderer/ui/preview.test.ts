import { describe, expect, it } from 'vitest'
import { bestCoveringIndex, nearestSpanIndex } from './preview'

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

describe('nearestSpanIndex', () => {
  const spans = [
    { top: 0, bottom: 100 },
    { top: 100, bottom: 240 },
    { top: 260, bottom: 400 }
  ]

  it('picks the span covering the target line', () => {
    expect(nearestSpanIndex(spans, 150)).toBe(1)
  })

  it('picks the nearest span when the target falls in a gap', () => {
    expect(nearestSpanIndex(spans, 245)).toBe(1)
    expect(nearestSpanIndex(spans, 255)).toBe(2)
  })

  it('ties go to the later span, so nested elements win over parents', () => {
    // A parent covering [0, 400] listed before its child covering [100, 240].
    const nested = [{ top: 0, bottom: 400 }, ...spans]
    expect(nearestSpanIndex(nested, 150)).toBe(2)
  })

  it('returns -1 on empty input', () => {
    expect(nearestSpanIndex([], 50)).toBe(-1)
  })
})
