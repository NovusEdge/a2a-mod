import type { Outcome } from '../types/index.d.ts'

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

export function describeOutcome(alias: string, o: Outcome, max = MAX): string {
  const ctx = o.contextId ? ` (contextId ${o.contextId})` : ''
  if (o.kind === 'message') return truncate(`${alias} replied${ctx}:\n\n${o.text || '(empty reply)'}`, max)
  const head = `${alias} task ${o.taskId} is ${o.state}${ctx}.`
  return truncate(o.text ? `${head}\n\n${o.text}` : head, max)
}
