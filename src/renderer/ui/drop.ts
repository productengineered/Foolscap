import { DROPPABLE_FILE } from '../../shared/types'

export type DropVerdict = 'open' | 'reject' | 'pass'

export function classifyDrop(fileNames: readonly string[]): DropVerdict {
  const first = fileNames[0]
  if (first === undefined) return 'pass'
  return DROPPABLE_FILE.test(first) ? 'open' : 'reject'
}
