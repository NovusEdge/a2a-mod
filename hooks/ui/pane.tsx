import type { ElementTable, RenderElement, RenderSurface, UiPressArgument } from 'claude-code'
import type { PaneView, RecentTask, Worker } from '../../types/index.d.ts'
import { isRunning, isWaiting } from '../recent.ts'
import type { Palette } from './color.ts'
import { cellsOf, lines, rowLines, stillTick, type RowProps } from './draw.tsx'
import { fit, gradient, PULSE_MS, sparkline } from './fx.ts'
import { STATES } from './states.ts'
import { statusText } from './status.ts'

export const NARROW = 40

/** The elements a pane needs; Input and Client are absent where the surface has none. */
export type PaneEls = Pick<ElementTable<'mobile'>, 'Box' | 'Text' | 'Button' | 'Markdown'> & Partial<Pick<ElementTable<'terminal'>, 'Input' | 'Client'>>

export type PaneData = {
  surface: RenderSurface
  width: number
  now: number
  anim: boolean
  pal: Palette
  workers: Worker[]
  rows: RecentTask[]
  durations: Record<string, number[]>
  view: PaneView
  drafts: ReadonlyMap<string, string>
}

export type PaneActions = {
  cancel(t: RecentTask): void
  toggleOpen(t: RecentTask): void
  copy(t: RecentTask, press: UiPressArgument): void
  startReply(t: RecentTask): void
  draft(t: RecentTask, text: string): void
  send(t: RecentTask, text: string): void
  discard(t: RecentTask): void
}

export const hasClient = (s: RenderSurface) => s === 'terminal' || s === 'desktop'

export function rowProps(t: RecentTask, d: Pick<PaneData, 'now' | 'anim' | 'pal'>, width: number, narrow: boolean): RowProps {
  const tail = t.canceling ? 'canceling…' : narrow && !isRunning(t.state) ? STATES[t.state].short : null
  return { text: t.text || t.taskId, state: t.state, startedAt: t.startedAt, now: d.now, progress: t.progress ?? null, tail, width, anim: d.anim, pal: d.pal }
}

function taskRow(el: PaneEls, t: RecentTask, d: PaneData, act: PaneActions): RenderElement {
  const { Box, Text, Button, Markdown, Input, Client } = el
  const narrow = d.width < NARROW
  const props = rowProps(t, d, d.width, narrow)
  const live = isRunning(t.state) || d.now - t.changedAt < PULSE_MS
  const row = Client && hasClient(d.surface) && live
    ? <Client key={`row:${t.taskId}`} module="./row.tsx" props={props} width={d.width} />
    : lines(el, rowLines(props, stillTick(props)))
  const isOpen = d.view.open.includes(t.taskId)
  // Mobile draws no field yet; its table may still hand out an Input that the surface refuses.
  const canInput = Input !== undefined && d.surface !== 'mobile'
  const replying = canInput && isWaiting(t.state) && d.view.replying.includes(t.taskId)
  const buttons: RenderElement[] = []
  if ((isRunning(t.state) || isWaiting(t.state)) && !t.canceling) buttons.push(<Button key={`cancel:${t.taskId}`} label={narrow ? '✕' : 'Cancel'} onPress={() => act.cancel(t)} />)
  if (t.result) buttons.push(<Button key={`open:${t.taskId}`} label={narrow ? '↗' : isOpen ? 'Close' : 'Open'} onPress={() => act.toggleOpen(t)} />)
  if (canInput && isWaiting(t.state) && !replying) buttons.push(<Button key={`reply:${t.taskId}`} label={narrow ? '↩' : 'Reply'} onPress={() => act.startReply(t)} />)
  return (
    <Box flexDirection="column">
      {row}
      {t.answeredBy ? <Text dimColor>{fit(`  answered by ${t.answeredBy === 'user' ? 'you' : 'Claude'}`, d.width)}</Text> : null}
      {buttons.length ? <Box>{buttons}</Box> : null}
      {isOpen && t.result ? <Box flexDirection="column"><Markdown text={t.result} /><Box><Button key={`copy:${t.taskId}`} label="Copy" onPress={press => act.copy(t, press)} /></Box></Box> : null}
      {replying && Input ? (
        <Box>
          <Input key={`input:${t.taskId}`} placeholder="Reply to the worker" submitLabel="send" value={d.drafts.get(t.taskId) ?? ''}
            onInput={text => act.draft(t, text)} onSubmit={text => act.send(t, text)} />
          <Button key={`discard:${t.taskId}`} label="✕" onPress={() => act.discard(t)} />
        </Box>
      ) : null}
    </Box>
  )
}

function workerHead(el: PaneEls, alias: string, w: Worker | undefined, d: PaneData): RenderElement[] {
  const { Box, Text } = el
  const narrow = d.width < NARROW
  const name = fit(alias, Math.max(1, d.width - 12))
  const head = <Box>{cellsOf(el, gradient(name, 0, d.pal))}<Text dimColor>{w ? ` · A2A ${w.version}` : ' · removed'}</Text></Box>
  if (narrow || !w) return [head]
  const out = [head]
  const skills = w.skills.map(s => s.id).join(' · ')
  if (skills) out.push(<Text dimColor>{fit(skills, d.width)}</Text>)
  const runs = d.durations[alias] ?? []
  if (runs.length) {
    const avg = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length / 1000)
    out.push(<Text dimColor>{fit(`${sparkline(runs)} avg ${avg}s`, d.width)}</Text>)
  }
  return out
}

export function paneTree(el: PaneEls, d: PaneData, act: PaneActions): RenderElement {
  const { Box, Text } = el
  if (!d.workers.length && !d.rows.length) {
    return (
      <Box flexDirection="column">
        <Text>{fit('No workers yet. /a2a add <url>', d.width)}</Text>
        <Text dimColor>{fit('  /a2a add https://agent.example.com', d.width)}</Text>
      </Box>
    )
  }
  const known = new Set(d.workers.map(w => w.alias))
  const gone = [...new Set(d.rows.map(t => t.worker).filter(a => !known.has(a)))]
  const groups: [string, Worker | undefined][] = [...d.workers.map((w): [string, Worker] => [w.alias, w]), ...gone.map((a): [string, undefined] => [a, undefined])]
  const summary = statusText(d.rows.filter(t => isRunning(t.state)).length, d.rows.filter(t => isWaiting(t.state)).length)
  return (
    <Box flexDirection="column">
      {summary ? <Text dimColor>{fit(summary, d.width)}</Text> : null}
      {groups.map(([alias, w]) => (
        <Box flexDirection="column" marginBottom={1}>
          {workerHead(el, alias, w, d)}
          {d.rows.filter(t => t.worker === alias).map(t => taskRow(el, t, d, act))}
        </Box>
      ))}
    </Box>
  )
}
