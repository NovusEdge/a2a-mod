import type { StateRead } from 'claude-code'
import type { CallInfo, RecentState, RecentTask } from '../types/index.d.ts'
import { printable } from './format.ts'
import type { Host } from './registry.ts'

export const RECENT_MAX = 50
// Markdown draws at most 10,000 characters.
export const RESULT_MAX = 10_000
// 50 rows of unbounded messages would push the pane past the engine's 100,000-character tree limit.
export const TEXT_MAX = 500
export const SHOW_MS = 10 * 60_000
export const DURATIONS_MAX = 10
const CALLS_MAX = 200

export const isRunning = (s: RecentState) => s === 'submitted' || s === 'working'
export const isWaiting = (s: RecentState) => s === 'input-required'
export const isOpen = (t: RecentTask) => isRunning(t.state) || isWaiting(t.state)

export function cut(text: string): string {
  const clean = printable(text)
  return clean.length > RESULT_MAX ? `${clean.slice(0, RESULT_MAX - 1)}…` : clean
}

export function progressOf(text: string): number | undefined {
  const m = /(\d{1,3})\s?%/.exec(text)
  const n = m ? Number(m[1]) : NaN
  return n >= 0 && n <= 100 ? n : undefined
}

// Past RECENT_MAX the oldest finished rows go first; a running or waiting row is dropped only
// when every row is one.
function trim(list: RecentTask[]): RecentTask[] {
  if (list.length <= RECENT_MAX) return list
  const done = list.filter(t => !isOpen(t))
  const keepDone = new Set(done.slice(0, Math.max(0, RECENT_MAX - (list.length - done.length))))
  return list.filter(t => isOpen(t) || keepDone.has(t)).slice(0, RECENT_MAX)
}

/** Newest first. A changed row keeps its place; a new one goes on top; `undefined` drops it. */
export function put(list: readonly RecentTask[], taskId: string, change: (held: RecentTask | undefined) => RecentTask | undefined): RecentTask[] {
  const held = list.find(t => t.taskId === taskId)
  const next = change(held)
  if (!held) return trim(next ? [next, ...list] : [...list])
  return trim(list.flatMap(t => (t === held ? (next ? [next] : []) : [t])))
}

/** What the pane and band show: running and waiting rows, and rows that ended in the last 10 minutes. */
export function visible(list: readonly RecentTask[], now: number): RecentTask[] {
  return list.filter(t => isOpen(t) || now - (t.endedAt ?? t.startedAt) < SHOW_MS)
}

async function rewrite<T>(read: () => Promise<StateRead<T>>, write: (value: T, ifVersion: number) => Promise<boolean>, change: (held: T | undefined) => T): Promise<T> {
  for (;;) {
    const held = await read()
    const next = change(held.value)
    if (await write(next, held.version)) return next
  }
}

export const readRecent = async (host: Host) => (await host.readRecent()).value ?? []

export const changeRecent = (host: Host, taskId: string, change: (held: RecentTask | undefined) => RecentTask | undefined) =>
  rewrite(host.readRecent, host.writeRecent, list => put(list ?? [], taskId, change))

export async function noteCall(host: Host, id: string, info: CallInfo): Promise<void> {
  await rewrite(host.readCalls, host.writeCalls, calls => {
    const next = { ...calls, [id]: info }
    const ids = Object.keys(next)
    for (const old of ids.slice(0, Math.max(0, ids.length - CALLS_MAX))) delete next[old]
    return next
  })
}

/** A send went out: a new row, or a waiting row answered (the first answer is the one kept). */
export async function noteSent(host: Host, t: Pick<RecentTask, 'worker' | 'taskId' | 'contextId' | 'text' | 'state'>, by?: 'user' | 'claude'): Promise<void> {
  const now = await host.now()
  await changeRecent(host, t.taskId, held => {
    if (!held) return { ...t, text: printable(t.text).slice(0, TEXT_MAX), startedAt: now, changedAt: now }
    const answeredBy = held.answeredBy ?? (isWaiting(held.state) ? by : undefined)
    return { ...held, state: t.state, changedAt: held.state === t.state ? held.changedAt : now, ...(answeredBy ? { answeredBy } : {}) }
  })
}

/** A task's latest state: progress while running, the question while waiting, the result once it ended. */
export async function noteState(host: Host, worker: string, taskId: string, state: RecentState, text: string): Promise<void> {
  const now = await host.now()
  let ran: number | undefined
  await changeRecent(host, taskId, held => {
    const { canceling, progress, ...was } = held ?? { worker, taskId, text: '', state, startedAt: now, changedAt: now }
    const base = { ...was, changedAt: was.state === state ? was.changedAt : now }
    if (isRunning(state)) {
      const pct = progressOf(text)
      return { ...base, state, ...(canceling ? { canceling } : {}), ...(pct === undefined ? {} : { progress: pct }) }
    }
    if (isWaiting(state)) return { ...base, state, result: cut(text) }
    ran = now - base.startedAt
    return { ...base, state, endedAt: now, result: cut(text) }
  })
  if (state === 'completed' && ran !== undefined) {
    const all = await host.readDurations()
    await host.writeDurations({ ...all, [worker]: [...(all[worker] ?? []), ran].slice(-DURATIONS_MAX) })
  }
}

/** `/a2a remove`: a waiting task is not polled, so the tracker would never mark it. */
export async function noteRemoved(host: Host, alias: string): Promise<void> {
  const now = await host.now()
  await rewrite(host.readRecent, host.writeRecent, list =>
    (list ?? []).map((t): RecentTask => (t.worker === alias && isOpen(t) ? { ...t, state: 'removed', changedAt: now, endedAt: now, result: 'worker removed' } : t)))
}

export const waitingCount = (list: readonly RecentTask[]) => list.filter(t => isWaiting(t.state)).length
