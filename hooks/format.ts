import type { Outcome } from '../types/index.d.ts'

const MAX = 8000
// The task tool is where the note on a cut result sends Claude, so it gets a far larger limit.
export const FULL_MAX = 100_000

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
