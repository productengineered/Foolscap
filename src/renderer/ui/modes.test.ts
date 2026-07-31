import { describe, expect, it } from 'vitest'
import { clampTextSize, countWords, FONTS, TEXT_SIZE } from './modes'

describe('clampTextSize', () => {
  it('clamps to the plan range and rounds', () => {
    expect(clampTextSize(10)).toBe(TEXT_SIZE.min)
    expect(clampTextSize(30)).toBe(TEXT_SIZE.max)
    expect(clampTextSize(16.6)).toBe(17)
    expect(clampTextSize(17)).toBe(17)
  })
})
import { extForMime } from '../editor/paste-image'

describe('FONTS roster', () => {
  it('is five serif and five sans with unique ids', () => {
    expect(FONTS.filter((f) => f.kind === 'serif')).toHaveLength(5)
    expect(FONTS.filter((f) => f.kind === 'sans')).toHaveLength(5)
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(FONTS.length)
  })

  it('google sans is present and falls back to an open font', () => {
    const gs = FONTS.find((f) => f.id === 'google-sans')
    expect(gs?.stack).toContain("'Google Sans'")
    expect(gs?.stack).toContain('Outfit')
  })
})

describe('countWords', () => {
  it('counts plain prose', () => {
    expect(countWords('three little words')).toBe(3)
  })

  it('ignores bare syntax marks', () => {
    expect(countWords('# Heading\n\n> quoted words here\n\n- item\n- ```')).toBe(5)
  })

  it('counts unicode words and numbers', () => {
    expect(countWords('日本語 text — 42')).toBe(3)
  })

  it('empty and whitespace-only documents count zero', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('  \n\n  ')).toBe(0)
  })
})

describe('extForMime', () => {
  it('maps supported image types', () => {
    expect(extForMime('image/png')).toBe('png')
    expect(extForMime('image/jpeg')).toBe('jpg')
  })

  it('rejects non-images', () => {
    expect(extForMime('text/plain')).toBeNull()
    expect(extForMime('image/svg+xml')).toBeNull()
  })
})
