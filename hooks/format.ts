import type { Outcome, RecentState } from '../types/index.d.ts'

const MAX = 8000
// The task tool is where the note on a cut result sends Claude, so it gets a far larger limit.
export const FULL_MAX = 100_000

// A Text or Markdown holding ESC, BEL or another control character is refused, and the whole tree
// with it. Worker output often carries ANSI colour codes.
export function printable(text: string): string {
  return text
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
    .replace(/(?![‌‍])\p{Cf}/gu, '')
}

// Bidi overrides can make an endpoint or a name read as another one. Zero-width joiners stay in
// printable text because emoji sequences and some scripts need them, but a one-line field has no use for them.
export const plain = (text: string): string => printable(text).replace(/\p{Cf}/gu, '')

export function truncate(text: string, max = MAX): string {
  if (text.length <= max) return text
  const rest = max < FULL_MAX ? 'call the task tool for the full result' : 'the rest is not shown'
  return `${text.slice(0, max)}\n\n[truncated ${text.length - max} characters; ${rest}]`
}

/** One task that ended, for the wake: `body` is what Claude reads, `worker`/`taskId`/`state` make the line the person reads. */
export type WakeItem = { worker: string; taskId?: string; state: RecentState; body: string; /** Replaces the state's word in the line. */ word?: string }

const WAKE_LINE_MAX = 100
const WAKE_WORD: Partial<Record<RecentState, string>> = {
  'input-required': 'needs input', 'auth-required': 'needs auth', unknown: 'state unknown', removed: 'worker removed',
}
const wakeMark = (s: RecentState) => (s === 'completed' ? '✓' : s === 'input-required' || s === 'auth-required' ? '?' : '✕')
const oneLine = (s: string) => plain(s).replace(/\s+/g, ' ').trim()

/** The only text the person sees when a task wakes Claude: one line, no result, no token. */
export function wakeLine(items: readonly WakeItem[]): string {
  const [one] = items
  const text = items.length === 1 && one
    ? `a2a: ${oneLine(one.worker)} task${one.taskId ? ` ${oneLine(one.taskId).slice(0, 4)}…` : ''} ${one.word ?? WAKE_WORD[one.state] ?? one.state}`
    : `a2a: ${items.length} tasks finished (${items.map(i => `${oneLine(i.worker)} ${wakeMark(i.state)}`).join(', ')})`
  return [...text].length <= WAKE_LINE_MAX ? text : `${[...text].slice(0, WAKE_LINE_MAX - 1).join('')}…`
}

/** What Claude reads beside the wake line: the results, and how to answer a worker that asked a question. */
export function wakeDetail(items: readonly WakeItem[]): string {
  const notes = items.map(i => (i.state === 'input-required' && i.taskId
    ? `${i.body}\n\nTo answer, call the send tool with worker "${i.worker}", taskId "${i.taskId}" and your answer as message.`
    : i.body))
  return `[a2a-mod] Task-completion notice from the a2a-mod mod, not the user's words.\n\nA2A ${items.length === 1 ? 'task finished' : 'tasks finished'}:\n\n${notes.join('\n\n---\n\n')}`
}

export function describeOutcome(alias: string, o: Outcome, max = MAX): string {
  const ctx = o.contextId ? ` (contextId ${o.contextId})` : ''
  if (o.kind === 'message') return truncate(`${alias} replied${ctx}:\n\n${o.text || '(empty reply)'}`, max)
  const head = `${alias} task ${o.taskId} is ${o.state}${ctx}.`
  return truncate(o.text ? `${head}\n\n${o.text}` : head, max)
}
