const DROPPABLE = /\.(md|markdown|mdx|txt)$/i

export type DropVerdict = 'open' | 'reject' | 'pass'

export function classifyDrop(fileNames: readonly string[]): DropVerdict {
  const first = fileNames[0]
  if (first === undefined) return 'pass'
  return DROPPABLE.test(first) ? 'open' : 'reject'
}
