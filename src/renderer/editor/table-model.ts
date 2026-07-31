/* The pure table core (Phase 4). Everything that understands pipe-table
 * text lives here: parsing, the normalizing formatter (ULTRAPLAN §7:
 * "round-trip to clean pipe-table markdown, column widths normalized"),
 * and the structural transforms the hover controls and keymaps apply.
 * No CodeMirror, no DOM — plain strings in, plain strings out. */

export type Align = 'left' | 'center' | 'right' | null

export interface TableModel {
  /* Leading indent of the table (first line's), reapplied to every line. */
  indent: string
  header: string[]
  align: Align[]
  rows: string[][]
}

/* Split a row line into cells on unescaped pipes; outer pipes optional. */
function splitRow(line: string): string[] {
  const trimmed = line.trim()
  const cells: string[] = []
  let current = ''
  let start = 0
  if (trimmed.startsWith('|')) start = 1
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '\\|'
      i++
    } else if (ch === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() !== '' || !trimmed.endsWith('|')) cells.push(current.trim())
  return cells
}

const DELIMITER_CELL = /^:?-+:?$/

function delimiterAlign(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

export function isDelimiterRow(line: string): boolean {
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => DELIMITER_CELL.test(c))
}

export function parseTable(text: string): TableModel {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  const indent = /^[ \t]*/.exec(lines[0] ?? '')?.[0] ?? ''
  const header = splitRow(lines[0] ?? '')
  const align: Align[] =
    lines.length > 1 && isDelimiterRow(lines[1] ?? '')
      ? splitRow(lines[1] ?? '').map(delimiterAlign)
      : header.map(() => null)
  const rows = lines.slice(2).map(splitRow)

  // Column count is fixed by the widest of header/delimiter; rows are
  // padded or truncated to it, GFM-style.
  const columns = Math.max(header.length, align.length)
  const fit = (cells: string[]): string[] =>
    Array.from({ length: columns }, (_, i) => cells[i] ?? '')
  return {
    indent,
    header: fit(header),
    align: Array.from({ length: columns }, (_, i) => align[i] ?? null),
    rows: rows.map(fit)
  }
}

/* Naive display width — CJK and emoji count as 1. Good enough to line up
 * the common case; revisit with a real width table if it ever matters. */
const width = (s: string): number => s.length

function pad(cell: string, target: number, align: Align): string {
  const gap = Math.max(0, target - width(cell))
  if (align === 'right') return ' '.repeat(gap) + cell
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return ' '.repeat(left) + cell + ' '.repeat(gap - left)
  }
  return cell + ' '.repeat(gap)
}

function delimiterCell(align: Align, target: number): string {
  const dashes = (n: number): string => '-'.repeat(Math.max(1, n))
  if (align === 'center') return `:${dashes(target - 2)}:`
  if (align === 'right') return `${dashes(target - 1)}:`
  if (align === 'left') return `:${dashes(target - 1)}`
  return dashes(target)
}

export function formatTable(model: TableModel): string {
  const columns = model.header.length
  const widths = Array.from({ length: columns }, (_, i) => {
    let max = Math.max(3, width(model.header[i] ?? ''))
    for (const row of model.rows) max = Math.max(max, width(row[i] ?? ''))
    return max
  })
  const line = (cells: string[]): string =>
    `${model.indent}| ${cells.join(' | ')} |`
  const headerLine = line(
    model.header.map((c, i) => pad(c, widths[i] ?? 3, model.align[i] ?? null))
  )
  const delimiterLine = line(
    model.align.map((a, i) => delimiterCell(a, widths[i] ?? 3))
  )
  const rowLines = model.rows.map((row) =>
    line(row.map((c, i) => pad(c, widths[i] ?? 3, model.align[i] ?? null)))
  )
  return [headerLine, delimiterLine, ...rowLines].join('\n')
}

/* Normalized form of table text; identity for already-clean tables. */
export function normalizeTable(text: string): string {
  return formatTable(parseTable(text))
}

/* ---- cell geometry (for navigation) ----
 * Text-based rather than tree-based: the lezer grammar emits no TableCell
 * node for empty cells, and freshly inserted rows are all empty. */

export interface CellRange {
  from: number
  to: number
}

/* Content ranges of each cell in one row line, relative to line start.
 * Empty cells yield a collapsed range at their natural content position. */
export function cellRangesOfLine(line: string): CellRange[] {
  const ranges: CellRange[] = []
  let i = 0
  if (line.trimStart().startsWith('|')) i = line.indexOf('|') + 1
  let segStart = i
  const closeSegment = (segEnd: number): void => {
    const seg = line.slice(segStart, segEnd)
    const leading = seg.length - seg.trimStart().length
    const trailing = seg.length - seg.trimEnd().length
    if (seg.trim() === '') {
      const at = segStart + Math.min(1, seg.length)
      ranges.push({ from: at, to: at })
    } else {
      ranges.push({ from: segStart + leading, to: segEnd - trailing })
    }
  }
  for (; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') {
      i++
    } else if (line[i] === '|') {
      closeSegment(i)
      segStart = i + 1
    }
  }
  const tail = line.slice(segStart)
  if (tail.trim() !== '') closeSegment(line.length)
  return ranges
}

/* All navigable cell ranges of a table, relative to the table text start,
 * in document order, skipping the delimiter row. */
export function tableCellRanges(text: string): CellRange[] {
  const ranges: CellRange[] = []
  let offset = 0
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    if (!(index === 1 && isDelimiterRow(line)) && line.trim() !== '') {
      for (const range of cellRangesOfLine(line)) {
        ranges.push({ from: offset + range.from, to: offset + range.to })
      }
    }
    offset += line.length + 1
  })
  return ranges
}

/* ---- transforms ---- */

export function insertColumn(model: TableModel, at: number): TableModel {
  const clamp = Math.max(0, Math.min(at, model.header.length))
  const splice = <T>(arr: T[], value: T): T[] => [
    ...arr.slice(0, clamp),
    value,
    ...arr.slice(clamp)
  ]
  return {
    ...model,
    header: splice(model.header, ''),
    align: splice(model.align, null),
    rows: model.rows.map((row) => splice(row, ''))
  }
}

export function deleteColumn(model: TableModel, at: number): TableModel {
  if (model.header.length <= 1) return model
  const remove = <T>(arr: T[]): T[] => arr.filter((_, i) => i !== at)
  return {
    ...model,
    header: remove(model.header),
    align: remove(model.align),
    rows: model.rows.map(remove)
  }
}

const ALIGN_CYCLE: Align[] = [null, 'left', 'center', 'right']

export function cycleAlign(model: TableModel, at: number): TableModel {
  const current = model.align[at] ?? null
  const next = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(current) + 1) % ALIGN_CYCLE.length] ?? null
  return { ...model, align: model.align.map((a, i) => (i === at ? next : a)) }
}

/* Insert an empty row after body-row index `after` (-1 = right under the
 * header). */
export function insertRow(model: TableModel, after: number): TableModel {
  const empty = model.header.map(() => '')
  const at = Math.max(0, Math.min(after + 1, model.rows.length))
  return {
    ...model,
    rows: [...model.rows.slice(0, at), empty, ...model.rows.slice(at)]
  }
}
