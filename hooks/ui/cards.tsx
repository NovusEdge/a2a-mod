import type { ElementTable, RenderElement, RenderSurface } from 'claude-code'
import type { RecentState, Worker } from '../../types/index.d.ts'
import { printable } from '../format.ts'
import { isRunning } from '../recent.ts'
import type { Palette } from './color.ts'
import { cellLen, lines, rowLines, splitLine, stillTick, wrap, type RowProps } from './draw.tsx'
import { fit, gradient, type Cell } from './fx.ts'
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

/** The state as a glyph and a word, in the state table's theme colour. A running task is "tracked": it left for the background. */
export function badge(state: RecentState | undefined, isErrored: boolean): { label: string; color: string } {
  if (!state) return isErrored ? { label: '✕ failed', color: 'error' } : { label: '✓ done', color: 'inactive' }
  if (isRunning(state)) return { label: '● tracked', color: 'warning' }
  const look = STATES[state]
  return { label: `${look.glyph} ${state === 'rejected' ? 'failed' : look.label}`, color: look.color }
}

// `width` is the card's outer width; the border and a column of padding on each side take four.
const INSET = 4
const MESSAGE_LINES = 4

const frame = (width: number) => ({ marginLeft: 2, width, flexDirection: 'column', borderStyle: 'round', borderColor: 'inactive', paddingX: 1 }) as const

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

/** `⇢ alias` with the version and organization at the right, the message under a quote bar, and while it runs an animated row. */
export function useCard(el: CardEls, d: UseCard): RenderElement {
  const { Box, Text, Client } = el
  const inner = Math.max(1, d.width - INSET)
  const left: Cell[] = [{ text: '⇢ ', color: 'inactive' }, ...gradient(fit(d.alias, Math.min(24, Math.max(1, inner - 8))), 0, d.pal)]
  const meta = [d.worker ? `A2A ${d.worker.version}` : '', d.worker?.organization ?? ''].filter(Boolean).join(' · ')
  const right: Cell[] = [{ text: fit(meta, Math.max(0, inner - cellLen(left) - 1)), color: 'inactive' }]
  const props: RowProps = { text: 'working…', state: 'working', startedAt: d.startedAt, now: d.now, progress: null, tail: null, width: inner, anim: d.anim, pal: d.pal }
  return (
    <Box {...frame(d.width)}>
      {splitLine(el, left, right, inner)}
      {wrap(d.message, inner - 2, MESSAGE_LINES).map(line => <Box><Text color="inactive">│ </Text><Text color="inactive">{line}</Text></Box>)}
      {d.isRunning
        ? Client && hasClient(d.surface)
          ? <Client key="run" module="./row.tsx" props={props} width={inner} />
          : lines(el, rowLines(props, stillTick(props)))
        : null}
    </Box>
  )
}

export type ResultCard = {
  surface: RenderSurface
  width: number
  anim: boolean
  state: RecentState | undefined
  isErrored: boolean
  text: string
  /** Typewriter key: the task id, or the call id for a reply that came back as a message. */
  playId: string
  played: boolean
  /** The tracked task, named in the line shown to the person in place of the instruction to Claude. */
  taskId?: string
}

function resultBody(el: CardEls, d: ResultCard, clientKey: string): RenderElement {
  const { Text, Client } = el
  const types = d.state === 'completed' && d.anim && !d.played && hasClient(d.surface)
  return types && Client
    ? <Client key={clientKey} module="./typewriter.tsx" props={{ id: d.playId, text: d.text, anim: true }} />
    : <Text>{d.text}</Text>
}

export type WakeNote = { worker: string; taskId: string | undefined; state: RecentState | undefined; body: string }

const WAKE_HEAD = /^A2A (task|tasks) finished:\n\n/
// A worker's result may hold its own `---` rule, so a split needs the next note to open the way
// describeOutcome and the tracker write one: `a task t is state`, `a task t:` or `a replied`.
const NOTE_BREAK = /\n\n---\n\n(?=\S+ (?:replied[ :]|task [^\s:]+(?: is [a-z-]+[ .(]|:)))/

/** The notes of a wake prompt the tracker wrote, or undefined for any other text. */
export function wakeNotes(text: string): WakeNote[] | undefined {
  const head = WAKE_HEAD.exec(text)
  if (!head) return undefined
  const rest = printable(text.slice(head[0].length))
  // The tracker writes the singular head for exactly one note.
  return (head[1] === 'task' ? [rest] : rest.split(NOTE_BREAK)).map(note => {
    const id = /^(\S+) task ([^\s:]+)/.exec(note)
    const said = /^\S+ task \S+ is ([a-z-]+)/.exec(note)?.[1] as RecentState | undefined
    const gap = note.indexOf('\n\n')
    return {
      worker: id?.[1] ?? note.split(' ')[0] ?? '',
      taskId: id?.[2],
      state: said && said in STATES ? said : undefined,
      body: gap < 0 ? note : note.slice(gap + 2),
    }
  })
}

export type WakeCard = { surface: RenderSurface; width: number; anim: boolean; pal: Palette; notes: (WakeNote & { played: boolean })[] }

/** One box per task the wake prompt reports: `⇠ alias` with the state at the right, then its result indented. */
export function wakeCard(el: CardEls, d: WakeCard): RenderElement {
  const { Box } = el
  const inner = Math.max(1, d.width - INSET)
  return (
    <Box flexDirection="column">
      {d.notes.map(n => {
        const b = badge(n.state, false)
        // Without a task id nothing tells one wake's note from another's, so it never types in.
        const playId = n.taskId ?? ''
        const left: Cell[] = [{ text: '⇠ ', color: 'inactive' }, ...gradient(fit(n.worker, Math.min(24, Math.max(1, inner - cellLen([{ text: b.label }]) - 3))), 0, d.pal)]
        return (
          <Box {...frame(d.width)}>
            {splitLine(el, left, [{ text: b.label, color: b.color }], inner)}
            <Box marginLeft={2} flexDirection="column">
              {resultBody(el, { surface: d.surface, width: d.width, anim: d.anim, state: n.state, isErrored: false, text: n.body, playId, played: n.played || !n.taskId }, `type:${playId}`)}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** A state badge, then the result indented; a completed result types itself in once, and a tracked task reads as a line for a person. */
export function resultCard(el: CardEls, d: ResultCard): RenderElement {
  const { Box, Text } = el
  const b = badge(d.state, d.isErrored)
  // The tool result Claude reads says "do not poll"; the person sees what it means for them.
  const tracked = `tracked${d.taskId ? ` · task ${printable(d.taskId).slice(0, 8)}` : ''} · you'll be told when it lands`
  return (
    <Box {...frame(d.width)}>
      <Text color={b.color}>{fit(b.label, Math.max(1, d.width - INSET))}</Text>
      <Box marginLeft={2} flexDirection="column">
        {d.state && isRunning(d.state)
          ? wrap(tracked, Math.max(1, d.width - INSET - 2), 4).map(line => <Text color="inactive">{line}</Text>)
          : resultBody(el, d, 'type')}
      </Box>
    </Box>
  )
}
