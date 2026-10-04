import { test, expect } from 'claude-code/testing'
import { mix, palette } from '../hooks/ui/color.ts'
import { DOTS } from '../hooks/ui/frames.ts'
import { bar, clock, fit, gradient, runs, shimmer, sparkline, spinner, typed, wire, type Cell } from '../hooks/ui/fx.ts'
import { STATES, THEME_KEYS } from '../hooks/ui/states.ts'

const dark = palette('dark')
const text = (cells: Cell[]) => cells.map(c => c.text).join('')

test('mix runs from one colour to the other and clamps', () => {
  expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
  expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
  expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
  expect(mix('#102030', '#ffffff', 7)).toBe('#ffffff')
})

test('the palette follows light and dark themes', () => {
  expect(palette('light').text).not.toBe(palette('dark').text)
  expect(palette('light-daltonized').text).toBe(palette('light').text)
  expect(palette(undefined).text).toBe(dark.text)
})

test('every state draws in a theme key, never a raw colour', () => {
  for (const look of Object.values(STATES)) expect(THEME_KEYS).toContain(look.color)
})

test('the spinner is cli-spinners dots at 80 ms', () => {
  expect(DOTS.interval).toBe(80)
  expect(DOTS.frames.length).toBe(10)
  expect(spinner(0)).toBe('⠋')
  expect(spinner(10)).toBe('⠋')
})

test('runs merges neighbours of one style and keeps the text', () => {
  const cells: Cell[] = [{ text: 'a', color: 'x' }, { text: 'b', color: 'x' }, { text: 'c', color: 'y' }, { text: 'd', color: 'x' }]
  expect(runs(cells)).toEqual([{ text: 'ab', color: 'x' }, { text: 'c', color: 'y' }, { text: 'd', color: 'x' }])
})

test('a full running row merges far below the client cell limit', () => {
  const cells = [...shimmer('x'.repeat(200), 30, dark), ...bar(40, 7), ...gradient('loadtest-bot', 0.3, dark)]
  expect(runs(cells).length).toBeLessThan(40)
  expect(text(runs(cells))).toBe(text(cells))
})

test('shimmer is brightest at its band and dim elsewhere', () => {
  const cells = shimmer('working…', 6, dark)
  expect(cells[0]?.color).toBe(dark.text)
  expect(cells[7]?.color).toBe(dark.dim)
})

test('bars are exactly their width, and a percent fills in eighths', () => {
  for (const f of [0, 5, 17, 40]) expect(bar(24, f).length).toBe(24)
  const half = bar(24, 0, 50)
  expect(text(half)).toBe(`${'█'.repeat(12)}${'░'.repeat(12)}`)
  expect(text(bar(8, 0, 56.25))).toBe('████▌░░░')
  expect(text(bar(3, 0))).toBe('███')
})

test('the wire packet runs out, back, or not at all', () => {
  expect(text(wire(5, 1, 'out'))).toBe('┄●┄┄┄')
  expect(text(wire(5, 1, 'back'))).toBe('┄┄┄●┄')
  expect(text(wire(5, 1, 'idle'))).toBe('┄┄┄┄┄')
})

test('the typewriter shows about 60 characters a frame and finishes within 1.5 s', () => {
  expect(typed('x'.repeat(100), 1).length).toBe(60)
  const long = 'y'.repeat(8000)
  expect(typed(long, Math.ceil(1500 / 80))).toBe(long)
})

test('sparkline, clock and fit', () => {
  expect(sparkline([10, 20, 40])).toBe('▃▅█')
  expect(clock(42_000)).toBe('0:42')
  expect(clock(3_725_000)).toBe('1:02:05')
  expect(fit('a  long\ntask text', 8)).toBe('a long …')
  expect(fit('short', 8)).toBe('short')
})
