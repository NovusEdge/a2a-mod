import type { ElementTable, RenderElement, RenderSurface } from 'claude-code'
import type { RecentTask } from '../../types/index.d.ts'
import { isOpen, isRunning, isWaiting, SHOW_MS } from '../recent.ts'
import type { Palette } from './color.ts'
import { lines, wireCells, type WireProps } from './draw.tsx'
import { fit, type Direction } from './fx.ts'
import { hasClient } from './pane.tsx'
import { STATES } from './states.ts'

export type BandEls = Pick<ElementTable<'mobile'>, 'Box' | 'Text'> & Partial<Pick<ElementTable<'terminal'>, 'Client'>>

export type BandData = { surface: RenderSurface; width: number; now: number; anim: boolean; pal: Palette; rows: RecentTask[] }

const NAMES_MAX = 4
// How long the packet runs back after the last running task ends.
export const BACK_MS = 2000

/** Out after the newest send, back after the newest result, idle once nothing runs and the return has played. */
export function direction(rows: readonly RecentTask[], now: number): Direction {
  const ended = Math.max(0, ...rows.map(t => t.endedAt ?? 0))
  if (!rows.some(t => isRunning(t.state))) return ended && now - ended < BACK_MS ? 'back' : 'idle'
  const sent = Math.max(...rows.map(t => t.startedAt))
  return ended > sent ? 'back' : 'out'
}

/** Ms until the pane or band next changes with no state change to trigger it: a row ages out, or the return packet rests. */
export function nextRedraw(rows: readonly RecentTask[], now: number, withReturn: boolean): number | undefined {
  const due = rows.filter(t => !isOpen(t)).map(t => (t.endedAt ?? t.startedAt) + SHOW_MS)
  const ended = Math.max(0, ...rows.map(t => t.endedAt ?? 0))
  if (withReturn && ended && !rows.some(t => isRunning(t.state)) && now - ended < BACK_MS) due.push(ended + BACK_MS)
  return due.length ? Math.max(0, Math.min(...due) - now) : undefined
}

/** Workers with running or waiting tasks first, then those that finished lately. */
export function wireProps(d: BandData): WireProps {
  const names = [...new Set([...d.rows.filter(isOpen), ...d.rows].map(t => t.worker))]
  return { names: names.slice(0, NAMES_MAX), more: Math.max(0, names.length - NAMES_MAX), dir: direction(d.rows, d.now), anim: d.anim, pal: d.pal }
}

function chip(el: BandEls, t: RecentTask): RenderElement {
  const { Box, Text } = el
  const look = STATES[t.state]
  const what = isWaiting(t.state) ? 'waiting on Claude' : fit(t.text, 24)
  return <Box><Text color={look.color}>{isRunning(t.state) ? '●' : look.glyph}</Text><Text>{` ${t.worker} · ${what}`}</Text></Box>
}

/** The wire, one chip per running or waiting task, then whatever the hooks beneath drew. */
export function bandTree(el: BandEls, d: BandData, theirs: RenderElement | undefined): RenderElement {
  const { Box, Client } = el
  const wire = wireProps(d)
  return (
    <Box flexDirection="column">
      {Client && hasClient(d.surface) ? <Client key="wire" module="./wire.tsx" props={wire} /> : lines(el, [wireCells(wire, 0, 0)])}
      <Box flexWrap="wrap" columnGap={3}>{d.rows.filter(isOpen).map(t => chip(el, t))}</Box>
      {theirs ?? null}
    </Box>
  )
}
