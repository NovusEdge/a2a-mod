import type { ClientElements, RenderElement } from 'claude-code'
import type { RecentState } from '../../types/index.d.ts'
import { isRunning } from '../recent.ts'
import type { Palette } from './color.ts'
import { bar, clock, fit, gradient, runs, shimmer, spinner, wire, type Cell, type Direction } from './fx.ts'
import { STATES } from './states.ts'

/** Box and Text: what every surface's table and a client's elements have alike. */
export type Els = Pick<ClientElements, 'Box' | 'Text'>

export function cellsOf(el: Els, cells: readonly Cell[]): RenderElement[] {
  const { Text } = el
  return runs(cells).map(c => <Text {...(c.color ? { color: c.color } : {})} {...(c.bold ? { bold: true } : {})}>{c.text}</Text>)
}

export function lines(el: Els, rows: readonly (readonly Cell[])[]): RenderElement {
  const { Box } = el
  return <Box flexDirection="column">{rows.map(r => <Box>{cellsOf(el, r)}</Box>)}</Box>
}

export type RowProps = {
  text: string
  state: RecentState
  startedAt: number
  /** The hook's Date.now when it drew: elapsed time for a still frame. */
  now: number
  progress: number | null
  /** Replaces the elapsed time, or the state's label once the task ended. */
  tail: string | null
  width: number
  anim: boolean
  pal: Palette
}

export type Tick = { fast: number; slow: number; elapsedMs: number; dim: boolean }

export const stillTick = (p: RowProps): Tick => ({ fast: 0, slow: 0, elapsedMs: p.now - p.startedAt, dim: false })

/** A task row: glyph, text, then elapsed time or label on one line; a bar under a running one. */
export function rowLines(p: RowProps, t: Tick): Cell[][] {
  const running = isRunning(p.state)
  const look = STATES[p.state]
  const glyph: Cell = running
    ? { text: p.anim ? spinner(t.fast) : '●', color: look.color }
    : { text: look.glyph, color: t.dim ? 'inactive' : look.color }
  const tail = p.tail ?? (running ? clock(t.elapsedMs) : look.label)
  const room = Math.max(1, p.width - 3 - [...tail].length)
  const label = fit(p.text, room)
  const labelCells: Cell[] = running && p.anim ? shimmer(label, t.fast, p.pal) : [{ text: label, ...(running ? {} : { color: 'inactive' }) }]
  const pad = ' '.repeat(Math.max(0, room - [...label].length))
  const first: Cell[] = [glyph, { text: ' ' }, ...labelCells, { text: `${pad} ` }, { text: tail, ...(running ? {} : { color: look.color }) }]
  if (!running) return [first]
  const pct = p.progress === null ? '' : ` ${String(Math.round(p.progress)).padStart(3)}%`
  const second: Cell[] = [{ text: '  ' }, ...bar(Math.max(1, p.width - 2 - pct.length), p.anim ? t.slow : 0, p.progress ?? undefined), ...(pct ? [{ text: pct, color: 'success' }] : [])]
  return [first, second]
}

export type WireProps = { names: string[]; more: number; dir: Direction; anim: boolean; pal: Palette }

const WIRE_LEN = 8
const NAME_MAX = 16

/** `Claude ┄●┄ alias ┄┄ alias +N`: live and waiting workers, the packet on Claude's segment. */
export function wireCells(p: WireProps, slow: number, phase: number): Cell[] {
  const cells: Cell[] = [{ text: 'Claude', bold: true }, { text: ' ' }, ...wire(WIRE_LEN, p.anim ? slow : 0, p.dir)]
  p.names.forEach((name, i) => {
    cells.push({ text: i ? ' ┄┄ ' : ' ', ...(i ? { color: 'inactive' } : {}) }, ...gradient(fit(name, NAME_MAX), p.anim ? phase / 8 : 0, p.pal))
  })
  if (p.more) cells.push({ text: ` +${p.more}`, color: 'inactive' })
  return cells
}
