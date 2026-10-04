import type { Timer } from 'claude-code'
import type { RecentState, TrackedTask } from '../types/index.d.ts'
import { getTask } from './client.ts'
import { describeOutcome } from './format.ts'
import { noteState, readRecent, waitingCount } from './recent.ts'
import { loadWorkers, noteFailure, targetOf, type Host } from './registry.ts'
import { statusText } from './ui/status.ts'
import { isLive } from './wire.ts'

export const POLL_MS = 5000
export const POLL_TIMEOUT_MS = 15000
export const MAX_FAILURES = 6

let ticker: Timer | undefined
let busy = false

export async function runningTasks(host: Host): Promise<TrackedTask[]> {
  return (await host.readTasks()).value ?? []
}

export async function showStatus(host: Host): Promise<void> {
  host.status(statusText((await runningTasks(host)).length, waitingCount(await readRecent(host))))
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

export async function resume(host: Host): Promise<void> {
  if ((await runningTasks(host)).length) await update(host, tasks => tasks)
  else await showStatus(host)
}

// $.http.fetch has no timeout of its own.
export function timeoutOr<T>(host: Host, work: Promise<T>, ms = POLL_TIMEOUT_MS): Promise<T> {
  return Promise.race([work, host.sleep(ms).then((): never => { throw new Error('timed out') })])
}

type Seen = { state: RecentState; text: string }
type Result = { task: TrackedTask; live?: TrackedTask; note?: string; failed?: true; seen?: Seen }

async function pollOne(host: Host, t: TrackedTask, workers: Awaited<ReturnType<typeof loadWorkers>>): Promise<Result> {
  const w = workers[t.worker]
  if (!w) return { task: t, note: `${t.worker} task ${t.taskId}: the worker was removed, so it is no longer tracked.`, seen: { state: 'removed', text: 'worker removed' } }
  try {
    const out = await timeoutOr(host, getTask(host.fetch, await targetOf(host, w), t.taskId))
    const seen = { state: out.state, text: out.text }
    return isLive(out.state) ? { task: t, live: { ...t, state: out.state, failures: 0 }, seen } : { task: t, note: describeOutcome(w.alias, out), seen }
  } catch (err) {
    noteFailure(w, err)
    return { task: t, failed: true }
  }
}

export async function tick(host: Host): Promise<void> {
  if (busy) return
  busy = true
  const notes: string[] = []
  try {
    const workers = await loadWorkers(host)
    const results = await Promise.all((await runningTasks(host)).map(t => pollOne(host, t, workers)))
    const byId = new Map(results.map(r => [r.task.taskId, r]))
    notes.push(...results.flatMap(r => (r.note ? [r.note] : [])))
    // update may run its callback again after a version miss, so lost-contact notes are keyed, not pushed.
    const lost = new Map<string, { task: TrackedTask; note: string }>()
    await update(host, tasks => {
      lost.clear()
      return tasks.flatMap(t => {
        const r = byId.get(t.taskId)
        if (!r) return [t]
        if (r.live) return [r.live]
        if (!r.failed) return []
        if (t.failures + 1 < MAX_FAILURES) return [{ ...t, failures: t.failures + 1 }]
        lost.set(t.taskId, { task: t, note: `${t.worker} task ${t.taskId}: lost contact with the worker after ${MAX_FAILURES} failed checks. Use the task tool to try again.` })
        return []
      })
    })
    notes.push(...[...lost.values()].map(l => l.note))
    for (const r of results) if (r.seen) await noteState(host, r.task.worker, r.task.taskId, r.seen.state, r.seen.text)
    for (const l of lost.values()) await noteState(host, l.task.worker, l.task.taskId, 'unknown', l.note)
    await showStatus(host)
  } finally {
    busy = false
  }
  if (notes.length) {
    await host.wake(`A2A ${notes.length === 1 ? 'task finished' : 'tasks finished'}:\n\n${notes.join('\n\n---\n\n')}`)
  }
}
