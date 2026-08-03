import { describe, expect, it } from 'vitest'
import { classifyDrop } from './drop'

describe('classifyDrop', () => {
  it('passes a text drop to CodeMirror', () => {
    expect(classifyDrop([])).toBe('pass')
  })

  it('opens markdown files', () => {
    for (const name of ['note.md', 'a.markdown', 'a.mdx', 'a.txt', 'UPPER.MD']) {
      expect(classifyDrop([name])).toBe('open')
    }
  })

  it('rejects anything else instead of letting it be inserted as text', () => {
    for (const name of ['photo.png', 'archive.zip', 'noext', 'a.md.zip']) {
      expect(classifyDrop([name])).toBe('reject')
    }
  })

  it('judges a multi-file drop by the first file', () => {
    expect(classifyDrop(['note.md', 'photo.png'])).toBe('open')
    expect(classifyDrop(['photo.png', 'note.md'])).toBe('reject')
  })
})
