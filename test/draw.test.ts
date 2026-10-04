import { test, expect } from 'claude-code/testing'
import { palette } from '../hooks/ui/color.ts'
import { rowLines, stillTick, wireCells, type RowProps } from '../hooks/ui/draw.tsx'
import type { Cell } from '../hooks/ui/fx.ts'

const pal = palette('dark')
const width = (cells: Cell[]) => cells.reduce((n, c) => n + [...c.text].length, 0)
const text = (cells: Cell[]) => cells.map(c => c.text).join('')
const ROW: RowProps = { text: 'k6 checkout at 500 rps for two minutes', state: 'working', startedAt: 0, now: 42_000, progress: null, tail: null, width: 40, anim: true, pal }

test('a running row is glyph, text and elapsed time, with a bar under it, each exactly the width', () => {
  const [first, second] = rowLines(ROW, { fast: 3, slow: 2, elapsedMs: 42_000, dim: false })
  expect(width(first!)).toBe(40)
  expect(width(second!)).toBe(40)
  expect(text(first!).endsWith('0:42')).toBe(true)
  expect(first![0]).toEqual({ text: '⠸', color: 'warning' })
})

test('a still frame draws the static dot and an unlit bar position', () => {
  const [first] = rowLines({ ...ROW, anim: false }, stillTick({ ...ROW, anim: false }))
  expect(first![0]).toEqual({ text: '●', color: 'warning' })
  expect(text(first!).endsWith('0:42')).toBe(true)
})

test('a reported percent makes the bar determinate', () => {
  const [, second] = rowLines({ ...ROW, progress: 42 }, stillTick(ROW))
  expect(text(second!).endsWith('  42%')).toBe(true)
  expect(width(second!)).toBe(40)
})

test('a finished row is one line with its glyph, colour and label', () => {
  const rows = rowLines({ ...ROW, state: 'completed' }, stillTick(ROW))
  expect(rows.length).toBe(1)
  expect(rows[0]![0]).toEqual({ text: '✓', color: 'success' })
  expect(rows[0]![2]).toEqual({ text: 'k6 checkout at 500 rps for …', color: 'inactive' })
  expect(text(rows[0]!).endsWith('completed')).toBe(true)
  expect(width(rows[0]!)).toBe(40)
})

test('a tail replaces the elapsed time or label', () => {
  const [first] = rowLines({ ...ROW, tail: 'canceling…' }, stillTick(ROW))
  expect(text(first!).endsWith('canceling…')).toBe(true)
})

test('the wire names at most the workers it is given, then +N', () => {
  const cells = wireCells({ names: ['loadtest-bot', 'translator'], more: 3, dir: 'out', anim: true, pal }, 2, 0)
  expect(text(cells)).toBe('Claude ┄┄●┄┄┄┄┄ loadtest-bot ┄┄ translator +3')
})
