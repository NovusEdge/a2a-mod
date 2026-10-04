import type { ElementTable, RenderElement, RenderSurface } from 'claude-code'
import type { RecentState, Worker } from '../../types/index.d.ts'
import { printable } from '../format.ts'
import { isRunning } from '../recent.ts'
import type { Palette } from './color.ts'
import { cellsOf, lines, rowLines, stillTick, type RowProps } from './draw.tsx'
import { fit, gradient } from './fx.ts'
import { hasClient } from './pane.tsx'
import { STATES } from './states.ts'

export type CardEls = Pick<ElementTable<'mobile'>, 'Box' | 'Text'> & Partial<Pick<ElementTable<'terminal'>, 'Client'>>

/** A tool result as text, whatever shape the engine stored it in. */
export function textOf(output: unknown): string {
  return printable(rawText(output))
}

function rawText(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output.map(rawText).filter(Boolean).join('\n')
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (typeof o.text === 'string') return o.text
    if (typeof o.result === 'string') return o.result
    if ('content' in o) return rawText(o.content)
  }
  return output === undefined || output === null ? '' : JSON.stringify(output)
}

export function badge(state: RecentState | undefined, isErrored: boolean): { label: string; color: string } {
  if (!state) return isErrored ? { label: 'failed', color: 'error' } : { label: 'done', color: 'inactive' }
  if (isRunning(state)) return { label: 'tracked in background', color: 'warning' }
  const look = STATES[state]
  return { label: state === 'rejected' ? 'failed' : look.label, color: look.color }
}

export type UseCard = {
  surface: RenderSurface
  width: number
  anim: boolean
  pal: Palette
  now: number
  alias: string
  worker: Worker | undefined
  message: string
  isRunning: boolean
  startedAt: number
}

/** `⇢ alias · A2A 1.0 · Org`, the message on one dim line, and while it runs an animated row. */
export function useCard(el: CardEls, d: UseCard): RenderElement {
  const { Box, Text, Client } = el
  const meta = [d.worker ? `A2A ${d.worker.version}` : '', d.worker?.organization ? fit(d.worker.organization, 60) : ''].filter(Boolean).join(' · ')
  const props: RowProps = { text: 'working…', state: 'working', startedAt: d.startedAt, now: d.now, progress: null, tail: null, width: d.width, anim: d.anim, pal: d.pal }
  return (
    <Box flexDirection="column">
      <Box><Text color="inactive">⇢ </Text>{cellsOf(el, gradient(fit(d.alias, 24), 0, d.pal))}{meta ? <Text dimColor>{` · ${meta}`}</Text> : null}</Box>
      <Text dimColor>{fit(`"${d.message}"`, d.width)}</Text>
      {d.isRunning
        ? Client && hasClient(d.surface)
          ? <Client key="run" module="./row.tsx" props={props} width={d.width} />
          : lines(el, rowLines(props, stillTick(props)))
        : null}
    </Box>
  )
}

export type ResultCard = {
  surface: RenderSurface
  anim: boolean
  state: RecentState | undefined
  isErrored: boolean
  text: string
  /** Typewriter key: the task id, or the call id for a reply that came back as a message. */
  playId: string
  played: boolean
}

function resultBody(el: CardEls, d: ResultCard, clientKey: string): RenderElement {
  const { Text, Client } = el
  const types = d.state === 'completed' && d.anim && !d.played && hasClient(d.surface)
  return types && Client
    ? <Client key={clientKey} module="./typewriter.tsx" props={{ id: d.playId, text: d.text, anim: true }} />
    : <Text>{d.text}</Text>
}

/** A state badge, then the result; a completed result types itself in once. */
export function resultCard(el: CardEls, d: ResultCard): RenderElement {
  const { Box, Text } = el
  const b = badge(d.state, d.isErrored)
  return (
    <Box flexDirection="column">
      <Text color={b.color}>{b.label}</Text>
      {resultBody(el, d, 'type')}
    </Box>
  )
}
