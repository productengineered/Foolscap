import { describe, expect, it } from 'vitest'
import { isNewerVersion } from './semver'

describe('isNewerVersion', () => {
  it('detects newer patch, minor, and major', () => {
    expect(isNewerVersion('0.4.1', '0.4.0')).toBe(true)
    expect(isNewerVersion('0.5.0', '0.4.9')).toBe(true)
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true)
  })

  it('rejects equal and older versions', () => {
    expect(isNewerVersion('0.4.0', '0.4.0')).toBe(false)
    expect(isNewerVersion('0.3.9', '0.4.0')).toBe(false)
    expect(isNewerVersion('0.4.0', '1.0.0')).toBe(false)
  })

  it('compares numerically, not lexically', () => {
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true)
    expect(isNewerVersion('0.9.0', '0.10.0')).toBe(false)
  })

  it('accepts a leading v (release tags) and stray whitespace', () => {
    expect(isNewerVersion('v0.4.1', '0.4.0')).toBe(true)
    expect(isNewerVersion(' 0.4.1 ', '0.4.0')).toBe(true)
  })

  it('treats malformed input as not-newer', () => {
    expect(isNewerVersion('banana', '0.4.0')).toBe(false)
    expect(isNewerVersion('0.4', '0.4.0')).toBe(false)
    expect(isNewerVersion('0.4.0-beta.1', '0.4.0')).toBe(false)
    expect(isNewerVersion('9.9.9', 'not-a-version')).toBe(false)
    expect(isNewerVersion('', '')).toBe(false)
  })
})
