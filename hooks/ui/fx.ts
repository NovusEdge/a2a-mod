// Frame maths ported from docs/superpowers/mockups/effects.html. Each function returns one cell
// per character; `runs` merges them before they become Text elements.
import { printable } from '../format.ts'
import { mix, type Palette } from './color.ts'
import { DOTS } from './frames.ts'

export type Cell = { text: string; color?: string; bold?: boolean }

export const FAST_MS = 80
export const SLOW_MS = 120
export const PHASE_MS = 1000
export const PULSE_MS = 1000

/** One cell per run of neighbours with the same style: a client is refused past ~1,500 coloured cells. */
export function runs(cells: readonly Cell[]): Cell[] {
  const out: Cell[] = []
  for (const c of cells) {
    const last = out.at(-1)
    if (last && last.color === c.color && last.bold === c.bold) out[out.length - 1] = { ...last, text: last.text + c.text }
    else out.push({ ...c })
  }
  return out
}

export const spinner = (frame: number): string => DOTS.frames[frame % DOTS.frames.length]!

export function shimmer(text: string, frame: number, pal: Palette): Cell[] {
  const chars = [...text]
  const pos = (frame % (chars.length + 12)) - 6
  return chars.map((ch, i) => ({ text: ch, color: mix(pal.dim, pal.text, Math.max(0, 1 - Math.abs(i - pos) / 5)) }))
}

export function gradient(text: string, phase: number, pal: Palette): Cell[] {
  const chars = [...text]
  return chars.map((ch, i) => ({ text: ch, bold: true, color: mix(pal.from, pal.to, (Math.sin((i / chars.length + phase) * Math.PI * 2) + 1) / 2) }))
}

const EIGHTHS = '▏▎▍▌▋▊▉█'

/** Indeterminate (a 6-cell block bouncing) without `pct`; determinate, in eighth blocks, with it. */
export function bar(width: number, frame: number, pct?: number): Cell[] {
  if (pct === undefined) {
    const span = Math.min(6, width)
    const room = width - span
    const off = room ? Math.abs((frame % (2 * room)) - room) : 0
    return [...Array(width)].map((_, i) => (i >= room - off && i < room - off + span ? { text: '█', color: 'warning' } : { text: '░', color: 'inactive' }))
  }
  const fill = (Math.min(100, Math.max(0, pct)) / 100) * width
  const full = Math.floor(fill)
  const part = Math.floor((fill - full) * 8)
  return [...Array(width)].map((_, i) =>
    i < full ? { text: '█', color: 'success' } : i === full && part ? { text: EIGHTHS[part - 1]!, color: 'success' } : { text: '░', color: 'inactive' })
}

export type Direction = 'out' | 'back' | 'idle'

/** The wire segment between Claude and the first worker; the packet runs out after a send, back after a result. */
export function wire(len: number, frame: number, dir: Direction): Cell[] {
  const p = frame % len
  return [...Array(len)].map((_, i) => {
    const at = dir === 'out' ? i === p : dir === 'back' ? i === len - 1 - p : false
    return at ? { text: '●', color: dir === 'out' ? 'warning' : 'success' } : { text: '┄', color: 'inactive' }
  })
}

/** About 60 characters a frame, and done within 1.5 s however long the text. */
export const typeStep = (length: number) => Math.max(60, Math.ceil(length / Math.floor(1500 / FAST_MS)))
export const typed = (text: string, frame: number) => text.slice(0, Math.min(text.length, frame * typeStep(text.length)))

const TICKS = '▁▂▃▄▅▆▇█'
export const sparkline = (durations: readonly number[]) => {
  const top = Math.max(...durations, 1)
  return durations.map(d => TICKS[Math.round((d / top) * 7)]).join('')
}

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`
}

/** Cuts to `width` cells with an ellipsis. One cell per code point: CJK and emoji are not measured. */
export function fit(text: string, width: number): string {
  const chars = [...printable(text).replace(/\s+/g, ' ').trim()]
  if (chars.length <= width) return chars.join('')
  return width <= 1 ? chars.slice(0, width).join('') : `${chars.slice(0, width - 1).join('')}…`
}
