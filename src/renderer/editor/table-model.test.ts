import { describe, expect, it } from 'vitest'
import {
  cellRangesOfLine,
  cycleAlign,
  deleteColumn,
  insertColumn,
  insertRow,
  isDelimiterRow,
  normalizeTable,
  parseTable,
  tableCellRanges
} from './table-model'

const MESSY = `| Name | Qty | Price |
|---|:--:|--:|
| apple | 3 | 1.20 |
| pear      | 12 | 0.85 |`

const CLEAN = `| Name  | Qty | Price |
| ----- | :-: | ----: |
| apple |  3  |  1.20 |
| pear  | 12  |  0.85 |`

describe('parseTable', () => {
  it('reads header, alignment, and rows', () => {
    const m = parseTable(MESSY)
    expect(m.header).toEqual(['Name', 'Qty', 'Price'])
    expect(m.align).toEqual([null, 'center', 'right'])
    expect(m.rows).toEqual([
      ['apple', '3', '1.20'],
      ['pear', '12', '0.85']
    ])
  })

  it('handles missing outer pipes', () => {
    const m = parseTable('a | b\n--- | ---\n1 | 2')
    expect(m.header).toEqual(['a', 'b'])
    expect(m.rows).toEqual([['1', '2']])
  })

  it('keeps escaped pipes inside cells', () => {
    const m = parseTable('| a \\| b | c |\n| --- | --- |\n| x | y |')
    expect(m.header).toEqual(['a \\| b', 'c'])
  })

  it('pads short rows and truncates long ones to the column count', () => {
    const m = parseTable('| a | b |\n| --- | --- |\n| 1 |\n| 1 | 2 | 3 |')
    expect(m.rows).toEqual([
      ['1', ''],
      ['1', '2']
    ])
  })

  it('preserves leading indent', () => {
    const m = parseTable('  | a |\n  | --- |\n  | 1 |')
    expect(m.indent).toBe('  ')
  })
})

describe('isDelimiterRow', () => {
  it('accepts the common variants', () => {
    expect(isDelimiterRow('| --- | :-: |')).toBe(true)
    expect(isDelimiterRow('---|---')).toBe(true)
    expect(isDelimiterRow('| a | b |')).toBe(false)
  })
})

describe('formatTable / normalizeTable', () => {
  it('normalizes a messy table to aligned columns', () => {
    expect(normalizeTable(MESSY)).toBe(CLEAN)
  })

  it('is idempotent', () => {
    const once = normalizeTable(MESSY)
    expect(normalizeTable(once)).toBe(once)
  })

  it('re-applies indent to every line', () => {
    const out = normalizeTable('  | a | b |\n  | --- | --- |\n  | 1 | 2 |')
    for (const line of out.split('\n')) expect(line.startsWith('  |')).toBe(true)
  })

  it('right-aligned columns pad on the left', () => {
    const out = normalizeTable('| n |\n| ---: |\n| 7 |\n| 1234 |')
    expect(out).toContain('|    7 |')
  })
})

describe('cell geometry', () => {
  it('cell content ranges within a table, delimiter row skipped', () => {
    const text = '| ab | c |\n| --- | --- |\n| 1 | 23 |'
    const cells = tableCellRanges(text)
    const slice = (r: { from: number; to: number }): string => text.slice(r.from, r.to)
    expect(cells.map(slice)).toEqual(['ab', 'c', '1', '23'])
  })

  it('empty cells yield collapsed ranges at their content position', () => {
    const text = '| a |   |\n| --- | --- |\n|  | b |'
    const cells = tableCellRanges(text)
    expect(cells).toHaveLength(4)
    expect(cells[1]?.from).toBe(cells[1]?.to)
    expect(cells[2]?.from).toBe(cells[2]?.to)
  })

  it('escaped pipes do not split cells', () => {
    const line = '| a \\| b | c |'
    const cells = cellRangesOfLine(line)
    expect(cells.map((r) => line.slice(r.from, r.to))).toEqual(['a \\| b', 'c'])
  })
})

describe('transforms', () => {
  const model = parseTable(CLEAN)

  it('insertColumn adds an empty column everywhere', () => {
    const m = insertColumn(model, 1)
    expect(m.header).toEqual(['Name', '', 'Qty', 'Price'])
    expect(m.align).toEqual([null, null, 'center', 'right'])
    expect(m.rows[0]).toEqual(['apple', '', '3', '1.20'])
  })

  it('deleteColumn removes a column but never the last one', () => {
    const m = deleteColumn(model, 0)
    expect(m.header).toEqual(['Qty', 'Price'])
    expect(deleteColumn(deleteColumn(m, 0), 0).header).toEqual(['Price'])
  })

  it('cycleAlign walks none → left → center → right → none', () => {
    let m = model
    const seen = []
    for (let i = 0; i < 4; i++) {
      m = cycleAlign(m, 0)
      seen.push(m.align[0])
    }
    expect(seen).toEqual(['left', 'center', 'right', null])
  })

  it('insertRow adds an empty row after the given body index', () => {
    const m = insertRow(model, 0)
    expect(m.rows).toEqual([
      ['apple', '3', '1.20'],
      ['', '', ''],
      ['pear', '12', '0.85']
    ])
    expect(insertRow(model, -1).rows[0]).toEqual(['', '', ''])
  })
})
