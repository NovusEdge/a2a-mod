import type { Timer } from 'claude-code'
import type { RecentState, TaskState, TrackedTask } from '../types/index.d.ts'
import { getTask } from './client.ts'
import { describeOutcome, wakeDetail, wakeLine, type WakeItem } from './format.ts'
import { isOpen, isRunning, noteState, readRecent } from './recent.ts'
import { loadWorkers, noteFailure, own, targetOf, type Host } from './registry.ts'
import { STATUS_MS, statusText } from './ui/status.ts'
import { isLive } from './wire.ts'

export const POLL_MS = 5000
export const POLL_TIMEOUT_MS = 15000
export const MAX_FAILURES = 6

let ticker: Timer | undefined
let statusTicker: Timer | undefined
let busy = false

export async function runningTasks(host: Host): Promise<TrackedTask[]> {
  return (await host.readTasks()).value ?? []
}

// The line has a clock and a spinner in it, so it is redrawn each second while a task runs or a
// "done" line is waiting out its five seconds. A waiting question is static and needs no ticker.
export async function showStatus(host: Host): Promise<void> {
  const rows = await readRecent(host)
  const text = statusText(rows, await host.now(), host.anim)
  host.status(text)
  const needsTick = rows.some(t => isRunning(t.state)) || (text !== undefined && !rows.some(isOpen))
  if (!needsTick) { statusTicker?.cancel(); statusTicker = undefined }
  else if (!statusTicker) statusTicker = host.every(STATUS_MS, () => showStatus(host))
}

// Read-modify-write with ifVersion: a send can track a task while a tick is writing.
async function update(host: Host, change: (tasks: TrackedTask[]) => TrackedTask[]): Promise<TrackedTask[]> {
  for (;;) {
    const held = await host.readTasks()
    const next = change(held.value ?? [])
    if (await host.writeTasks(next, held.version)) {
      await showStatus(host)
      if (!next.length) { ticker?.cancel(); ticker = undefined }
      else if (!ticker) ticker = host.every(POLL_MS, () => void tick(host))
      return next
    }
  }
}

export async function track(host: Host, t: Omit<TrackedTask, 'failures'>): Promise<void> {
  await update(host, tasks => [...tasks.filter(x => x.taskId !== t.taskId), { ...t, failures: 0 }])
}

// A reload drops the module state, and with it both tickers, while tasks are still live. A reload
// between `send` writing its recent row and tracking the task (or an error there that is not an
// A2AError) leaves a running row nothing polls, which would keep the status line spinning.
export async function resume(host: Host): Promise<void> {
  const tracked = new Set((await runningTasks(host)).map(t => t.taskId))
  const orphans = (await readRecent(host)).filter(t => isRunning(t.state) && !tracked.has(t.taskId))
  if (orphans.length) {
    const workers = await loadWorkers(host)
    for (const t of orphans) {
      if (!own(workers, t.worker)) { await noteState(host, t.worker, t.taskId, 'removed', 'worker removed'); continue }
      await track(host, { worker: t.worker, taskId: t.taskId, contextId: t.contextId, state: t.state as TaskState, startedAt: t.startedAt })
      tracked.add(t.taskId)
    }
  }
  if (tracked.size) await update(host, tasks => tasks)
  else await showStatus(host)
}

// $.http.fetch has no timeout of its own.
export function timeoutOr<T>(host: Host, work: Promise<T>, ms = POLL_TIMEOUT_MS): Promise<T> {
  return Promise.race([work, host.sleep(ms).then((): never => { throw new Error('timed out') })])
}

type Seen = { state: RecentState; text: string }
type Result = { task: TrackedTask; live?: TrackedTask; note?: WakeItem; failed?: true; seen?: Seen }

async function pollOne(host: Host, t: TrackedTask, workers: Awaited<ReturnType<typeof loadWorkers>>): Promise<Result> {
  const w = own(workers, t.worker)
  if (!w) return { task: t, note: { worker: t.worker, taskId: t.taskId, state: 'removed', body: `${t.worker} task ${t.taskId}: the worker was removed, so it is no longer tracked.` }, seen: { state: 'removed', text: 'worker removed' } }
  try {
    const out = await timeoutOr(host, getTask(host.fetch, await targetOf(host, w), t.taskId))
    const seen = { state: out.state, text: out.text }
    return isLive(out.state) ? { task: t, live: { ...t, state: out.state, failures: 0 }, seen } : { task: t, note: { worker: w.alias, taskId: t.taskId, state: out.state, body: describeOutcome(w.alias, out) }, seen }
  } catch (err) {
    noteFailure(w, err)
    return { task: t, failed: true }
  }
}

export async function tick(host: Host): Promise<void> {
  if (busy) return
  busy = true
  const notes: WakeItem[] = []
  try {
    const workers = await loadWorkers(host)
    const results = await Promise.all((await runningTasks(host)).map(t => pollOne(host, t, workers)))
    const byId = new Map(results.map(r => [r.task.taskId, r]))
    notes.push(...results.flatMap(r => (r.note ? [r.note] : [])))
    // update may run its callback again after a version miss, so lost-contact notes are keyed, not pushed.
    const lost = new Map<string, { task: TrackedTask; note: WakeItem }>()
    await update(host, tasks => {
      lost.clear()
      return tasks.flatMap(t => {
        const r = byId.get(t.taskId)
        if (!r) return [t]
        if (r.live) return [r.live]
        if (!r.failed) return []
        if (t.failures + 1 < MAX_FAILURES) return [{ ...t, failures: t.failures + 1 }]
        lost.set(t.taskId, { task: t, note: { worker: t.worker, taskId: t.taskId, state: 'unknown', word: 'lost contact', body: `${t.worker} task ${t.taskId}: lost contact with the worker after ${MAX_FAILURES} failed checks. Use the task tool to try again.` } })
        return []
      })
    })
    notes.push(...[...lost.values()].map(l => l.note))
    for (const r of results) if (r.seen) await noteState(host, r.task.worker, r.task.taskId, r.seen.state, r.seen.text)
    for (const l of lost.values()) await noteState(host, l.task.worker, l.task.taskId, 'unknown', l.note.body)
    await showStatus(host)
  } finally {
    busy = false
  }
  if (notes.length) await host.wake(wakeLine(notes), wakeDetail(notes))
}
