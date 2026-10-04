import type { ElementTable, RenderElement, RenderSurface, UiPressArgument } from 'claude-code'
import type { PaneView, RecentState, RecentTask, Worker } from '../../types/index.d.ts'
import { isOpen, isRunning, isWaiting } from '../recent.ts'
import type { Palette } from './color.ts'
import { barLine, cellLen, cellsOf, lines, splitLine, type BarProps } from './draw.tsx'
import { clip, fit, gradient, sparkline, type Cell } from './fx.ts'
import { STATES } from './states.ts'

export const NARROW = 40
/** Below this the footer keeps only the add hint. */
const FOOTER_KEYS_MIN = 28
const KEYS = 'tab move · enter press · esc back'
// The full line is 33 cells and the 32-column pane has 30 inside its margins.
const KEYS_SHORT = 'tab move · enter · esc'
/** Tasks listed in a box before `+N more`. */
export const BOX_TASKS = 3
const CLEAR = 'Clear done'
const REPLY_HINT = 'reply ↵'
/** A row keeps at least this many cells for its text before the state word at the right is dropped. */
const TEXT_MIN = 3
/** The task text starts after the glyph and a space; open detail lines up under it. */
const TEXT_COL = 2

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
  /** Tasks to list, newest first, with any the person cleared already left out. */
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
  toggleBox(alias: string): void
  toggleAll(alias: string): void
  clearDone(): void
}

export const hasClient = (s: RenderSurface) => s === 'terminal' || s === 'desktop'

const STATE_ORDER = Object.keys(STATES) as RecentState[]

/** `● 1  ? 1  ✓ 4`: a count per state glyph in the state table's colours, none for a state with no tasks. */
export function countCells(rows: readonly RecentTask[]): Cell[] {
  const byGlyph = new Map<string, { color: string; n: number }>()
  for (const s of STATE_ORDER) {
    const n = rows.filter(t => t.state === s).length
    if (!n) continue
    const look = STATES[s]
    byGlyph.set(look.glyph, { color: look.color, n: n + (byGlyph.get(look.glyph)?.n ?? 0) })
  }
  return [...byGlyph].flatMap(([glyph, c], i): Cell[] => [...(i ? [{ text: '  ' }] : []), { text: glyph, color: c.color }, { text: ` ${c.n}`, color: 'inactive' }])
}

/** Live tasks first, then the finished ones, each group newest first. */
export const ordered = (rows: readonly RecentTask[]): RecentTask[] => [...rows.filter(isOpen), ...rows.filter(t => !isOpen(t))]

const gap: Cell = { text: ' ' }

type Label = { key: string; full: string; short: string; onPress: (press: UiPressArgument) => void }

function taskRow(el: PaneEls, t: RecentTask, d: PaneData, act: PaneActions, width: number): RenderElement {
  const { Box, Text, Button, Markdown, Input, Client } = el
  const running = isRunning(t.state)
  const waiting = isWaiting(t.state)
  const look = STATES[t.state]
  const narrow = d.width < NARROW
  // Mobile draws no field yet; its table may still hand out an Input that the surface refuses.
  const canInput = Input !== undefined && d.surface !== 'mobile'
  const tailText = t.canceling ? 'canceling…' : running ? '' : waiting && canInput ? REPLY_HINT : narrow ? look.short : look.label
  const tail = tailText && width - TEXT_COL - 1 - [...tailText].length >= TEXT_MIN ? tailText : ''
  const room = Math.max(1, width - TEXT_COL - (tail ? [...tail].length + 1 : 0))
  const label = fit(t.text || t.taskId, room)
  const pad = ' '.repeat(Math.max(0, room - [...label].length) + (tail ? 1 : 0))
  const tailColor = t.canceling ? 'inactive' : waiting ? 'suggestion' : look.color
  const isShown = d.view.open.includes(t.taskId)
  const replying = canInput && waiting && d.view.replying.includes(t.taskId)

  const actions: Label[] = []
  if (!running && !waiting && t.result) actions.push({ key: 'copy', full: 'Copy', short: '⧉', onPress: press => act.copy(t, press) })
  if (waiting && canInput && !replying) actions.push({ key: 'reply', full: 'Reply', short: '↩', onPress: () => act.startReply(t) })
  if ((running || waiting) && !t.canceling) actions.push({ key: 'cancel', full: 'Cancel', short: '✕', onPress: () => act.cancel(t) })
  // A Button draws `[ label ]`; full words when they fit one column apart, glyphs when they do not.
  const room2 = width - TEXT_COL
  const fullWidth = actions.reduce((n, a) => n + [...a.full].length + 4, 0) + Math.max(0, actions.length - 1)
  const useFull = fullWidth <= room2

  const bar: BarProps = { startedAt: t.startedAt, now: d.now, progress: t.progress ?? null, width, anim: d.anim }
  const body = running ? t.message : t.result
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={look.color}>{`${running ? '●' : look.glyph} `}</Text>
        <Button key={`open:${t.taskId}`} plain {...(running || waiting ? {} : { dimColor: true as const })} label={label} onPress={() => act.toggleOpen(t)} />
        {pad || tail ? <Text color={tailColor}>{`${pad}${tail}`}</Text> : null}
      </Box>
      {running ? (Client && hasClient(d.surface)
        ? <Client key={`row:${t.taskId}`} module="./runbar.tsx" props={bar} width={width} />
        : lines(el, [barLine(bar, 0, d.now - t.startedAt)])) : null}
      {isShown ? (
        <Box flexDirection="column" marginLeft={TEXT_COL}>
          {t.answeredBy ? <Text color="inactive">{fit(`answered by ${t.answeredBy === 'user' ? 'you' : 'Claude'}`, width - TEXT_COL)}</Text> : null}
          {body ? <Markdown text={body} /> : null}
          {replying && Input ? (
            <Box>
              <Input key={`input:${t.taskId}`} placeholder="Reply to the worker" submitLabel="send" value={d.drafts.get(t.taskId) ?? ''}
                onInput={text => act.draft(t, text)} onSubmit={text => act.send(t, text)} />
              <Button key={`discard:${t.taskId}`} label="✕" onPress={() => act.discard(t)} />
            </Box>
          ) : actions.length ? (
            <Box>
              {actions.flatMap((a, i) => [
                ...(i ? [<Text> </Text>] : []),
                <Button key={`${a.key}:${t.taskId}`} label={useFull ? a.full : a.short} onPress={a.onPress} />,
              ])}
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  )
}

const split = (el: PaneEls, left: readonly Cell[], right: string, width: number) => {
  const head = clip(left, width)
  return splitLine(el, head, [{ text: fit(right, Math.max(0, width - cellLen(head) - 1)), color: 'inactive' }], width)
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
  const name = fit(alias, Math.max(1, width - 2 - [...version].length - 1))
  const head = split(el, [{ text: '▾ ', color: 'inactive' }, ...gradient(name, 0, d.pal)], version, width)
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

/** `▸ alias` with the state counts flush right: a folded box is this one line. */
function foldedHead(el: PaneEls, alias: string, rows: readonly RecentTask[], d: PaneData, width: number): RenderElement {
  const counts = clip(countCells(rows), Math.max(0, width - 4))
  const name = fit(alias, Math.max(1, width - 2 - cellLen(counts) - (counts.length ? 1 : 0)))
  return splitLine(el, clip([{ text: '▸ ', color: 'inactive' }, ...gradient(name, 0, d.pal)], width), counts, width)
}

function workerBox(el: PaneEls, alias: string, w: Worker | undefined, rows: RecentTask[], d: PaneData, act: PaneActions, width: number): RenderElement {
  const { Box, Button } = el
  const folded = d.view.collapsed.includes(alias)
  const all = d.view.all.includes(alias)
  const list = ordered(rows)
  const shown = all ? list : list.slice(0, BOX_TASKS)
  const hidden = list.length - BOX_TASKS
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
      {folded ? foldedHead(el, alias, rows, d, width) : (
        <Box flexDirection="column">
          {workerHead(el, alias, w, d, width)}
          {shown.map(t => taskRow(el, t, d, act, width))}
          {hidden > 0 ? (
            <Box marginLeft={TEXT_COL}>
              <Button key={`more:${alias}`} plain dimColor label={all ? 'show less' : `+${hidden} more`} onPress={() => act.toggleAll(alias)} />
            </Box>
          ) : null}
        </Box>
      )}
    </Box>
  )
}

/** `Claude`, then a branch per worker: its alias presses to fold the box, its counts are coloured text beside it. */
function agentTree(el: PaneEls, groups: [string, Worker | undefined][], d: PaneData, act: PaneActions, inner: number): RenderElement {
  const { Box, Text, Button } = el
  return (
    <Box flexDirection="column">
      <Text bold>{fit('Claude', inner)}</Text>
      {groups.map(([alias], i) => {
        const counts = clip(countCells(d.rows.filter(t => t.worker === alias)), Math.max(0, inner - 5))
        const name = fit(alias, Math.max(1, inner - 3 - cellLen(counts) - (counts.length ? 1 : 0)))
        return (
          <Box>
            <Text color="inactive">{i === groups.length - 1 ? '└─ ' : '├─ '}</Text>
            <Button key={`branch:${alias}`} plain label={name} onPress={() => act.toggleBox(alias)} />
            {counts.length ? cellsOf(el, [gap, ...counts]) : null}
          </Box>
        )
      })}
    </Box>
  )
}

/**
 * The slim pane, drawn to the body's own width and height: a title and summary, the agent tree, one
 * rounded box per worker, and a footer pushed to the bottom. Borders and the tree are static elements
 * outside any Client, which is capped at about 1,500 coloured cells; only a running row's bar animates.
 */
export function paneTree(el: PaneEls, d: PaneData, act: PaneActions): RenderElement {
  const { Box, Text, Button } = el
  const inner = Math.max(1, d.width - 2)
  // Inside the worker box: the border and a column of padding on each side.
  const content = Math.max(1, inner - 4)
  const frame = { width: d.width, minHeight: d.height, paddingX: 1, paddingTop: 1 } as const
  if (!d.workers.length && !d.rows.length) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} {...frame}>
        <Text color="inactive">{fit('Claude ┄┄ ·', inner)}</Text>
        <Text>{fit('No workers yet', inner)}</Text>
        <Text color="inactive">{fit('/a2a add <url>', inner)}</Text>
      </Box>
    )
  }
  const known = new Set(d.workers.map(w => w.alias))
  const gone = [...new Set(d.rows.map(t => t.worker).filter(a => !known.has(a)))]
  const groups: [string, Worker | undefined][] = [...d.workers.map((w): [string, Worker] => [w.alias, w]), ...gone.map((a): [string, undefined] => [a, undefined])]
  const live = d.rows.filter(isOpen).length
  const title: Cell[] = clip([{ text: '⇄ ', color: 'inactive' }, ...gradient('a2a', 0, d.pal)], inner)
  const rule = <Text color="inactive">{'─'.repeat(inner)}</Text>
  const canClear = d.rows.some(t => !isOpen(t)) && CLEAR.length <= inner
  const head = split(el, title, summaryFor(groups.length, live, inner - cellLen(title) - 1), inner)
  return (
    <Box flexDirection="column" {...frame}>
      {head}
      {rule}
      {canClear ? (
        <Box>
          <Text>{' '.repeat(inner - CLEAR.length)}</Text>
          <Button key="clear-done" plain dimColor label={CLEAR} onPress={() => act.clearDone()} />
        </Box>
      ) : null}
      {agentTree(el, groups, d, act, inner)}
      <Box flexDirection="column" rowGap={1} marginTop={1}>
        {groups.map(([alias, w]) => workerBox(el, alias, w, d.rows.filter(t => t.worker === alias), d, act, content))}
      </Box>
      <Box flexGrow={1} />
      {rule}
      <Text color="inactive">{fit('/a2a add <url>', inner)}</Text>
      {d.width >= FOOTER_KEYS_MIN ? <Text color="inactive">{[...KEYS].length <= inner ? KEYS : KEYS_SHORT}</Text> : null}
    </Box>
  )
}
