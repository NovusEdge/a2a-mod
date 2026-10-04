import type { ElementTable, RenderElement, RenderSurface, UiPressArgument } from 'claude-code'
import type { PaneView, RecentTask, Worker } from '../../types/index.d.ts'
import { isRunning, isWaiting } from '../recent.ts'
import type { Palette } from './color.ts'
import { cellsOf, lines, rowLines, stillTick, type RowProps } from './draw.tsx'
import { fit, gradient, PULSE_MS, sparkline, type Cell } from './fx.ts'
import { STATES } from './states.ts'

export const NARROW = 40
/** Below this the footer keeps only the add hint. */
const FOOTER_KEYS_MIN = 28
const KEYS = 'tab move · enter press · esc back'
// The full line is 33 cells and the 32-column pane has 30 inside its margins.
const KEYS_SHORT = 'tab move · enter · esc'

/** The elements a pane needs; Input and Client are absent where the surface has none. */
export type PaneEls = Pick<ElementTable<'mobile'>, 'Box' | 'Text' | 'Button' | 'Markdown'> & Partial<Pick<ElementTable<'terminal'>, 'Input' | 'Client'>>

export type PaneData = {
  surface: RenderSurface
  width: number
  /** The rows the body shows; the pane is at least this tall so the footer sits at the bottom. */
  height: number
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

/** `width` is the room inside the worker's box. */
function taskRow(el: PaneEls, t: RecentTask, d: PaneData, act: PaneActions, width: number): RenderElement {
  const { Box, Text, Button, Markdown, Input, Client } = el
  const narrow = d.width < NARROW
  const props = rowProps(t, d, width, narrow)
  const live = isRunning(t.state) || d.now - t.changedAt < PULSE_MS
  const row = Client && hasClient(d.surface) && live
    ? <Client key={`row:${t.taskId}`} module="./row.tsx" props={props} width={width} />
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
      {t.answeredBy ? <Text color="inactive">{fit(`  answered by ${t.answeredBy === 'user' ? 'you' : 'Claude'}`, width)}</Text> : null}
      {buttons.length ? <Box width={width} justifyContent="flex-end">{buttons}</Box> : null}
      {isOpen && t.result ? <Box flexDirection="column"><Markdown text={t.result} /><Box><Button key={`copy:${t.taskId}`} label="Copy" onPress={press => act.copy(t, press)} /></Box></Box> : null}
      {replying && Input ? (
        <Box width={width}>
          <Input key={`input:${t.taskId}`} placeholder="Reply to the worker" submitLabel="send" value={d.drafts.get(t.taskId) ?? ''}
            onInput={text => act.draft(t, text)} onSubmit={text => act.send(t, text)} />
          <Button key={`discard:${t.taskId}`} label="✕" onPress={() => act.discard(t)} />
        </Box>
      ) : null}
    </Box>
  )
}

const cellLen = (cells: readonly Cell[]) => cells.reduce((n, c) => n + [...c.text].length, 0)

/** `left` at the start of the line and `right` flush with its end, padded with spaces so the line is exactly `width` cells. */
function split(el: PaneEls, left: readonly Cell[], right: string, width: number): RenderElement {
  const { Box, Text } = el
  const tail = fit(right, Math.max(0, width - cellLen(left) - 1))
  const pad = ' '.repeat(Math.max(0, width - cellLen(left) - [...tail].length))
  return <Box>{cellsOf(el, left)}<Text>{pad}</Text><Text color="inactive">{tail}</Text></Box>
}

// The longest form that fits beside the title; `n workers · m live` down to `m live`.
function summaryFor(workers: number, live: number, room: number): string {
  const noun = (long: boolean) => (long ? `${workers} worker${workers === 1 ? '' : 's'}` : `${workers}w`)
  const forms = [
    live ? `${noun(true)} · ${live} live` : noun(true),
    live ? `${noun(false)} · ${live} live` : noun(false),
    live ? `${live} live` : '',
  ]
  return forms.find(s => [...s].length <= room) ?? ''
}

function workerHead(el: PaneEls, alias: string, w: Worker | undefined, d: PaneData, width: number): RenderElement[] {
  const { Text } = el
  const narrow = d.width < NARROW
  const version = w ? `A2A ${w.version}` : 'removed'
  const name = fit(alias, Math.max(1, width - [...version].length - 1))
  const head = split(el, gradient(name, 0, d.pal), version, width)
  if (narrow || !w) return [head]
  const out = [head]
  const skills = w.skills.map(s => s.id).join(' · ')
  if (skills) out.push(<Text color="inactive">{fit(skills, width)}</Text>)
  const runs = d.durations[alias] ?? []
  if (runs.length) {
    const avg = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length / 1000)
    out.push(<Text color="inactive">{fit(`${sparkline(runs)} avg ${avg}s`, width)}</Text>)
  }
  return out
}

/**
 * The slim pane, drawn to the body's own width and height: a title and summary, one rounded box per
 * worker, and a footer pushed to the bottom. Borders and rules are static elements outside any
 * Client, which is capped at about 1,500 coloured cells.
 */
export function paneTree(el: PaneEls, d: PaneData, act: PaneActions): RenderElement {
  const { Box, Text } = el
  const inner = Math.max(1, d.width - 2)
  // Inside the worker box: the border and a column of padding on each side.
  const content = Math.max(1, inner - 4)
  const frame = { width: d.width, minHeight: d.height, paddingX: 1, paddingTop: 1 } as const
  if (!d.workers.length && !d.rows.length) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} {...frame}>
        <Text color="inactive">Claude ┄┄ ·</Text>
        <Text>No workers yet</Text>
        <Text color="inactive">{'/a2a add <url>'}</Text>
      </Box>
    )
  }
  const known = new Set(d.workers.map(w => w.alias))
  const gone = [...new Set(d.rows.map(t => t.worker).filter(a => !known.has(a)))]
  const groups: [string, Worker | undefined][] = [...d.workers.map((w): [string, Worker] => [w.alias, w]), ...gone.map((a): [string, undefined] => [a, undefined])]
  const live = d.rows.filter(t => isRunning(t.state) || isWaiting(t.state)).length
  const title: Cell[] = [{ text: '⇄ ', color: 'inactive' }, ...gradient('a2a', 0, d.pal)]
  const rule = <Text color="inactive">{'─'.repeat(inner)}</Text>
  return (
    <Box flexDirection="column" {...frame}>
      {split(el, title, summaryFor(groups.length, live, inner - cellLen(title) - 1), inner)}
      {rule}
      <Box flexDirection="column" rowGap={1} marginTop={1}>
        {groups.map(([alias, w]) => (
          <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
            {workerHead(el, alias, w, d, content)}
            {d.rows.filter(t => t.worker === alias).map(t => taskRow(el, t, d, act, content))}
          </Box>
        ))}
      </Box>
      <Box flexGrow={1} />
      {rule}
      <Text color="inactive">{fit('/a2a add <url>', inner)}</Text>
      {d.width >= FOOTER_KEYS_MIN ? <Text color="inactive">{[...KEYS].length <= inner ? KEYS : KEYS_SHORT}</Text> : null}
    </Box>
  )
}
