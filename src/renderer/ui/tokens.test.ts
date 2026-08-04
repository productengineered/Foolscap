import { describe, expect, it } from 'vitest'
import { parseMs, parsePx } from './tokens'

describe('token value parsing', () => {
  it('reads ms and s durations', () => {
    expect(parseMs('4000ms')).toBe(4000)
    expect(parseMs(' 140ms ')).toBe(140)
    expect(parseMs('2s')).toBe(2000)
    expect(parseMs('0.35s')).toBe(350)
  })

  it('rejects unitless and malformed durations', () => {
    expect(parseMs('4000')).toBeNull()
    expect(parseMs('')).toBeNull()
    expect(parseMs('fast')).toBeNull()
  })

  it('reads px lengths and rejects other units', () => {
    expect(parsePx('8px')).toBe(8)
    expect(parsePx(' 6px ')).toBe(6)
    expect(parsePx('0.4rem')).toBeNull()
    expect(parsePx('')).toBeNull()
  })
})
