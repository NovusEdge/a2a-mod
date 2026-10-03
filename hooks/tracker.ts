import type { Timer } from 'claude-code'
import type { TrackedTask } from '../types/index.d.ts'
import { getTask } from './client.ts'
import { describeOutcome } from './format.ts'
import { loadWorkers, targetOf, type Host } from './registry.ts'
import { isLive } from './wire.ts'

export const POLL_MS = 5000
export const POLL_TIMEOUT_MS = 15000
export const MAX_FAILURES = 6

let ticker: Timer | undefined
let busy = false

export async function runningTasks(host: Host): Promise<TrackedTask[]> {
  return (await host.readTasks()).value ?? []
}

// Read-modify-write with ifVersion: a send can track a task while a tick is writing.
async function update(host: Host, change: (tasks: TrackedTask[]) => TrackedTask[]): Promise<TrackedTask[]> {
  for (;;) {
    const held = await host.readTasks()
    const next = change(held.value ?? [])
    if (await host.writeTasks(next, held.version)) {
      host.status(next.length ? `a2a: ${next.length} running` : undefined)
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
}

// $.http.fetch has no timeout of its own.
export function timeoutOr<T>(host: Host, work: Promise<T>, ms = POLL_TIMEOUT_MS): Promise<T> {
  return Promise.race([work, host.sleep(ms).then((): never => { throw new Error('timed out') })])
}

type Result = { taskId: string; live?: TrackedTask; note?: string; failed?: true }

async function pollOne(host: Host, t: TrackedTask, workers: Awaited<ReturnType<typeof loadWorkers>>): Promise<Result> {
  const w = workers[t.worker]
  if (!w) return { taskId: t.taskId, note: `${t.worker} task ${t.taskId}: the worker was removed, so it is no longer tracked.` }
  try {
    const out = await timeoutOr(host, getTask(host.fetch, await targetOf(host, w), t.taskId))
    return isLive(out.state) ? { taskId: t.taskId, live: { ...t, state: out.state, failures: 0 } } : { taskId: t.taskId, note: describeOutcome(w.alias, out) }
  } catch {
    return { taskId: t.taskId, failed: true }
  }
}

export async function tick(host: Host): Promise<void> {
  if (busy) return
  busy = true
  const notes: string[] = []
  try {
    const workers = await loadWorkers(host)
    const results = await Promise.all((await runningTasks(host)).map(t => pollOne(host, t, workers)))
    const byId = new Map(results.map(r => [r.taskId, r]))
    notes.push(...results.flatMap(r => (r.note ? [r.note] : [])))
    // update may run its callback again after a version miss, so lost-contact notes are keyed, not pushed.
    const lost = new Map<string, string>()
    await update(host, tasks => {
      lost.clear()
      return tasks.flatMap(t => {
        const r = byId.get(t.taskId)
        if (!r) return [t]
        if (r.live) return [r.live]
        if (!r.failed) return []
        if (t.failures + 1 < MAX_FAILURES) return [{ ...t, failures: t.failures + 1 }]
        lost.set(t.taskId, `${t.worker} task ${t.taskId}: lost contact with the worker after ${MAX_FAILURES} failed checks. Use the task tool to try again.`)
        return []
      })
    })
    notes.push(...lost.values())
  } finally {
    busy = false
  }
  if (notes.length) {
    await host.wake(`A2A ${notes.length === 1 ? 'task finished' : 'tasks finished'}:\n\n${notes.join('\n\n---\n\n')}`)
  }
}
