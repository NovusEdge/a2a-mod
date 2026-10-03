import type { Outcome } from '../types/index.d.ts'

const MAX = 8000

export function truncate(text: string, max = MAX): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[truncated ${text.length - max} characters; call the task tool for the full result]`
}

export function describeOutcome(alias: string, o: Outcome): string {
  const ctx = o.contextId ? ` (contextId ${o.contextId})` : ''
  if (o.kind === 'message') return truncate(`${alias} replied${ctx}:\n\n${o.text || '(empty reply)'}`)
  const head = `${alias} task ${o.taskId} is ${o.state}${ctx}.`
  return truncate(o.text ? `${head}\n\n${o.text}` : head)
}
